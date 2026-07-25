import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
import type { McpClientFactory } from "../domain/ports.js";
import { McpSdkClient } from "../integrations/mcp/mcp-sdk.client.js";
import { OpenAiCompatibleModelClient } from "../integrations/model/openai-compatible-model.client.js";
import { RocketChatRestClient } from "../integrations/rocketchat/rocket-chat.client.js";
import { InMemoryDedupeRepository } from "../repositories/in-memory-dedupe.repository.js";
import { ActorTokenService } from "../services/actor-token.service.js";
import { AgentService } from "../services/agent.service.js";
import { WebhookService } from "../services/webhook.service.js";

export interface ApplicationContainer {
  webhookService: WebhookService;
}

export function createContainer(config: AppConfig, logger: Logger): ApplicationContainer {
  const actorTokens = new ActorTokenService();
  const model = new OpenAiCompatibleModelClient(config.model);
  const rocketChat = new RocketChatRestClient(config.rocketChat);
  const dedupe = new InMemoryDedupeRepository();
  const agent = new AgentService(model, config, logger);

  const mcpFactory: McpClientFactory = async (event) => {
    const bearerToken = config.mcp.authMode === "actor-jwt"
      ? await actorTokens.sign(event, config.rocketChat.tenantId, config.mcp)
      : config.mcp.bearerToken;
    return new McpSdkClient(config.mcp, bearerToken);
  };

  return {
    webhookService: new WebhookService(
      config,
      dedupe,
      mcpFactory,
      agent,
      rocketChat,
      logger,
    ),
  };
}
