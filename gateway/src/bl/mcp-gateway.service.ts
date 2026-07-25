import type pino from "pino";
import type { Actor, JsonRpcRequest, McpToolResult } from "../domain/types.js";
import { FileUserLinkRepository } from "../dal/file-user-link.repository.js";
import { FileToolRegistryRepository } from "../dal/file-tool-registry.repository.js";
import { ApplicationApiClient } from "../dal/application-api.client.js";

type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
const textError = (text: string): McpToolResult => ({ isError: true, content: [{ type: "text", text }] });

export class McpGatewayService {
  public constructor(
    private readonly links: FileUserLinkRepository,
    private readonly tools: FileToolRegistryRepository,
    private readonly application: ApplicationApiClient,
    private readonly logger: pino.Logger
  ) {}

  public async handle(actor: Actor, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const success = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id: request.id ?? null, result });
    const failure = (code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id: request.id ?? null, error: { code, message } });
    if (request.jsonrpc !== "2.0" || !request.method) return failure(-32600, "Invalid JSON-RPC request");
    if (request.method === "initialize") return success({ protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "rocket-application-gateway", version: "0.2.0" } });
    if (request.method === "ping") return success({});

    const link = this.links.find(actor);
    if (request.method === "tools/list") return success({ tools: this.tools.listFor(link).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    if (request.method !== "tools/call") return failure(-32601, `Method not found: ${request.method}`);
    if (!link) return success(textError("Your Rocket.Chat account is not linked to an application account. Ask an administrator to create the user link."));

    const tool = this.tools.getFor(request.params?.name, link);
    if (!tool) return success(textError("This operation is unavailable or your linked account lacks its required scopes."));
    const args = request.params?.arguments ?? {};
    this.logger.info({ requestId: actor.requestId, tenantId: actor.tenantId, rocketUserId: actor.rocketUserId, applicationUserId: link.applicationUserId, tool: tool.name }, "application tool requested");
    try {
      const result = await this.application.call(tool, args, link, actor);
      this.logger.info({ requestId: actor.requestId, rocketUserId: actor.rocketUserId, tool: tool.name, isError: Boolean(result.isError) }, "application tool completed");
      return success(result);
    } catch (error) {
      this.logger.error({ err: error, requestId: actor.requestId, rocketUserId: actor.rocketUserId, tool: tool.name }, "application tool failed");
      return success(textError("The application operation could not be completed. An administrator can inspect the gateway logs using the request ID."));
    }
  }
}
