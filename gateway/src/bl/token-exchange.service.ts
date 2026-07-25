import type { GatewayConfig } from "../config/env.js";
import type { Actor, UserLink } from "../domain/types.js";

type CachedToken = { accessToken: string; expiresAt: number };
type TokenExchangeResponse = { accessToken: string; expiresIn?: number; scopes?: string[] };

export class TokenExchangeService {
  private readonly cache = new Map<string, CachedToken>();
  public constructor(private readonly config: GatewayConfig["application"]) {}

  public async getToken(link: UserLink, scopes: readonly string[], actor: Actor): Promise<string> {
    const key = `${link.tenantId}\u0000${link.applicationUserId}\u0000${[...scopes].sort().join(" ")}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.accessToken;
    const response = await fetch(this.config.tokenExchangeUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.gatewayToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ applicationUserId: link.applicationUserId, requestedScopes: scopes, actor: { rocketUserId: actor.rocketUserId, tenantId: actor.tenantId, roomId: actor.roomId, requestId: actor.requestId } }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });
    const result = await response.json().catch(() => null) as TokenExchangeResponse | null;
    if (!response.ok || !result?.accessToken) throw new Error(`Application token exchange failed with HTTP ${response.status}`);
    const grantedScopes = new Set(result.scopes ?? scopes);
    if (!scopes.every((scope) => grantedScopes.has(scope))) throw new Error("Application token exchange omitted a required scope");
    this.cache.set(key, { accessToken: result.accessToken, expiresAt: Date.now() + Math.max(1, result.expiresIn ?? 300) * 1_000 });
    return result.accessToken;
  }
}
