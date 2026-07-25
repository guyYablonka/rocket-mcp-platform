import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { tokenExchangeExpress } from "@rocket-mcp/token-exchange/express";
import {
  HttpError,
  authorizeApiRequest,
  createTicket,
  getTicket,
  listTickets,
  port,
  tokenExchangeOptions,
} from "../src/application.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/healthz", (_request, response) => response.json({ ok: true, framework: "express" }));
app.post("/api/auth/mcp-token", tokenExchangeExpress(tokenExchangeOptions()));

const requireScope = (scope: string): RequestHandler => (request, response, next) => {
  try {
    response.locals.principal = authorizeApiRequest(request.headers.authorization, scope);
    next();
  } catch (error) {
    next(error);
  }
};

app.get("/api/tickets", requireScope("tickets:read"), (request, response) => {
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  response.json(listTickets(response.locals.principal, status));
});

app.get("/api/tickets/:ticketId", requireScope("tickets:read"), (request, response) => {
  const ticketId = Array.isArray(request.params.ticketId) ? request.params.ticketId[0] : request.params.ticketId;
  response.json(getTicket(response.locals.principal, ticketId));
});

app.post("/api/tickets", requireScope("tickets:create"), (request, response) => {
  response.status(201).json(createTicket(response.locals.principal, request.body));
});

const errors: ErrorRequestHandler = (error, _request, response, _next) => {
  const status = error instanceof HttpError ? error.status : 500;
  response.status(status).json({ error: status === 500 ? "internal server error" : error.message });
};
app.use(errors);

const server = app.listen(port, "0.0.0.0", () => {
  const address = server.address();
  const listeningPort = typeof address === "object" && address ? address.port : port;
  process.stdout.write(`Express mock application listening on http://0.0.0.0:${listeningPort}\n`);
});
