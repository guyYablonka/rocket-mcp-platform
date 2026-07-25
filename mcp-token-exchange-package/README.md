# `@rocket-mcp/token-exchange`

One delegated token-exchange implementation with typed adapters for Express, Fastify, and Nest. The package authenticates the MCP gateway, validates the requested application user and scopes with Zod, calls your existing user/permission logic, and returns a short-lived application access token.

The package is written in TypeScript, requires Node.js 20 or newer, and publishes compiled files from `dist/`. Framework packages are optional peers loaded only through their subpath adapter.

## Source layout

```text
src/
  adapters/      Express, Fastify, and Nest entry points
  core/          authenticated token-exchange workflow
  jwt/           HS256 issue and verification helpers
  types.ts       public domain and callback contracts
```

## Install

Copy this package into your repository or publish it under your own npm scope, then install the adapter you use:

```bash
npm install @rocket-mcp/token-exchange
```

## Shared configuration

All adapters accept the same options:

```js
import { createStaticGatewayAuthenticator } from "@rocket-mcp/token-exchange";
import { createHs256JwtIssuer } from "@rocket-mcp/token-exchange/jwt";

const options = {
  authenticateGateway: createStaticGatewayAuthenticator({
    tokens: [{ id: "rocket-mcp-gateway", token: process.env.MCP_GATEWAY_SERVICE_TOKEN }],
  }),

  async findUser({ applicationUserId }) {
    return db.users.findById(applicationUserId); // Return null or { disabled: true } to deny.
  },

  async authorizeScopes({ user, requestedScopes }) {
    const allowed = new Set(await permissions.scopesFor(user.id));
    return requestedScopes.filter((scope) => allowed.has(scope));
  },

  issueToken: createHs256JwtIssuer({
    secret: process.env.APPLICATION_JWT_SECRET,
    issuer: "https://application.example.com",
    audience: "https://application.example.com/api",
    ttlSeconds: 300,
    getSubject: (user) => user.id,
    additionalClaims: ({ gateway }) => ({ act: { sub: gateway.id } }),
  }),

  audit(event) {
    auditLogger.info(event); // Events never contain the gateway or issued access token.
  },
};
```

For production, `issueToken` should normally call your existing OAuth/OIDC authorization service. The included HS256 issuer is convenient when the endpoint and API are operated by the same trusted application; use asymmetric signing or your identity provider when multiple services verify tokens.

## Express

```js
import express from "express";
import { tokenExchangeExpress } from "@rocket-mcp/token-exchange/express";

const app = express();
app.use(express.json({ limit: "16kb" }));
app.post("/api/auth/mcp-token", tokenExchangeExpress(options));
```

Express 5 automatically forwards rejected middleware promises, while this adapter also calls `next(error)` for unexpected adapter failures.

## Fastify

```js
import Fastify from "fastify";
import tokenExchangeFastify from "@rocket-mcp/token-exchange/fastify";

const app = Fastify({ bodyLimit: 16 * 1024 });
await app.register(tokenExchangeFastify, {
  path: "/api/auth/mcp-token",
  ...options,
});
```

The plugin registers the route and its successful-response schema. Request-field validation stays inside the authenticated core handler so unauthenticated callers do not reach user or scope validation.

## Nest

```ts
import { Module } from "@nestjs/common";
import { TokenExchangeModule } from "@rocket-mcp/token-exchange/nest";

@Module({
  imports: [
    TokenExchangeModule.register({
      path: "/api/auth/mcp-token",
      ...options,
    }),
  ],
})
export class AppModule {}
```

The dynamic module works with Nest's Express and Fastify HTTP adapters.

## Gateway request

```http
POST /api/auth/mcp-token
Authorization: Bearer <gateway-service-token>
Content-Type: application/json

{
  "applicationUserId": "A456",
  "requestedScopes": ["tickets:read", "tickets:create"],
  "actor": {
    "rocketUserId": "R123",
    "tenantId": "default",
    "roomId": "ROOM",
    "requestId": "MESSAGE"
  }
}
```

Successful response:

```json
{
  "accessToken": "short-lived-application-token",
  "tokenType": "Bearer",
  "expiresIn": 300,
  "scopes": ["tickets:read", "tickets:create"]
}
```

The gateway's `APPLICATION_GATEWAY_TOKEN` must equal `MCP_GATEWAY_SERVICE_TOKEN` in your application. Configure its URL as:

```dotenv
APPLICATION_TOKEN_EXCHANGE_URL=https://application.example.com/api/auth/mcp-token
```

## Using your existing authentication system

You do not have to use the included JWT issuer. Replace `issueToken`:

```js
async issueToken({ user, scopes, gateway, context }) {
  return oauthAuthorizationServer.issueDelegatedToken({
    subject: user.id,
    audience: "application-api",
    scopes,
    actor: gateway.id,
    correlationId: context.requestId,
    expiresIn: 300,
  });
}
```

Your API must validate the token signature, issuer, audience, expiry, subject, and scopes. It must not authorize a user from the `actor` object supplied in the exchange request.

## Security defaults

- Gateway authentication happens before request validation and user lookup.
- Gateway token comparison uses fixed-length SHA-256 digests and `timingSafeEqual`.
- Static gateway tokens shorter than 16 characters are rejected during setup.
- Unknown body and actor fields are rejected.
- Scope names, counts, and lengths are bounded.
- A request is rejected unless every requested scope is authorized.
- Responses use `Cache-Control: no-store` and `Pragma: no-cache`.
- User lookup and scope denial responses avoid exposing account details.
- Audit events never include gateway tokens or issued access tokens.
- JWT helpers reject short secrets, algorithm changes, invalid audiences, and expired tokens.

Also apply ingress rate limiting, keep the endpoint reachable only by the gateway when possible, rotate the gateway credential, and retain application-side authorization on every API route.

## Test and package

```bash
npm run check
npm test
npm run pack:check
```

To create an installable tarball:

```bash
npm pack
```
