# Rocket.Chat MCP bot

A TypeScript bot that receives Rocket.Chat messages over DDP, lets Qwen, Kimi,
or another OpenAI-compatible model select approved MCP tools, and posts the final
answer back into the originating thread. It uses the DDP v1 operations available
in both Rocket.Chat 3.11.4 and 8.4.

## Stack

- `ws` for the Rocket.Chat DDP v1 connection and message subscriptions
- Express 5 for health checks and the optional webhook fallback
- Zod 4 for environment, message, webhook, and model-response validation
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

`services/` is the business-logic layer. `repositories/` is the data-access
layer and can later be replaced by Redis or a database without changing message
orchestration.

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

Create a dedicated Rocket.Chat bot user, generate a personal access token for
that user, and add it to every room it should monitor. No outgoing integration
is required.

Configure the bot with the stable room IDs, not room names:

```dotenv
ROCKETCHAT_URL=https://chat.example.com
ROCKETCHAT_TRANSPORT=ddp
ROCKETCHAT_DDP_ROOM_IDS=
ROCKETCHAT_BOT_USERNAME=assistant-bot
ROCKETCHAT_USER_ID=BOT_USER_ID
ROCKETCHAT_AUTH_TOKEN=BOT_PERSONAL_ACCESS_TOKEN
```

The bot opens an outbound connection to
`wss://chat.example.com/websocket`, authenticates with the personal access
token, and subscribes to `stream-room-messages`. When
`ROCKETCHAT_DDP_ROOM_IDS` is empty, it uses Rocket.Chat's `__my_messages__`
stream and receives messages from every room the bot has joined. Set a
comma-separated list of stable room IDs only to narrow that subscription. The
bot responds to DDP ping frames, reconnects after connection loss, and restores
the subscription. Replies continue to use the Rocket.Chat REST API.

Keep the bot out of rooms it does not need. You can also set
`ROCKETCHAT_ALLOWED_ROOM_IDS` as a defense-in-depth authorization check.
With `ROCKETCHAT_REQUIRE_MENTION=true` (the default), the bot processes only
messages containing an explicit `@assistant-bot` mention.

### Optional webhook fallback

Set `ROCKETCHAT_TRANSPORT=webhook` to use the original outgoing-integration
endpoint instead. In that mode, configure the integration URL as
`https://YOUR-BOT-HOST/webhooks/rocketchat` and set the same optional integration
token in `ROCKETCHAT_WEBHOOK_TOKEN`. The webhook route is not mounted in DDP
mode.

## Configuration

Copy `.env.example` to `.env` and provide the values through your process manager or container. The service intentionally does not load `.env` automatically.

If webhook fallback mode runs behind a trusted reverse proxy, set
`TRUST_PROXY_HOPS` to the exact number of proxy hops so rate limiting uses the
correct client address. Leave it at `0` when directly exposed.

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
# Optional fallbacks injected into matching tool parameters.
MCP_DEFAULT_TOOL_ARGS_JSON={"cloudId":"00000000-0000-0000-0000-000000000000","issueTypeName":"Task"}
```

For Atlassian, `cloudId` is the site's UUID returned by
`getAccessibleAtlassianResources`, not the site's browser URL.

Do not configure `projectKey` or `projectIdOrKey` unless every new issue should
go to that one project. Explicit tool arguments override configured fallbacks.

### Tool policy

The production default is an allow-list:

```dotenv
MCP_TOOL_POLICY=allow-list
MCP_TOOL_ALLOWLIST=get_*,list_*,search_*,create_ticket
MCP_TOOL_TRIGGER_TERMS=tasks,issues,tickets
```

Only allowed tools are shown to the model. Application authorization is still enforced by the MCP gateway and application API.
Trigger terms are deployment-specific. When a request contains one, the first model turn must call an available tool. This keeps the core bot application-neutral while allowing reliable grounding for each connected application.

### Conversation context

The bot keeps a bounded, in-memory history per Rocket.Chat room so follow-up requests can refer to tasks, projects, and prior answers. History expires automatically and is lost when the bot restarts.

```dotenv
CONVERSATION_HISTORY_TURNS=6
CONVERSATION_HISTORY_TTL_MS=1800000
```

Set `CONVERSATION_HISTORY_TURNS=0` to disable conversation memory.

## Request lifecycle

1. The bot connects to Rocket.Chat over DDP and subscribes to configured rooms.
2. Incoming messages are checked for bot authorship, mention, room/user
   allow-lists, and duplicate message IDs.
3. A request-scoped MCP SDK client connects with a short-lived actor JWT.
4. The model runs a bounded tool loop using only policy-approved tools.
5. The bot posts the final Markdown response into the original thread using REST.
6. The MCP client is closed; DDP is stopped and active requests are drained
   during graceful shutdown.

## Docker

```bash
docker build -t rocket-mcp-bot .
docker run --env-file .env -p 3000:3000 rocket-mcp-bot
```

The multi-stage image compiles TypeScript and runs only production dependencies as the unprivileged `node` user.

## Production notes

- Replace the in-memory dedupe repository with Redis or another shared store for multiple replicas.
- If webhook fallback is enabled, put the service behind ingress rate limiting
  in addition to the local limiter.
- Add explicit user confirmation for deletes, payments, permission changes, and bulk operations.
- Never authorize from chat text; the application must authorize every MCP-backed operation.
- Keep secrets in a managed secret store and rotate model, Rocket.Chat, actor,
  and any enabled webhook credentials.
