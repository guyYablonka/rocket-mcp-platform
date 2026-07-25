import type { ErrorRequestHandler } from "express";
import type pino from "pino";

export const errorHandler = (logger: pino.Logger): ErrorRequestHandler => (error, request, response, _next) => {
  logger.error({ err: error, requestId: request.actor?.requestId }, "unhandled gateway error");
  response.status(500).json({ error: "internal_server_error" });
};
