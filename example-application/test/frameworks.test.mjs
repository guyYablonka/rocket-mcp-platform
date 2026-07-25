import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";

const gatewayToken = "test-gateway-service-token";
const jwtSecret = "test-application-jwt-secret-at-least-32-characters";
const servers = [
  ["express", "dist/express/mock-server.js"],
  ["fastify", "dist/fastify/mock-server.js"],
  ["nest", "dist/nest/mock-server.js"],
];

test("all framework examples exchange a scoped token and authorize the ticket API", async (t) => {
  for (const [framework, file] of servers) {
    await t.test(framework, async () => {
      const port = await availablePort();
      const output = [];
      const child = spawn(process.execPath, [file], {
        env: {
          ...process.env,
          PORT: String(port),
          MCP_GATEWAY_SERVICE_TOKEN: gatewayToken,
          APPLICATION_JWT_SECRET: jwtSecret,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => output.push(chunk));
      child.stderr.on("data", (chunk) => output.push(chunk));

      try {
        const baseUrl = `http://127.0.0.1:${port}`;
        const health = await waitForHealth(baseUrl, child);
        assert.equal(health.framework, framework);

        const denied = await fetch(`${baseUrl}/api/auth/mcp-token`, {
          method: "POST",
          headers: { authorization: "Bearer wrong-gateway-token", "content-type": "application/json" },
          body: JSON.stringify(exchangeBody(framework)),
        });
        assert.equal(denied.status, 401);

        const exchange = await fetch(`${baseUrl}/api/auth/mcp-token`, {
          method: "POST",
          headers: { authorization: `Bearer ${gatewayToken}`, "content-type": "application/json" },
          body: JSON.stringify(exchangeBody(framework)),
        });
        assert.equal(exchange.status, 200);
        assert.match(exchange.headers.get("cache-control") || "", /no-store/);
        const token = await exchange.json();
        assert.equal(token.tokenType, "Bearer");
        assert.deepEqual(token.scopes, ["tickets:read", "tickets:create"]);

        const authorization = `Bearer ${token.accessToken}`;
        const createdResponse = await fetch(`${baseUrl}/api/tickets`, {
          method: "POST",
          headers: { authorization, "content-type": "application/json" },
          body: JSON.stringify({ title: `${framework} smoke test`, priority: "high" }),
        });
        assert.equal(createdResponse.status, 201);
        const created = await createdResponse.json();
        assert.equal(created.ownerId, "app-user-1");

        const listResponse = await fetch(`${baseUrl}/api/tickets?status=open`, { headers: { authorization } });
        assert.equal(listResponse.status, 200);
        const listed = await listResponse.json();
        assert.equal(listed.length, 2);
      } catch (error) {
        error.message += `\n${Buffer.concat(output).toString("utf8")}`;
        throw error;
      } finally {
        child.kill();
        if (child.exitCode === null) await once(child, "exit");
      }
    });
  }
});

function exchangeBody(framework) {
  return {
    applicationUserId: "app-user-1",
    requestedScopes: ["tickets:read", "tickets:create"],
    actor: {
      rocketUserId: "R123",
      tenantId: "default",
      roomId: "ROOM",
      requestId: `MSG-${framework}`,
    },
  };
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("health check timed out");
}

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  return port;
}
