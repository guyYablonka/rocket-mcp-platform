import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import type { AppConfig } from "../config/config.js";
import type { RocketChatEvent } from "../domain/types.js";

type ActorAuthConfig = Pick<
  AppConfig["mcp"],
  "actorSecret" | "actorIssuer" | "actorAudience" | "actorTtlSeconds"
>;

export class ActorTokenService {
  async sign(
    event: RocketChatEvent,
    tenantId: string,
    auth: ActorAuthConfig,
    now = Math.floor(Date.now() / 1000),
  ): Promise<string> {
    if (auth.actorSecret.length < 32) {
      throw new Error("GATEWAY_ACTOR_SECRET must contain at least 32 characters");
    }
    const secret = new TextEncoder().encode(auth.actorSecret);
    return new SignJWT({
      tenant_id: tenantId,
      room_id: event.roomId,
      request_id: event.messageId,
      username: event.username,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(auth.actorIssuer)
      .setAudience(auth.actorAudience)
      .setSubject(event.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + auth.actorTtlSeconds)
      .setJti(randomUUID())
      .sign(secret);
  }
}
