import { describe, expect, it } from "vitest";
import { createStaticGatewayAuthenticator, createTokenExchange } from "../src/index.js";

describe("createTokenExchange", () => {
  const authenticateGateway = createStaticGatewayAuthenticator({ tokens: [{ id: "gateway", token: "test-gateway-token-with-at-least-16-chars" }] });
  const exchange = createTokenExchange({
    authenticateGateway,
    findUser: async () => ({ id: "application-user" }),
    authorizeScopes: async ({ requestedScopes }) => requestedScopes,
    issueToken: async ({ scopes }) => ({ accessToken: "delegated-access-token", expiresIn: 300, scopes })
  });

  it("exchanges an authenticated delegated request", async () => {
    const result = await exchange({ headers: { authorization: "Bearer test-gateway-token-with-at-least-16-chars" }, body: { applicationUserId: "application-user", requestedScopes: ["tickets:read"], actor: { rocketUserId: "rocket-user", tenantId: "tenant", requestId: "request" } } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ accessToken: "delegated-access-token", scopes: ["tickets:read"] });
  });

  it("authenticates the gateway before accepting malformed payloads", async () => {
    const result = await exchange({ body: { unexpected: true } });
    expect(result.status).toBe(401);
  });
});
