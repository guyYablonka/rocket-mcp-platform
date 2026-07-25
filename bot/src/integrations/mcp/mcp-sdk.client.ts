import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AppConfig } from "../../config/config.js";
import type { McpClient } from "../../domain/ports.js";
import type { McpTool } from "../../domain/types.js";

export class McpSdkClient implements McpClient {
  private readonly client = new Client(
    { name: "rocket-mcp-bot", version: "0.2.0" },
    { capabilities: {} },
  );
  private readonly transport: StreamableHTTPClientTransport;
  private connected = false;

  constructor(config: AppConfig["mcp"], bearerToken: string) {
    const headers = {
      ...config.headers,
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    };
    const timedFetch: typeof fetch = (input, init = {}) => {
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
      return fetch(input, { ...init, signal });
    };
    this.transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
      fetch: timedFetch,
    });
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect();
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema as Record<string, unknown>,
      })));
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.connect();
    return this.client.callTool({ name, arguments: args });
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
    } else {
      await this.transport.close();
    }
    this.connected = false;
  }

  private async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect(this.transport);
    this.connected = true;
  }
}
