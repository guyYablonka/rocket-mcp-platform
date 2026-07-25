import { createApp } from "./app.js";

const { app, config, logger } = createApp();
app.listen(config.http.port, config.http.host, () => logger.info({ host: config.http.host, port: config.http.port, path: config.http.mcpPath }, "MCP gateway listening"));
