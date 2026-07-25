import type { FastifyInstance } from "fastify";
import { createTokenExchange } from "../core/create-token-exchange.js";
import type { TokenExchangeOptions } from "../types.js";

export async function tokenExchangeFastify(fastify: FastifyInstance, options: TokenExchangeOptions & { path?: string }) {
  const { path = "/api/auth/mcp-token", ...coreOptions } = options;
  const handle = createTokenExchange(coreOptions);
  fastify.post(path, async (request, reply) => {
    const result = await handle({ headers: request.headers, body: request.body, ip: request.ip });
    return reply.headers(result.headers).code(result.status).send(result.body);
  });
}
