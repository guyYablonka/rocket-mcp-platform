import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: null,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.x-auth-token",
        "req.headers.cookie",
        "headers.authorization",
        "headers.x-auth-token",
        "apiKey",
        "accessToken",
      ],
      censor: "[Redacted]",
    },
  });
}
