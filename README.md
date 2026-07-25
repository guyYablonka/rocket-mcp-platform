# Rocket.Chat MCP platform

This workspace contains the complete path from a Rocket.Chat mention to a user-authorized application API call:

- `bot/` — a layered TypeScript/Express service that receives mentions, uses Qwen/Kimi/custom models, signs the Rocket.Chat actor, calls MCP, and posts threaded replies.
- `gateway/` — verifies the actor, filters tools by the linked user's scopes, exchanges for a short-lived application token, and calls only manifest-approved API operations.
- `mcp-token-exchange-package/` — reusable Express, Fastify, and Nest token-exchange adapters.
- `example-application/` — runnable framework examples that use the token-exchange package and expose the same ticket API.
- `ARCHITECTURE.md` — trust boundaries, token flow, and the application-server contract.

The services target Node.js 20 or newer and manage their dependencies independently.

## Configure

1. Copy `gateway/.env.example` to `gateway/.env` and configure the application URL, gateway service token, and actor secret.
2. Put the same actor secret, issuer, and audience in `bot/.env` using `bot/.env.example`.
3. Replace the examples in `gateway/config/user-links.json` with real stable IDs.
4. Replace or extend `gateway/config/tools.json` with reviewed application operations and scopes.
5. Configure Rocket.Chat and the model provider using `bot/README.md`.

The bot and gateway must agree on:

```dotenv
# bot
GATEWAY_ACTOR_SECRET=same-long-random-secret
GATEWAY_ACTOR_ISSUER=rocket-mcp-bot
GATEWAY_ACTOR_AUDIENCE=https://mcp-gateway.example.com/mcp

# gateway
ACTOR_TOKEN_SECRET=same-long-random-secret
ACTOR_TOKEN_ISSUER=rocket-mcp-bot
ACTOR_TOKEN_AUDIENCE=https://mcp-gateway.example.com/mcp
```

## Application changes

The TypeScript gateway uses a delegated token-exchange endpoint. Implement the request/response contract in `ARCHITECTURE.md`, or replace the application integration in `gateway/src/bl/token-exchange.service.ts` with an adapter for your existing OAuth system.

The application must authorize the application user from its own access token. Actor fields from the gateway are audit context, not a replacement for application authorization.

## Run the local demonstration

Install and test the token package and example application:

```powershell
npm --prefix mcp-token-exchange-package install
npm --prefix mcp-token-exchange-package run build
npm --prefix example-application install
npm --prefix example-application test
```

Start one mock application variant:

```powershell
$env:MCP_GATEWAY_SERVICE_TOKEN='dev-gateway-service-token'
$env:APPLICATION_JWT_SECRET='replace-with-at-least-32-random-characters'
npm --prefix example-application run start:express
# Alternatives: start:fastify or start:nest
```

Install, configure, and start the gateway:

```powershell
npm --prefix gateway install
npm --prefix gateway run dev
```

Finally install, configure, and start the bot:

```powershell
npm --prefix bot ci
npm --prefix bot run build
npm --prefix bot start
```

## Verify

After installing each package:

```powershell
npm run check
npm test
npm run build
npm --prefix example-application test
```

## Production work still required

- Replace JSON/in-memory repositories with a database or Redis and protected account-linking workflows.
- Replace shared HMAC actor signing with asymmetric signing or workload identity when bot and gateway are operated separately.
- Put secrets in a managed secret store and rotate them.
- Add distributed replay protection for actor JWT `jti` values and durable idempotency records.
- Add explicit confirmation for destructive, financial, permission-changing, or bulk tools.
- Run the gateway on a private network where practical and apply ingress rate limits.
