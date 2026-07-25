import Fastify from "fastify";
import tokenExchangeFastify from "@rocket-mcp/token-exchange/fastify";
import {
  HttpError,
  authorizeApiRequest,
  createTicket,
  getTicket,
  listTickets,
  port,
  tokenExchangeOptions,
} from "../src/application.js";

const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });

await app.register(tokenExchangeFastify, {
  path: "/api/auth/mcp-token",
  ...tokenExchangeOptions(),
});

app.get("/healthz", async () => ({ ok: true, framework: "fastify" }));

app.get<{ Querystring: { status?: string } }>("/api/tickets", async (request) => {
  const principal = authorizeApiRequest(request.headers.authorization, "tickets:read");
  return listTickets(principal, request.query.status);
});

app.get<{ Params: { ticketId: string } }>("/api/tickets/:ticketId", async (request) => {
  const principal = authorizeApiRequest(request.headers.authorization, "tickets:read");
  return getTicket(principal, request.params.ticketId);
});

app.post("/api/tickets", async (request, response) => {
  const principal = authorizeApiRequest(request.headers.authorization, "tickets:create");
  return response.code(201).send(createTicket(principal, request.body));
});

app.setErrorHandler((error, _request, response) => {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "internal server error";
  return response.code(status).send({ error: status === 500 ? "internal server error" : message });
});

await app.listen({ port, host: "0.0.0.0" });
