import { resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3100),
  MCP_PATH: z.string().startsWith("/").default("/mcp"),
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_000_000),
  GATEWAY_PUBLIC_URL: z.string().url(),
  ACTOR_TOKEN_SECRET: z.string().min(32),
  ACTOR_TOKEN_ISSUER: z.string().default("rocket-mcp-bot"),
  ACTOR_TOKEN_AUDIENCE: z.string().optional(),
  ACTOR_TOKEN_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(0).default(30),
  APPLICATION_API_BASE_URL: z.string().url(),
  APPLICATION_TOKEN_EXCHANGE_URL: z.string().url(),
  APPLICATION_GATEWAY_TOKEN: z.string().min(16),
  APPLICATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  MAX_API_RESPONSE_CHARS: z.coerce.number().int().positive().default(20_000),
  TOOLS_MANIFEST_PATH: z.string().default("./config/tools.json"),
  USER_LINKS_PATH: z.string().default("./config/user-links.json")
});

export type GatewayConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const value = envSchema.parse(env);
  const publicUrl = value.GATEWAY_PUBLIC_URL.replace(/\/$/, "");
  return {
    http: { host: value.HOST, port: value.PORT, mcpPath: value.MCP_PATH, maxBodyBytes: value.MAX_BODY_BYTES },
    actor: {
      secret: value.ACTOR_TOKEN_SECRET,
      issuer: value.ACTOR_TOKEN_ISSUER,
      audience: value.ACTOR_TOKEN_AUDIENCE ?? `${publicUrl}${value.MCP_PATH}`,
      clockSkewSeconds: value.ACTOR_TOKEN_CLOCK_SKEW_SECONDS
    },
    application: {
      apiBaseUrl: value.APPLICATION_API_BASE_URL.replace(/\/$/, ""),
      tokenExchangeUrl: value.APPLICATION_TOKEN_EXCHANGE_URL,
      gatewayToken: value.APPLICATION_GATEWAY_TOKEN,
      timeoutMs: value.APPLICATION_TIMEOUT_MS,
      maxResponseChars: value.MAX_API_RESPONSE_CHARS
    },
    files: {
      tools: resolve(cwd, value.TOOLS_MANIFEST_PATH),
      links: resolve(cwd, value.USER_LINKS_PATH)
    }
  } as const;
}
