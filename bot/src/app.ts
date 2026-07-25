import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";
import type { AppConfig } from "./config/config.js";
import { WebhookController } from "./controllers/webhook.controller.js";
import { createErrorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { createWebhookRouter } from "./routes/webhook.routes.js";
import { WebhookService } from "./services/webhook.service.js";

export function createApp(input: {
  config: AppConfig;
  webhookService: Pick<WebhookService, "handle">;
  logger: Logger;
}): Express {
  const app = express();
  app.disable("x-powered-by");
  if (input.config.http.trustProxyHops > 0) {
    app.set("trust proxy", input.config.http.trustProxyHops);
  }
  app.use(pinoHttp({
    logger: input.logger,
    quietReqLogger: true,
    customLogLevel: (_request, response, error) => {
      if (error || response.statusCode >= 500) return "error";
      if (response.statusCode >= 400) return "warn";
      return "info";
    },
  }));
  app.use(helmet());
  app.use(express.json({
    limit: input.config.http.maxBodyBytes,
    strict: true,
    type: "application/json",
  }));

  app.use(createHealthRouter());
  if (input.config.rocketChat.transport === "webhook") {
    const webhookController = new WebhookController(input.webhookService);
    app.use(createWebhookRouter(input.config.http, webhookController));
  }
  app.use(notFoundHandler);
  app.use(createErrorHandler(input.logger));
  return app;
}
