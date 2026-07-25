import { createStaticGatewayAuthenticator } from "@rocket-mcp/token-exchange";
import { createHs256JwtIssuer } from "@rocket-mcp/token-exchange/jwt";

const users = new Map([
  ["app-user-1", { id: "app-user-1", disabled: false, scopes: ["tickets:read", "tickets:create"] }],
]);

export function tokenExchangeOptions() {
  return {
    authenticateGateway: createStaticGatewayAuthenticator({
      tokens: [{
        id: "rocket-mcp-gateway",
        token: process.env.MCP_GATEWAY_SERVICE_TOKEN || "development-gateway-token-change-me",
      }],
    }),

    async findUser({ applicationUserId }) {
      return users.get(applicationUserId) || null;
    },

    async authorizeScopes({ user, requestedScopes }) {
      const allowed = new Set(user.scopes);
      return requestedScopes.filter((scope) => allowed.has(scope));
    },

    issueToken: createHs256JwtIssuer({
      secret: process.env.APPLICATION_JWT_SECRET || "development-jwt-secret-change-me-now",
      issuer: "https://application.example.com",
      audience: "https://application.example.com/api",
      ttlSeconds: 300,
      getSubject: (user) => user.id,
      additionalClaims: ({ gateway }) => ({ act: { sub: gateway.id } }),
    }),

    async audit(event) {
      process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
    },
  };
}
