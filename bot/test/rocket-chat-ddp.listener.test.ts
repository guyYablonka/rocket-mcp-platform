import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { RocketChatEvent } from "../src/domain/types.js";
import { RocketChatDdpListener } from "../src/integrations/rocketchat/rocket-chat-ddp.listener.js";
import { testConfig } from "./fixtures.js";

const openServers: Array<{ http: Server; ws: WebSocketServer }> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async ({ http, ws }) => {
    for (const client of ws.clients) client.terminate();
    await new Promise<void>((resolve) => ws.close(() => resolve()));
    http.close();
    await once(http, "close");
  }));
});

describe("RocketChatDdpListener", () => {
  it("logs in, subscribes, handles messages and ping frames", async () => {
    const { http, ws, url } = await createDdpServer();
    openServers.push({ http, ws });
    const clientConnected = new Promise<WebSocket>((resolve) => ws.once("connection", resolve));
    const protocolMessages: Array<Record<string, unknown>> = [];
    const pongReceived = new Promise<void>((resolve) => {
      ws.on("connection", (socket) => {
        socket.on("message", (data) => {
          const payload = JSON.parse(data.toString()) as Record<string, unknown>;
          protocolMessages.push(payload);
          if (payload.msg === "connect") {
            socket.send(JSON.stringify({ msg: "connected", session: "session" }));
          } else if (payload.msg === "method") {
            socket.send(JSON.stringify({ msg: "result", id: payload.id, result: { id: "BOT" } }));
          } else if (payload.msg === "sub") {
            socket.send(JSON.stringify({ msg: "ready", subs: [payload.id] }));
          } else if (payload.msg === "pong") {
            resolve();
          }
        });
      });
    });

    const events: RocketChatEvent[] = [];
    const config = testConfig().rocketChat;
    config.url = url;
    config.transport = "ddp";
    config.ddpRoomIds = [];
    const listener = new RocketChatDdpListener(
      config,
      (event) => {
        events.push(event);
        return { accepted: true, status: 202 };
      },
      pino({ level: "silent" }),
    );

    await listener.start();
    const client = await clientConnected;
    client.send(JSON.stringify({
      msg: "changed",
      collection: "stream-room-messages",
      fields: {
        eventName: "ROOM",
        args: [{
          _id: "MSG",
          rid: "ROOM",
          msg: "@helper help",
          u: { _id: "USER", username: "alice" },
        }],
      },
    }));
    client.send(JSON.stringify({ msg: "ping", id: "heartbeat" }));

    await vi.waitFor(() => expect(events).toHaveLength(1));
    await pongReceived;
    expect(protocolMessages).toContainEqual({
      msg: "method",
      method: "login",
      id: "login-1",
      params: [{ resume: "bot-token" }],
    });
    expect(protocolMessages).toContainEqual({
      msg: "sub",
      id: "room-2",
      name: "stream-room-messages",
      params: ["__my_messages__", false],
    });
    expect(events[0]).toMatchObject({
      roomId: "ROOM",
      messageId: "MSG",
      userId: "USER",
      username: "alice",
      text: "@helper help",
    });

    await listener.stop();
  });

  it("reconnects and restores room subscriptions", async () => {
    const { http, ws, url } = await createDdpServer();
    openServers.push({ http, ws });
    const clients: WebSocket[] = [];
    const subscriptions: string[] = [];
    ws.on("connection", (socket) => {
      clients.push(socket);
      socket.on("message", (data) => {
        const payload = JSON.parse(data.toString()) as {
          msg?: string;
          id?: string;
          name?: string;
          params?: unknown[];
        };
        if (payload.msg === "connect") {
          socket.send(JSON.stringify({ msg: "connected", session: `session-${clients.length}` }));
        } else if (payload.msg === "method") {
          socket.send(JSON.stringify({ msg: "result", id: payload.id, result: { id: "BOT" } }));
        } else if (payload.msg === "sub") {
          subscriptions.push(String(payload.params?.[0]));
          socket.send(JSON.stringify({ msg: "ready", subs: [payload.id] }));
        }
      });
    });

    const events: RocketChatEvent[] = [];
    const config = testConfig().rocketChat;
    config.url = url;
    config.transport = "ddp";
    config.ddpRoomIds = ["ROOM"];
    config.ddpReconnectMs = 10;
    const listener = new RocketChatDdpListener(
      config,
      (event) => {
        events.push(event);
        return { accepted: true, status: 202 };
      },
      pino({ level: "silent" }),
    );

    await listener.start();
    clients[0]?.terminate();
    await vi.waitFor(() => expect(clients).toHaveLength(2));
    clients[1]?.send(JSON.stringify({
      msg: "changed",
      collection: "stream-room-messages",
      fields: {
        eventName: "ROOM",
        args: [{
          _id: "AFTER-RECONNECT",
          rid: "ROOM",
          msg: "@helper help",
          u: { _id: "USER", username: "alice" },
        }],
      },
    }));

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(subscriptions).toEqual(["ROOM", "ROOM"]);
    await listener.stop();
  });
});

async function createDdpServer(): Promise<{
  http: Server;
  ws: WebSocketServer;
  url: string;
}> {
  const http = createServer();
  const ws = new WebSocketServer({ server: http, path: "/websocket" });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address() as AddressInfo;
  return {
    http,
    ws,
    url: `http://127.0.0.1:${address.port}`,
  };
}
