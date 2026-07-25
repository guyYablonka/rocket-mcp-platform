import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { AppConfig } from "../config/config.js";
import { WebhookController } from "../controllers/webhook.controller.js";

export function createWebhookRouter(
  config: AppConfig["http"],
  controller: WebhookController,
): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { accepted: false, reason: "rate limit exceeded" },
  });
  router.post(config.webhookPath, limiter, controller.handle);
  return router;
}
