import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";
import type { GatewayConfig } from "../config/env.js";
import type { Actor } from "../domain/types.js";

declare global { namespace Express { interface Request { actor?: Actor } } }

const bearer = (value: string | undefined) => /^Bearer\s+(.+)$/i.exec(value ?? "")?.[1];

export function actorAuth(config: GatewayConfig["actor"]) {
  const secret = new TextEncoder().encode(config.secret);
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = bearer(request.header("authorization"));
      if (!token) throw new Error("missing bearer token");
      const { payload } = await jwtVerify(token, secret, { issuer: config.issuer, audience: config.audience, algorithms: ["HS256"], clockTolerance: config.clockSkewSeconds });
      if (typeof payload.sub !== "string" || typeof payload.tenant_id !== "string" || typeof payload.request_id !== "string") throw new Error("missing actor claims");
      request.actor = Object.freeze({ rocketUserId: payload.sub, tenantId: payload.tenant_id, roomId: typeof payload.room_id === "string" ? payload.room_id : "", requestId: payload.request_id, username: typeof payload.username === "string" ? payload.username : "", tokenId: typeof payload.jti === "string" ? payload.jti : "" });
      next();
    } catch {
      response.setHeader("WWW-Authenticate", 'Bearer realm="rocket-mcp-gateway"');
      response.status(401).json({ error: "unauthorized" });
    }
  };
}
