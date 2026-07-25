import Fastify from "fastify";
import tokenExchangeFastify from "@rocket-mcp/token-exchange/fastify";
import { tokenExchangeOptions } from "./shared-options.js";

const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });
await app.register(tokenExchangeFastify, {
  path: "/api/auth/mcp-token",
  ...tokenExchangeOptions(),
});
await app.listen({ port: 3000, host: "0.0.0.0" });
