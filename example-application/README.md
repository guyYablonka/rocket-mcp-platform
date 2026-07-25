# Example application servers

Each server exposes the same mock ticket API and uses `@rocket-mcp/token-exchange` for `POST /api/auth/mcp-token`:

- `express/mock-server.ts` uses the Express adapter.
- `fastify/mock-server.ts` uses the Fastify plugin.
- `nest/mock-server.ts` uses the Nest dynamic module.

## Install and run

```powershell
npm install
npm test

$env:MCP_GATEWAY_SERVICE_TOKEN='dev-gateway-service-token'
$env:APPLICATION_JWT_SECRET='replace-with-at-least-32-random-characters'
npm run start:express # or start:fastify / start:nest
```

The package is installed from the checked-in tarball under `vendor/`, so the example remains reproducible before the package is published to npm. Replace that `file:` dependency with your registry version after publishing.

The application-side `MCP_GATEWAY_SERVICE_TOKEN` must equal the gateway's `APPLICATION_GATEWAY_TOKEN`. `APPLICATION_GATEWAY_TOKEN` is accepted here as a backward-compatible local-development alias.

## Mock data

The in-memory application user is `app-user-1`, with `tickets:read` and `tickets:create`. Configure `gateway/config/user-links.json` to map a Rocket.Chat user to that application user.

All three variants expose:

- `GET /healthz`
- `POST /api/auth/mcp-token`
- `GET /api/tickets`
- `GET /api/tickets/:ticketId`
- `POST /api/tickets`

The token exchange issues a five-minute HS256 application JWT. Ticket routes verify its signature, issuer, audience, expiry, subject, and required scope.

`npm test` compiles the TypeScript and runs the complete exchange-and-ticket flow against all three frameworks.

## Docker

The image starts Express by default:

```powershell
docker build -t rocket-mcp-example-app .
docker run --rm -p 3200:3200 `
  -e MCP_GATEWAY_SERVICE_TOKEN='dev-gateway-service-token' `
  -e APPLICATION_JWT_SECRET='replace-with-at-least-32-random-characters' `
  rocket-mcp-example-app
```

Select another compiled server by overriding the image command:

```powershell
docker run --rm -p 3200:3200 rocket-mcp-example-app dist/fastify/mock-server.js
docker run --rm -p 3200:3200 rocket-mcp-example-app dist/nest/mock-server.js
```
