import type { Logger } from "pino";
import WebSocket, { type RawData } from "ws";
import type { AppConfig } from "../../config/config.js";
import type { RocketChatEvent, WebhookResult } from "../../domain/types.js";
import { normalizeDdpMessage } from "../../services/ddp-message-parser.service.js";

interface PendingRequest {
  resolve(): void;
  reject(error: Error): void;
}

interface DdpPayload {
  msg?: string;
  id?: string;
  error?: unknown;
  reason?: string;
  subs?: string[];
  collection?: string;
  fields?: {
    eventName?: string;
    args?: unknown[];
  };
}

export class RocketChatDdpListener {
  private socket: WebSocket | undefined;
  private connecting: Promise<void> | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private connectionRequest: PendingRequest | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private stopped = true;
  private sequence = 0;

  constructor(
    private readonly config: AppConfig["rocketChat"],
    private readonly onEvent: (event: RocketChatEvent) => WebhookResult,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    try {
      await this.connect();
    } catch (error) {
      this.stopped = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
      await this.closeSocket();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.rejectPending(new Error("DDP listener stopped"));
    await this.closeSocket();
  }

  private async connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    const attempt = this.establishConnection();
    this.connecting = attempt;
    try {
      await attempt;
    } finally {
      if (this.connecting === attempt) this.connecting = undefined;
    }
  }

  private async establishConnection(): Promise<void> {
    const socket = new WebSocket(ddpWebSocketUrl(this.config.url));
    this.socket = socket;
    socket.on("message", (data) => this.handleRawMessage(data));
    socket.on("close", () => this.handleClose(socket));
    socket.on("error", (error) => {
      this.logger.warn({ err: error }, "Rocket.Chat DDP socket error");
    });

    await withTimeout(waitForOpen(socket), this.config.ddpConnectTimeoutMs, "DDP socket connection");
    await this.connectDdp();
    await this.call("login", [{ resume: this.config.authToken }]);
    const subscriptionTargets = this.config.ddpRoomIds.length > 0
      ? this.config.ddpRoomIds
      : ["__my_messages__"];
    await Promise.all(subscriptionTargets.map((roomId) => this.subscribe(roomId)));
    this.logger.info(
      {
        scope: this.config.ddpRoomIds.length > 0 ? "configured rooms" : "joined rooms",
        roomIds: this.config.ddpRoomIds,
      },
      "Rocket.Chat DDP listener connected",
    );
  }

  private async connectDdp(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.connectionRequest = {
        resolve,
        reject: (error) => reject(error),
      };
    });
    this.send({ msg: "connect", version: "1", support: ["1"] });
    try {
      await withTimeout(promise, this.config.ddpConnectTimeoutMs, "DDP protocol handshake");
    } finally {
      this.connectionRequest = undefined;
    }
  }

  private async call(method: string, params: unknown[]): Promise<void> {
    const id = this.nextId(method);
    const promise = this.registerPending(id);
    this.send({ msg: "method", method, id, params });
    try {
      await withTimeout(promise, this.config.ddpConnectTimeoutMs, `DDP method ${method}`);
    } finally {
      this.pending.delete(id);
    }
  }

  private async subscribe(roomId: string): Promise<void> {
    const id = this.nextId("room");
    const promise = this.registerPending(id);
    this.send({
      msg: "sub",
      id,
      name: "stream-room-messages",
      params: [roomId, false],
    });
    try {
      await withTimeout(
        promise,
        this.config.ddpConnectTimeoutMs,
        `DDP room subscription ${roomId}`,
      );
    } finally {
      this.pending.delete(id);
    }
  }

  private registerPending(id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, {
        resolve: () => {
          this.pending.delete(id);
          resolve();
        },
        reject: (error) => {
          this.pending.delete(id);
          reject(error);
        },
      });
    });
  }

  private handleRawMessage(data: RawData): void {
    let payload: DdpPayload;
    try {
      payload = JSON.parse(data.toString()) as DdpPayload;
    } catch (error) {
      this.logger.warn({ err: error }, "ignored invalid Rocket.Chat DDP payload");
      return;
    }

    switch (payload.msg) {
      case "ping":
        this.send({ msg: "pong", ...(payload.id ? { id: payload.id } : {}) });
        return;
      case "connected":
        this.connectionRequest?.resolve();
        return;
      case "failed":
        this.connectionRequest?.reject(
          new Error(payload.reason || "Rocket.Chat rejected the DDP handshake"),
        );
        return;
      case "result":
        this.resolveResult(payload);
        return;
      case "ready":
        for (const id of payload.subs ?? []) this.pending.get(id)?.resolve();
        return;
      case "nosub":
        if (payload.id) {
          this.pending.get(payload.id)?.reject(
            new Error(ddpErrorMessage(payload.error, "Rocket.Chat rejected a DDP subscription")),
          );
        }
        return;
      case "changed":
        this.handleChanged(payload);
        return;
      default:
        return;
    }
  }

  private resolveResult(payload: DdpPayload): void {
    if (!payload.id) return;
    const request = this.pending.get(payload.id);
    if (!request) return;
    if (payload.error) {
      request.reject(new Error(ddpErrorMessage(payload.error, "Rocket.Chat DDP method failed")));
      return;
    }
    request.resolve();
  }

  private handleChanged(payload: DdpPayload): void {
    if (payload.collection !== "stream-room-messages") return;
    const message = payload.fields?.args?.[0];
    if (!message) return;
    try {
      const event = normalizeDdpMessage(message);
      if (!event) return;
      const result = this.onEvent(event);
      if (!result.accepted) {
        this.logger.debug(
          { messageId: event.messageId, roomId: event.roomId, reason: result.reason },
          "Rocket.Chat DDP message ignored",
        );
      }
    } catch (error) {
      this.logger.warn({ err: error }, "ignored unsupported Rocket.Chat DDP message");
    }
  }

  private handleClose(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = undefined;
    this.rejectPending(new Error("Rocket.Chat DDP connection closed"));
    if (!this.stopped) {
      this.logger.warn("Rocket.Chat DDP connection closed; scheduling reconnect");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.stopped) return;
      void this.connect().catch((error: unknown) => {
        this.logger.error({ err: error }, "Rocket.Chat DDP reconnect failed");
        void this.closeSocket().finally(() => this.scheduleReconnect());
      });
    }, this.config.ddpReconnectMs);
    this.reconnectTimer.unref();
  }

  private rejectPending(error: Error): void {
    this.connectionRequest?.reject(error);
    this.connectionRequest = undefined;
    for (const request of [...this.pending.values()]) request.reject(error);
    this.pending.clear();
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Rocket.Chat DDP socket is not open");
    }
    this.socket.send(JSON.stringify(payload));
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private async closeSocket(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
      return;
    }
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    socket.close(1000, "bot shutting down");
    try {
      await withTimeout(closed, 2_000, "DDP socket close");
    } catch {
      socket.terminate();
    }
  }
}

function ddpWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/websocket`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error("Rocket.Chat DDP socket closed before connecting"));
    };
    const cleanup = (): void => {
      socket.off("open", onOpen);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ddpErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const value = error as { message?: unknown; reason?: unknown };
  if (typeof value.reason === "string") return value.reason;
  if (typeof value.message === "string") return value.message;
  return fallback;
}
