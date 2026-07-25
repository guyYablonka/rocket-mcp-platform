# Rocket MCP Gateway

The gateway is an Express 5 and TypeScript MCP server. It verifies the short-lived actor token issued by the Rocket.Chat bot, resolves the linked application account, limits tools to the account's scopes, exchanges a delegated application token, and calls the allowlisted application API.

## Layout

```text
src/
  bl/           MCP orchestration and delegated-token business logic
  config/       Zod environment validation
  dal/          JSON-manifest repositories and application HTTP client
  domain/       shared MCP, tool, actor, and user-link types
  middleware/   actor authentication and error handling
  routes/       health and MCP HTTP routes
  app.ts        Express composition root
  server.ts     production process entry point
```

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Copy `.env.example` to `.env` and provide the actor JWT secret plus your application's API and token-exchange URLs before starting the service.
