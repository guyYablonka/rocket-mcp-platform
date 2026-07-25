# Rocket.Chat MCP bot

A TypeScript/Express bot that accepts Rocket.Chat outgoing webhooks, lets Qwen, Kimi, or another OpenAI-compatible model select approved MCP tools, and posts the final answer back into the originating thread.

## Stack

- Express 5 for HTTP routing and async error propagation
- Zod 4 for environment, webhook, and model-response validation
- Official MCP TypeScript SDK v1 with Streamable HTTP
- JOSE for short-lived actor JWTs
- Pino and `pino-http` for structured, redacted logs
- Helmet and `express-rate-limit` for HTTP security defaults
- Vitest and Supertest for unit and route tests

The MCP SDK is pinned to `1.29.0`, the production v1 line. Its unused Hono server adapter is overridden to a patched release so `npm audit` remains clean.

## Project structure

```text
src/
├── bootstrap/       dependency wiring
├── config/          validated environment configuration
├── controllers/     HTTP request/response adapters
├── domain/          shared types and ports
├── infrastructure/  logging and process-level concerns
├── integrations/    MCP, model, and Rocket.Chat clients
├── middleware/      Express error handling
├── repositories/    data access (in-memory deduplication)
├── routes/          health and webhook routes
├── services/        business logic and orchestration
├── utils/           transport helpers
├── app.ts           Express composition
└── server.ts        process entry point and graceful shutdown
```

`services/` is the business-logic layer. `repositories/` is the data-access layer and can later be replaced by Redis or a database without changing webhook orchestration.

## Install and verify

```powershell
npm ci
npm run check
npm test
npm run build
```

Run locally:

```powershell
npm run dev
```

Run the compiled service:

```powershell
npm start
```

Health check: `GET /healthz`

## Rocket.Chat setup

Create a dedicated bot user and an **Outgoing** integration:

| Setting | Value |
|---|---|
| Event Trigger | `Message Sent` |
| Trigger Words | `@assistant-bot` |
| URL | `https://YOUR-BOT-HOST/webhooks/rocketchat` |
| Token | A long random webhook secret |
| Post as | `assistant-bot` |

Set the same integration token as `ROCKETCHAT_WEBHOOK_TOKEN`. Scope the integration and bot channel membership as narrowly as possible.

## Configuration

Copy `.env.example` to `.env` and provide the values through your process manager or container. The service intentionally does not load `.env` automatically.

If the service runs behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of proxy hops so rate limiting uses the correct client address. Leave it at `0` when directly exposed.

### Qwen

```dotenv
MODEL_PROVIDER=qwen
MODEL_API_KEY=your-dashscope-key
MODEL_NAME=qwen-plus
MODEL_BASE_URL=https://YOUR-WORKSPACE.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

### Kimi

```dotenv
MODEL_PROVIDER=kimi
MODEL_API_KEY=your-moonshot-key
MODEL_NAME=your-supported-kimi-model
# Defaults to https://api.moonshot.ai/v1
MODEL_BASE_URL=
```

### Custom compatible model

```dotenv
MODEL_PROVIDER=custom
MODEL_API_KEY=your-key
MODEL_NAME=your-model
MODEL_BASE_URL=https://model-gateway.example.com/v1
```

The provider must implement the OpenAI Chat Completions `tools` and `tool_calls` format.

### MCP gateway

The recommended mode creates a new user-bound actor JWT for each accepted Rocket.Chat message:

```dotenv
MCP_URL=https://mcp-gateway.example.com/mcp
MCP_AUTH_MODE=actor-jwt
GATEWAY_ACTOR_SECRET=replace-with-at-least-32-random-characters
GATEWAY_ACTOR_ISSUER=rocket-mcp-bot
GATEWAY_ACTOR_AUDIENCE=https://mcp-gateway.example.com/mcp
```

The gateway verifies that actor token and exchanges it for a separate application token. The actor credential is never sent to the model.

Static MCP credentials remain available for non-user-specific development:

```dotenv
MCP_AUTH_MODE=static
MCP_BEARER_TOKEN=replace-with-static-token
```

### Tool policy

The production default is an allow-list:

```dotenv
MCP_TOOL_POLICY=allow-list
MCP_TOOL_ALLOWLIST=get_*,list_*,search_*,create_ticket
```

Only allowed tools are shown to the model. Application authorization is still enforced by the MCP gateway and application API.

## Request lifecycle

1. Express validates request size and applies rate limiting.
2. The service verifies the webhook token, bot mention, room/user allow-lists, and deduplication key.
3. Rocket.Chat receives HTTP `202` immediately.
4. A request-scoped MCP SDK client connects with a short-lived actor JWT.
5. The model runs a bounded tool loop using only policy-approved tools.
6. The bot posts the final Markdown response into the original thread.
7. The MCP client is closed; active requests are drained during graceful shutdown.

## Docker

```bash
docker build -t rocket-mcp-bot .
docker run --env-file .env -p 3000:3000 rocket-mcp-bot
```

The multi-stage image compiles TypeScript and runs only production dependencies as the unprivileged `node` user.

## Production notes

- Replace the in-memory dedupe repository with Redis or another shared store for multiple replicas.
- Put the service behind ingress rate limiting in addition to the local limiter.
- Add explicit user confirmation for deletes, payments, permission changes, and bulk operations.
- Never authorize from chat text; the application must authorize every MCP-backed operation.
- Keep secrets in a managed secret store and rotate webhook, model, Rocket.Chat, and actor credentials.
