import { createApp } from "./app.js";
import { createContainer } from "./bootstrap/container.js";
import { loadConfig } from "./config/config.js";
import { createLogger } from "./infrastructure/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const container = createContainer(config, logger);
  await container.ddpListener?.start();
  const app = createApp({ config, webhookService: container.webhookService, logger });
  const server = app.listen(config.http.port, config.http.host, () => {
    logger.info(
      {
        host: config.http.host,
        port: config.http.port,
        transport: config.rocketChat.transport,
        ...(config.rocketChat.transport === "webhook"
          ? { path: config.http.webhookPath }
          : {}),
      },
      "bot listening",
    );
  });

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    await container.ddpListener?.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await drainWithTimeout(container.webhookService.drain(), 25_000);
    logger.info("shutdown complete");
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal).catch((error: unknown) => {
        logger.error({ err: error }, "shutdown failed");
        process.exitCode = 1;
      });
    });
  }
}

async function drainWithTimeout(drain: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
    timer.unref();
  });
  await Promise.race([drain, timeout]);
  if (timer) clearTimeout(timer);
}

main().catch((error: unknown) => {
  const logger = createLogger(process.env.LOG_LEVEL || "info");
  logger.fatal({ err: error }, "startup failed");
  process.exitCode = 1;
});
