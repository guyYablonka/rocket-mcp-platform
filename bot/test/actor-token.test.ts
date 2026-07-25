import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { ActorTokenService } from "../src/services/actor-token.service.js";
import { testConfig } from "./fixtures.js";

describe("ActorTokenService", () => {
  it("signs a short-lived gateway token bound to the Rocket.Chat actor", async () => {
    const config = testConfig();
    const token = await new ActorTokenService().sign({
      token: "",
      bot: false,
      userId: "R123",
      roomId: "ROOM",
      messageId: "MSG",
      username: "alice",
      roomName: "help",
      text: "do it",
    }, "tenant-a", config.mcp, 1_000);

    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(config.mcp.actorSecret),
      {
        issuer: config.mcp.actorIssuer,
        audience: config.mcp.actorAudience,
        currentDate: new Date(1_000_000),
      },
    );
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe("R123");
    expect(payload.tenant_id).toBe("tenant-a");
    expect(payload.room_id).toBe("ROOM");
    expect(payload.request_id).toBe("MSG");
    expect(payload.exp).toBe(1_120);
  });
});
