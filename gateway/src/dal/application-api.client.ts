import { randomUUID } from "node:crypto";
import type { GatewayConfig } from "../config/env.js";
import type { Actor, McpToolResult, ToolDefinition, UserLink } from "../domain/types.js";
import { buildApplicationRequest } from "./file-tool-registry.repository.js";
import { TokenExchangeService } from "../bl/token-exchange.service.js";

const stringifyAndTruncate = (value: unknown, maxChars: number) => {
  const text = JSON.stringify(value) ?? "null";
  return text.length > maxChars ? `${text.slice(0, maxChars)}... [response truncated]` : text;
};

export class ApplicationApiClient {
  public constructor(private readonly config: GatewayConfig["application"], private readonly tokens: TokenExchangeService) {}

  public async call(tool: ToolDefinition, args: Record<string, unknown>, link: UserLink, actor: Actor): Promise<McpToolResult> {
    const accessToken = await this.tokens.getToken(link, tool.requiredScopes, actor);
    const { url, body } = buildApplicationRequest(tool, args, this.config.apiBaseUrl);
    const requestId = actor.requestId || randomUUID();
    const response = await fetch(url, {
      method: tool.http.method,
      headers: {
        Authorization: `Bearer ${accessToken}`, Accept: "application/json", "X-Request-ID": requestId, "X-Automation-Source": "rocket-mcp-gateway",
        ...(["POST", "PUT", "PATCH", "DELETE"].includes(tool.http.method) ? { "Idempotency-Key": `${requestId}:${tool.name}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(this.config.timeoutMs)
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) return { isError: true, content: [{ type: "text", text: `Application request failed with HTTP ${response.status}. Request ID: ${requestId}` }] };
    return { content: [{ type: "text", text: stringifyAndTruncate(result, this.config.maxResponseChars) }], ...(result && typeof result === "object" ? { structuredContent: result } : {}) };
  }
}
