import type { Request, Response } from "express";
import type { WebhookResult } from "../domain/types.js";

interface WebhookHandler {
  handle(payload: unknown): WebhookResult;
}

export class WebhookController {
  constructor(private readonly service: WebhookHandler) {}

  handle = (request: Request, response: Response): void => {
    const result = this.service.handle(request.body);
    response.status(result.status).json({
      accepted: result.accepted,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  };
}
