import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { TokenExchangeOptions, TokenResult } from "../types.js";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (secret: string, input: string) => createHmac("sha256", secret).update(input).digest();
const requireSecret = (secret: string) => { if (secret.length < 32) throw new TypeError("JWT secret must contain at least 32 characters"); };
type JwtOptions = { secret: string; issuer: string; audience: string; ttlSeconds?: number; keyId?: string; clockSkewSeconds?: number; getSubject?: (user: Parameters<TokenExchangeOptions["issueToken"]>[0]["user"]) => string | undefined; additionalClaims?: Record<string, unknown> | ((input: Parameters<TokenExchangeOptions["issueToken"]>[0]) => Record<string, unknown> | Promise<Record<string, unknown>>); };

export function createHs256JwtIssuer(options: JwtOptions) {
  requireSecret(options.secret);
  const ttlSeconds = options.ttlSeconds ?? 300;
  if (!options.issuer || !options.audience || !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) throw new TypeError("JWT issuer, audience, and ttlSeconds are invalid");
  return async (input: Parameters<TokenExchangeOptions["issueToken"]>[0]): Promise<TokenResult> => {
    const subject = options.getSubject?.(input.user) ?? input.user.id ?? input.user.applicationUserId;
    if (typeof subject !== "string" || !subject) throw new Error("Token subject is missing");
    const customClaims = typeof options.additionalClaims === "function" ? await options.additionalClaims(input) : options.additionalClaims ?? {};
    for (const claim of ["iss", "aud", "sub", "iat", "exp", "jti", "scope"]) if (claim in customClaims) throw new Error("additionalClaims cannot override reserved JWT claims");
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "HS256", typ: "JWT", ...(options.keyId ? { kid: options.keyId } : {}) });
    const payload = encode({ ...customClaims, iss: options.issuer, aud: options.audience, sub: subject, iat: now, exp: now + ttlSeconds, jti: randomUUID(), scope: input.scopes.join(" ") });
    const signed = `${header}.${payload}`;
    return { accessToken: `${signed}.${sign(options.secret, signed).toString("base64url")}`, tokenType: "Bearer", expiresIn: ttlSeconds, scopes: input.scopes };
  };
}

export function verifyHs256Jwt(token: string, options: Pick<JwtOptions, "secret" | "issuer" | "audience" | "clockSkewSeconds">, now = Math.floor(Date.now() / 1000)) {
  requireSecret(options.secret);
  const [encodedHeader, encodedPayload, encodedSignature, ...extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra.length) throw new Error("Malformed JWT");
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: string; typ?: string };
  const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>;
  const expected = sign(options.secret, `${encodedHeader}.${encodedPayload}`); const actual = Buffer.from(encodedSignature, "base64url");
  if (header.alg !== "HS256" || header.typ !== "JWT" || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid JWT");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]; const skew = options.clockSkewSeconds ?? 0;
  if (claims.iss !== options.issuer || !audience.includes(options.audience) || typeof claims.exp !== "number" || claims.exp <= now - skew || typeof claims.sub !== "string" || !claims.sub) throw new Error("Invalid JWT claims");
  return Object.freeze(claims);
}
