import type { AppConfig } from "../src/config/config.js";

export function testConfig(): AppConfig {
  return {
    environment: "test",
    logLevel: "silent",
    http: {
      host: "127.0.0.1",
      port: 3000,
      webhookPath: "/webhooks/rocketchat",
      trustProxyHops: 0,
      maxBodyBytes: 10_000,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 100,
    },
    rocketChat: {
      url: "https://chat.example.com",
      transport: "webhook",
      ddpRoomIds: [],
      ddpConnectTimeoutMs: 2_000,
      ddpReconnectMs: 100,
      webhookToken: "webhook-secret",
      botUsername: "helper",
      userId: "BOT",
      authToken: "bot-token",
      replyInThread: true,
      requireMention: true,
      allowedRoomIds: new Set(),
      allowedUserIds: new Set(),
      tenantId: "default",
    },
    model: {
      provider: "custom",
      apiKey: "model-key",
      name: "test-model",
      baseUrl: "https://model.example.com/v1",
      timeoutMs: 2_000,
    },
    mcp: {
      url: "https://gateway.example.com/mcp",
      authMode: "actor-jwt",
      bearerToken: "",
      actorSecret: "a-test-secret-that-is-long-enough-123",
      actorIssuer: "rocket-mcp-bot",
      actorAudience: "https://gateway.example.com/mcp",
      actorTtlSeconds: 120,
      headers: {},
      defaultToolArgs: {},
      timeoutMs: 2_000,
      toolPolicy: "allow-all",
      toolAllowlist: [],
      toolTriggerTerms: [],
      maxToolIterations: 3,
      maxToolResultChars: 2_000,
    },
    systemPrompt: "",
  };
}

export function webhookPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token: "webhook-secret",
    channel_id: "ROOM",
    channel_name: "help",
    message_id: "MSG",
    user_id: "R123",
    user_name: "alice",
    text: "@helper create a ticket",
    ...overrides,
  };
}
