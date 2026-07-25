import { Router } from "express";
import { z } from "zod";
import type { McpGatewayService } from "../bl/mcp-gateway.service.js";
import { actorAuth } from "../middleware/actor-auth.middleware.js";
import type { GatewayConfig } from "../config/env.js";

const requestSchema = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string(), params: z.object({ name: z.string().optional(), arguments: z.record(z.string(), z.unknown()).optional() }).optional() });

export function mcpRouter(config: GatewayConfig, gateway: McpGatewayService) {
  return Router().post(config.http.mcpPath, actorAuth(config.actor), async (request, response, next) => {
    try {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid request" } });
      if (parsed.data.method.startsWith("notifications/")) return response.sendStatus(202);
      response.json(await gateway.handle(request.actor!, parsed.data));
    } catch (error) { next(error); }
  });
}
