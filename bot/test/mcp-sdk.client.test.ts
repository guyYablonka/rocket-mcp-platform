import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { McpSdkClient } from "../src/integrations/mcp/mcp-sdk.client.js";
import { testConfig } from "./fixtures.js";

describe("McpSdkClient", () => {
  const openServers: Array<ReturnType<typeof createServer>> = [];

  afterEach(async () => {
    await Promise.all(openServers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }));
  });

  it("initializes a Streamable HTTP session, lists tools, and calls one", async () => {
    const seen: Array<{
      method: string;
      session?: string;
      protocolVersion?: string;
    }> = [];
    const server = createServer(async (request, response) => {
      if (request.method === "DELETE") {
        response.writeHead(200).end();
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        id?: number;
        method: string;
      };
      seen.push({
        method: body.method,
        ...(request.headers["mcp-session-id"]
          ? { session: String(request.headers["mcp-session-id"]) }
          : {}),
        ...(request.headers["mcp-protocol-version"]
          ? { protocolVersion: String(request.headers["mcp-protocol-version"]) }
          : {}),
      });
      if (body.method === "notifications/initialized") {
        response.writeHead(202).end();
        return;
      }
      const results: Record<string, unknown> = {
        initialize: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          serverInfo: { name: "test", version: "1" },
        },
        "tools/list": {
          tools: [{ name: "ping", inputSchema: { type: "object" } }],
        },
        "tools/call": {
          content: [{ type: "text", text: "pong" }],
        },
      };
      response.writeHead(200, {
        "Content-Type": "application/json",
        ...(body.method === "initialize"
          ? { "Mcp-Session-Id": "session-1" }
          : {}),
      });
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: results[body.method],
      }));
    });
    openServers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    const config = testConfig().mcp;
    const client = new McpSdkClient({
      ...config,
      url: `http://127.0.0.1:${address.port}/mcp`,
    }, "");

    try {
      expect((await client.listTools())[0]?.name).toBe("ping");
      expect(JSON.stringify(await client.callTool("ping", {}))).toContain("pong");
      expect(seen.map((item) => item.method)).toEqual([
        "initialize",
        "notifications/initialized",
        "tools/list",
        "tools/call",
      ]);
      expect(seen[1]?.session).toBe("session-1");
      expect(seen.slice(1).map((item) => item.protocolVersion))
        .toEqual(["2025-11-25", "2025-11-25", "2025-11-25"]);
      expect(seen.every((item) => !item.protocolVersion?.includes(","))).toBe(true);
    } finally {
      await client.close();
    }
  });
});
