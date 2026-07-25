import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ActorContext, ExchangeContext, GatewayIdentity, TokenExchangeInput, TokenExchangeOptions, TokenExchangeResponse } from "../types.js";

const noStoreHeaders = Object.freeze({ "Cache-Control": "no-store", Pragma: "no-cache", "Content-Type": "application/json" });
const scopeSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9:._/-]+$/);
const actorSchema = z.object({ rocketUserId: z.string().min(1).max(256), tenantId: z.string().min(1).max(256), roomId: z.string().min(1).max(256).optional(), requestId: z.string().min(1).max(256) }).strict();
const bodySchema = z.object({ applicationUserId: z.string().min(1).max(256), requestedScopes: z.array(scopeSchema).min(1), actor: actorSchema.optional() }).strict();

export const tokenExchangeRequestSchema = bodySchema;
const header = (headers: TokenExchangeInput["headers"], name: string) => {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};
const response = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): TokenExchangeResponse => ({ status, headers: { ...noStoreHeaders, ...headers }, body });
const errorResponse = (status: number, error: string, description: string, requestId: string, headers?: Record<string, string>) => response(status, { error, error_description: description, requestId }, headers);
const digest = (value: string) => createHash("sha256").update(value).digest();

export function createTokenExchange(options: TokenExchangeOptions) {
  const maxScopes = options.maxScopes ?? 32;
  if (!Number.isInteger(maxScopes) || maxScopes < 1) throw new TypeError("maxScopes must be a positive integer");
  const requireActor = options.requireActor !== false;
  const emit = async (event: Record<string, unknown>) => { try { await options.audit?.(event); } catch { /* audit must not break authorization */ } };

  return async (input: TokenExchangeInput): Promise<TokenExchangeResponse> => {
    const suppliedRequestId = typeof (input.body as { actor?: { requestId?: unknown } } | undefined)?.actor?.requestId === "string" ? (input.body as { actor: { requestId: string } }).actor.requestId : undefined;
    const requestId = suppliedRequestId || header(input.headers, "x-request-id") || randomUUID();
    const context: ExchangeContext = Object.freeze({ requestId, ip: input.ip ?? "", userAgent: header(input.headers, "user-agent") ?? "" });
    let gateway: GatewayIdentity | null;
    try { gateway = await options.authenticateGateway({ authorization: header(input.headers, "authorization"), headers: input.headers, context }); }
    catch (cause) { await emit({ type: "gateway_auth_error", requestId, cause: cause instanceof Error ? cause.message : "unknown" }); return errorResponse(500, "server_error", "Gateway authentication failed unexpectedly", requestId); }
    if (!gateway) { await emit({ type: "gateway_auth_denied", requestId, ip: context.ip }); return errorResponse(401, "invalid_client", "Gateway authentication failed", requestId, { "WWW-Authenticate": 'Bearer realm="mcp-token-exchange"' }); }

    const parsed = bodySchema.safeParse(input.body);
    if (!parsed.success) return errorResponse(400, "invalid_request", "The token exchange request is invalid", requestId);
    const requestedScopes = [...new Set(parsed.data.requestedScopes)];
    if (requestedScopes.length > maxScopes) return errorResponse(400, "invalid_scope", "requestedScopes is invalid", requestId);
    const actor: ActorContext | undefined = parsed.data.actor ? Object.freeze({ ...parsed.data.actor, roomId: parsed.data.actor.roomId ?? "" }) : undefined;
    if (requireActor && !actor) return errorResponse(400, "invalid_request", "actor identity is invalid", requestId);
    const effectiveActor = actor ?? Object.freeze({ rocketUserId: "", tenantId: "", roomId: "", requestId });

    try {
      const user = await options.findUser({ applicationUserId: parsed.data.applicationUserId, actor: effectiveActor, gateway, context });
      if (!user || user.disabled) { await emit({ type: "exchange_denied", reason: "user_unavailable", requestId, gatewayId: gateway.id }); return errorResponse(403, "access_denied", "The delegated user is unavailable", requestId); }
      const grantedScopes = [...new Set(await options.authorizeScopes({ user, requestedScopes, actor: effectiveActor, gateway, context }))];
      if (!requestedScopes.every((scope) => grantedScopes.includes(scope))) { await emit({ type: "exchange_denied", reason: "insufficient_scope", requestId, gatewayId: gateway.id }); return errorResponse(403, "invalid_scope", "One or more requested scopes are not permitted", requestId); }
      const token = await options.issueToken({ user, scopes: requestedScopes, actor: effectiveActor, gateway, context });
      if (!token?.accessToken || token.accessToken.length > 16_384 || !Number.isFinite(token.expiresIn) || token.expiresIn < 1) return errorResponse(500, "server_error", "Token issuer returned an invalid result", requestId);
      await emit({ type: "exchange_succeeded", requestId, gatewayId: gateway.id, applicationUserId: parsed.data.applicationUserId, scopes: requestedScopes, expiresIn: token.expiresIn });
      return response(200, { accessToken: token.accessToken, tokenType: token.tokenType ?? "Bearer", expiresIn: token.expiresIn, scopes: requestedScopes });
    } catch (cause) {
      await emit({ type: "exchange_failed", requestId, gatewayId: gateway.id, cause: cause instanceof Error ? cause.message : "unknown" });
      return errorResponse(500, "server_error", "Token exchange failed unexpectedly", requestId);
    }
  };
}

export function createStaticGatewayAuthenticator({ tokens }: { tokens: Array<string | { id: string; token: string }> }) {
  const entries = tokens.map((entry, index) => typeof entry === "string" ? { id: `gateway-${index + 1}`, token: entry } : entry).map((entry) => {
    if (!entry.id || entry.token.length < 16) throw new TypeError("Gateway tokens need an ID and at least 16 characters");
    return { id: entry.id, digest: digest(entry.token) };
  });
  if (!entries.length) throw new TypeError("At least one gateway token is required");
  return async ({ authorization }: { authorization?: string }) => {
    const candidate = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
    if (!candidate) return null;
    const candidateDigest = digest(candidate);
    const match = entries.find((entry) => entry.digest.length === candidateDigest.length && timingSafeEqual(entry.digest, candidateDigest));
    return match ? Object.freeze({ id: match.id }) : null;
  };
}
