import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { loadConfig } from "./config/env.js";
import { FileUserLinkRepository } from "./dal/file-user-link.repository.js";
import { FileToolRegistryRepository } from "./dal/file-tool-registry.repository.js";
import { ApplicationApiClient } from "./dal/application-api.client.js";
import { TokenExchangeService } from "./bl/token-exchange.service.js";
import { McpGatewayService } from "./bl/mcp-gateway.service.js";
import { healthRouter } from "./routes/health.route.js";
import { mcpRouter } from "./routes/mcp.route.js";
import { errorHandler } from "./middleware/error-handler.middleware.js";

export function createApp(env = process.env) {
  const config = loadConfig(env);
  const logger = pino({ level: env.LOG_LEVEL ?? "info" });
  const links = new FileUserLinkRepository(config.files.links);
  const tools = new FileToolRegistryRepository(config.files.tools);
  const application = new ApplicationApiClient(config.application, new TokenExchangeService(config.application));
  const gateway = new McpGatewayService(links, tools, application, logger);
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: config.http.maxBodyBytes }));
  app.use(healthRouter);
  app.use(mcpRouter(config, gateway));
  app.use(errorHandler(logger));
  return { app, config, logger };
}
