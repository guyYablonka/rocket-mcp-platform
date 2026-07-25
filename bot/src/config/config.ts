import { z } from "zod";

const positiveInteger = (fallback: number) => z.preprocess(
  (value) => value === undefined || value === "" ? fallback : value,
  z.coerce.number().int().positive(),
);

const nonnegativeInteger = (fallback: number) => z.preprocess(
  (value) => value === undefined || value === "" ? fallback : value,
  z.coerce.number().int().nonnegative(),
);

const booleanValue = (fallback: boolean) => z.preprocess((value) => {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().trim().default("info"),
  HOST: z.string().trim().default("0.0.0.0"),
  PORT: positiveInteger(3000).pipe(z.number().max(65_535)),
  TRUST_PROXY_HOPS: nonnegativeInteger(0),
  WEBHOOK_PATH: z.string().trim().startsWith("/").default("/webhooks/rocketchat"),
  MAX_WEBHOOK_BODY_BYTES: positiveInteger(1_000_000),
  WEBHOOK_RATE_LIMIT_WINDOW_MS: positiveInteger(60_000),
  WEBHOOK_RATE_LIMIT_MAX: positiveInteger(60),

  ROCKETCHAT_URL: z.string().trim().url(),
  ROCKETCHAT_TRANSPORT: z.enum(["ddp", "webhook"]).default("ddp"),
  ROCKETCHAT_DDP_ROOM_IDS: z.string().default(""),
  ROCKETCHAT_DDP_CONNECT_TIMEOUT_MS: positiveInteger(15_000),
  ROCKETCHAT_DDP_RECONNECT_MS: positiveInteger(5_000),
  ROCKETCHAT_WEBHOOK_TOKEN: z.string().trim().default(""),
  ROCKETCHAT_BOT_USERNAME: z.string().trim().min(1),
  ROCKETCHAT_USER_ID: z.string().trim().min(1),
  ROCKETCHAT_AUTH_TOKEN: z.string().min(1),
  ROCKETCHAT_REPLY_IN_THREAD: booleanValue(true),
  ROCKETCHAT_REQUIRE_MENTION: booleanValue(true),
  ROCKETCHAT_ALLOWED_ROOM_IDS: z.string().default(""),
  ROCKETCHAT_ALLOWED_USER_IDS: z.string().default(""),
  ROCKETCHAT_TENANT_ID: z.string().trim().default("default"),

  MODEL_PROVIDER: z.enum(["qwen", "kimi", "custom"]).default("custom"),
  MODEL_API_KEY: z.string().min(1),
  MODEL_NAME: z.string().trim().min(1),
  MODEL_BASE_URL: z.string().trim().default(""),
  MODEL_TIMEOUT_MS: positiveInteger(120_000),

  MCP_URL: z.string().trim().url(),
  MCP_AUTH_MODE: z.enum(["actor-jwt", "static"]).default("actor-jwt"),
  MCP_BEARER_TOKEN: z.string().default(""),
  GATEWAY_ACTOR_SECRET: z.string().default(""),
  GATEWAY_ACTOR_ISSUER: z.string().trim().default("rocket-mcp-bot"),
  GATEWAY_ACTOR_AUDIENCE: z.string().trim().default(""),
  GATEWAY_ACTOR_TTL_SECONDS: positiveInteger(120).pipe(z.number().max(3_600)),
  MCP_HEADERS_JSON: z.string().default("{}"),
  MCP_DEFAULT_TOOL_ARGS_JSON: z.string().default("{}"),
  MCP_TIMEOUT_MS: positiveInteger(120_000),
  MCP_TOOL_POLICY: z.enum(["allow-list", "allow-all", "deny-all"]).default("allow-list"),
  MCP_TOOL_ALLOWLIST: z.string().default(""),
  MCP_TOOL_TRIGGER_TERMS: z.string().default(""),
  MAX_TOOL_ITERATIONS: positiveInteger(6),
  MAX_TOOL_RESULT_CHARS: positiveInteger(12_000),
  CONVERSATION_HISTORY_TURNS: nonnegativeInteger(6),
  CONVERSATION_HISTORY_TTL_MS: positiveInteger(1_800_000),
  SYSTEM_PROMPT: z.string().default(""),
});

