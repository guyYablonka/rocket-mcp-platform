import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "not found" });
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (value, _request, response, next) => {
    if (response.headersSent) {
      next(value);
      return;
    }
    const error = asHttpError(value);
    const isBodyTooLarge = error.type === "entity.too.large";
    const isBadRequest = error instanceof SyntaxError
      || error instanceof ZodError
      || error.status === 400;
    const status = isBodyTooLarge ? 413 : isBadRequest ? 400 : normalizedStatus(error);
    if (status >= 500) logger.error({ err: error }, "HTTP request failed");
    else logger.warn({ err: error, status }, "invalid HTTP request");
    response.status(status).json({
      error: status >= 500 ? "internal server error" : "invalid request",
    });
  };
}

function asHttpError(value: unknown): HttpError {
  return value instanceof Error ? value : new Error(String(value));
}

function normalizedStatus(error: HttpError): number {
  const candidate = error.status ?? error.statusCode ?? 500;
  return candidate >= 400 && candidate <= 599 ? candidate : 500;
}
