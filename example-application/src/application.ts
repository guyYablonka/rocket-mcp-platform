import type { TokenExchangeOptions } from "@rocket-mcp/token-exchange";
import { createStaticGatewayAuthenticator } from "@rocket-mcp/token-exchange";
import { createHs256JwtIssuer, verifyHs256Jwt } from "@rocket-mcp/token-exchange/jwt";

export const port = parsePort(process.env.PORT);

const jwtSecret = process.env.APPLICATION_JWT_SECRET || "development-application-jwt-secret-change-me";
const jwtIssuer = process.env.APPLICATION_JWT_ISSUER || "rocket-mcp-example-application";
const jwtAudience = process.env.APPLICATION_JWT_AUDIENCE || "rocket-mcp-example-api";
const gatewayToken = process.env.MCP_GATEWAY_SERVICE_TOKEN
  || process.env.APPLICATION_GATEWAY_TOKEN
  || "dev-gateway-service-token";

export interface ApplicationUser {
  [key: string]: unknown;
  id: string;
  disabled: boolean;
  scopes: string[];
}

export interface ApiPrincipal {
  userId: string;
  scopes: Set<string>;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high";
  status: "open" | "closed";
  ownerId: string;
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const users = new Map<string, ApplicationUser>([
  ["app-user-1", {
    id: "app-user-1",
    disabled: false,
    scopes: ["tickets:read", "tickets:create"],
  }],
]);

const tickets: Ticket[] = [{
  id: "T-1",
  title: "Example ticket",
  description: "A ticket owned by the example application user.",
  priority: "normal",
  status: "open",
  ownerId: "app-user-1",
}];

export function tokenExchangeOptions(): TokenExchangeOptions<ApplicationUser> {
  return {
    authenticateGateway: createStaticGatewayAuthenticator({
      tokens: [{ id: "rocket-mcp-gateway", token: gatewayToken }],
    }),

    async findUser({ applicationUserId }) {
      return users.get(applicationUserId) || null;
    },

    async authorizeScopes({ user, requestedScopes }) {
      const allowed = new Set(user.scopes);
      return requestedScopes.filter((scope) => allowed.has(scope));
    },

    issueToken: createHs256JwtIssuer<ApplicationUser>({
      secret: jwtSecret,
      issuer: jwtIssuer,
      audience: jwtAudience,
      ttlSeconds: 300,
      getSubject: (user) => user.id,
      additionalClaims: ({ gateway }) => ({ act: { sub: gateway.id } }),
    }),

    async audit(event) {
      process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
    },
  };
}

export function authorizeApiRequest(authorization: string | undefined, requiredScope: string): ApiPrincipal {
  const match = /^Bearer\s+(.+)$/i.exec(authorization || "");
  if (!match) throw new HttpError(401, "invalid application token");

  let claims: Readonly<Record<string, unknown>>;
  try {
    claims = verifyHs256Jwt(match[1], {
      secret: jwtSecret,
      issuer: jwtIssuer,
      audience: jwtAudience,
      clockSkewSeconds: 5,
    });
  } catch {
    throw new HttpError(401, "invalid application token");
  }

  const scopes = new Set(typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : []);
  if (!scopes.has(requiredScope)) throw new HttpError(403, "insufficient scope");
  return { userId: String(claims.sub), scopes };
}

export function listTickets(principal: ApiPrincipal, status?: string): Ticket[] {
  return tickets.filter((ticket) => ticket.ownerId === principal.userId && (!status || ticket.status === status));
}

export function getTicket(principal: ApiPrincipal, ticketId: string): Ticket {
  const ticket = tickets.find((item) => item.id === ticketId && item.ownerId === principal.userId);
  if (!ticket) throw new HttpError(404, "not found");
  return ticket;
}

export function createTicket(principal: ApiPrincipal, value: unknown): Ticket {
  if (!isObject(value) || typeof value.title !== "string" || !value.title.trim()) {
    throw new HttpError(400, "title is required");
  }
  const allowedPriorities = new Set(["low", "normal", "high"]);
  if (value.priority !== undefined && (typeof value.priority !== "string" || !allowedPriorities.has(value.priority))) {
    throw new HttpError(400, "invalid priority");
  }
  const ticket: Ticket = {
    id: `T-${tickets.length + 1}`,
    title: value.title.trim(),
    description: typeof value.description === "string" ? value.description : "",
    priority: (value.priority as Ticket["priority"] | undefined) || "normal",
    status: "open",
    ownerId: principal.userId,
  };
  tickets.push(ticket);
  return ticket;
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value || "3200", 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) throw new Error("PORT must be between 0 and 65535");
  return parsed;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