export interface AppConfig {
  environment: "development" | "test" | "production";
  logLevel: string;
  http: {
    host: string;
    port: number;
    webhookPath: string;
    trustProxyHops: number;
    maxBodyBytes: number;
    rateLimitWindowMs: number;
    rateLimitMax: number;
  };
  rocketChat: {
    url: string;
    transport: "ddp" | "webhook";
    ddpRoomIds: string[];
    ddpConnectTimeoutMs: number;
    ddpReconnectMs: number;
    webhookToken: string;
    botUsername: string;
    userId: string;
    authToken: string;
    replyInThread: boolean;
    requireMention: boolean;
    allowedRoomIds: Set<string>;
    allowedUserIds: Set<string>;
    tenantId: string;
  };
  model: {
    provider: "qwen" | "kimi" | "custom";
    apiKey: string;
    name: string;
    baseUrl: string;
    timeoutMs: number;
  };
  mcp: {
    url: string;
    authMode: "actor-jwt" | "static";
    bearerToken: string;
    actorSecret: string;
    actorIssuer: string;
    actorAudience: string;
    actorTtlSeconds: number;
    headers: Record<string, string>;
    defaultToolArgs: Record<string, unknown>;
    timeoutMs: number;
    toolPolicy: "allow-list" | "allow-all" | "deny-all";
    toolAllowlist: string[];
    toolTriggerTerms: string[];
    maxToolIterations: number;
    maxToolResultChars: number;
  };
  conversation: {
    historyTurns: number;
    historyTtlMs: number;
  };
  systemPrompt: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }
  const env = result.data;
  const modelBaseUrl = trimTrailingSlash(
    env.MODEL_BASE_URL || (env.MODEL_PROVIDER === "kimi" ? "https://api.moonshot.ai/v1" : ""),
  );
  if (!modelBaseUrl) throw new Error("Invalid configuration: MODEL_BASE_URL is required for this provider");
  assertUrl(modelBaseUrl, "MODEL_BASE_URL");

  if (env.MCP_AUTH_MODE === "actor-jwt" && env.GATEWAY_ACTOR_SECRET.length < 32) {
    throw new Error("Invalid configuration: GATEWAY_ACTOR_SECRET must contain at least 32 characters");
  }
  if (env.MCP_AUTH_MODE === "static" && !env.MCP_BEARER_TOKEN) {
    throw new Error("Invalid configuration: MCP_BEARER_TOKEN is required when MCP_AUTH_MODE=static");
  }
  const ddpRoomIds = csvList(env.ROCKETCHAT_DDP_ROOM_IDS);

  return {
    environment: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    http: {
      host: env.HOST,
      port: env.PORT,
      webhookPath: env.WEBHOOK_PATH,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      maxBodyBytes: env.MAX_WEBHOOK_BODY_BYTES,
      rateLimitWindowMs: env.WEBHOOK_RATE_LIMIT_WINDOW_MS,
      rateLimitMax: env.WEBHOOK_RATE_LIMIT_MAX,
    },
    rocketChat: {
      url: trimTrailingSlash(env.ROCKETCHAT_URL),
      transport: env.ROCKETCHAT_TRANSPORT,
      ddpRoomIds,
      ddpConnectTimeoutMs: env.ROCKETCHAT_DDP_CONNECT_TIMEOUT_MS,
      ddpReconnectMs: env.ROCKETCHAT_DDP_RECONNECT_MS,
      webhookToken: env.ROCKETCHAT_WEBHOOK_TOKEN,
      botUsername: env.ROCKETCHAT_BOT_USERNAME.replace(/^@/, ""),
      userId: env.ROCKETCHAT_USER_ID,
      authToken: env.ROCKETCHAT_AUTH_TOKEN,
      replyInThread: env.ROCKETCHAT_REPLY_IN_THREAD,
      requireMention: env.ROCKETCHAT_REQUIRE_MENTION,
      allowedRoomIds: csvSet(env.ROCKETCHAT_ALLOWED_ROOM_IDS),
      allowedUserIds: csvSet(env.ROCKETCHAT_ALLOWED_USER_IDS),
      tenantId: env.ROCKETCHAT_TENANT_ID,
    },
    model: {
      provider: env.MODEL_PROVIDER,
      apiKey: env.MODEL_API_KEY,
      name: env.MODEL_NAME,
      baseUrl: modelBaseUrl,
      timeoutMs: env.MODEL_TIMEOUT_MS,
    },
    mcp: {
      url: env.MCP_URL,
      authMode: env.MCP_AUTH_MODE,
      bearerToken: env.MCP_BEARER_TOKEN,
      actorSecret: env.GATEWAY_ACTOR_SECRET,
      actorIssuer: env.GATEWAY_ACTOR_ISSUER,
      actorAudience: env.GATEWAY_ACTOR_AUDIENCE || env.MCP_URL,
      actorTtlSeconds: env.GATEWAY_ACTOR_TTL_SECONDS,
      headers: parseHeaders(env.MCP_HEADERS_JSON),
      defaultToolArgs: parseJsonObject(
        env.MCP_DEFAULT_TOOL_ARGS_JSON,
        "MCP_DEFAULT_TOOL_ARGS_JSON",
      ),
      timeoutMs: env.MCP_TIMEOUT_MS,
      toolPolicy: env.MCP_TOOL_POLICY,
      toolAllowlist: csvList(env.MCP_TOOL_ALLOWLIST),
      toolTriggerTerms: csvList(env.MCP_TOOL_TRIGGER_TERMS),
      maxToolIterations: env.MAX_TOOL_ITERATIONS,
      maxToolResultChars: env.MAX_TOOL_RESULT_CHARS,
    },
    conversation: {
      historyTurns: env.CONVERSATION_HISTORY_TURNS,
      historyTtlMs: env.CONVERSATION_HISTORY_TTL_MS,
    },
    systemPrompt: env.SYSTEM_PROMPT,
  };
}

function parseHeaders(value: string): Record<string, string> {
  const parsed = parseJsonObject(value, "MCP_HEADERS_JSON");
  const protectedHeaders = new Set(["authorization", "content-type", "accept", "mcp-session-id", "mcp-protocol-version"]);
  const headers: Record<string, string> = {};
  for (const [name, item] of Object.entries(parsed)) {
    if (protectedHeaders.has(name.toLowerCase())) {
      throw new Error(`Invalid configuration: MCP_HEADERS_JSON cannot override ${name}`);
    }
    headers[name] = String(item);
  }
  return headers;
}

function parseJsonObject(value: string, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid configuration: ${name} must be valid JSON: ${errorMessage(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid configuration: ${name} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function csvSet(value: string): Set<string> {
  return new Set(csvList(value));
}

function csvList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function assertUrl(value: string, name: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid configuration: ${name} must be a valid URL`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
