import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config.js";

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  ROCKETCHAT_URL: "https://chat.example.com",
  ROCKETCHAT_TRANSPORT: "webhook",
  ROCKETCHAT_WEBHOOK_TOKEN: "webhook-token",
  ROCKETCHAT_BOT_USERNAME: "helper",
  ROCKETCHAT_USER_ID: "BOT",
  ROCKETCHAT_AUTH_TOKEN: "bot-token",
  MODEL_PROVIDER: "kimi",
  MODEL_API_KEY: "model-key",
  MODEL_NAME: "kimi-test",
  MCP_URL: "https://gateway.example.com/mcp",
  MCP_AUTH_MODE: "actor-jwt",
  GATEWAY_ACTOR_SECRET: "a-test-secret-that-is-long-enough-123",
};

describe("loadConfig", () => {
  it("applies provider defaults and parses lists", () => {
    const config = loadConfig({
      ...validEnvironment,
      ROCKETCHAT_ALLOWED_ROOM_IDS: "R1, R2",
      MCP_TOOL_ALLOWLIST: "get_*, create_ticket",
      MCP_TOOL_TRIGGER_TERMS: "tasks, issues",
      MCP_DEFAULT_TOOL_ARGS_JSON: JSON.stringify({
        cloudId: "https://example.atlassian.net",
      }),
      CONVERSATION_HISTORY_TURNS: "4",
    });
    expect(config.model.baseUrl).toBe("https://api.moonshot.ai/v1");
    expect(config.rocketChat.allowedRoomIds).toEqual(new Set(["R1", "R2"]));
    expect(config.mcp.toolAllowlist).toEqual(["get_*", "create_ticket"]);
    expect(config.mcp.toolTriggerTerms).toEqual(["tasks", "issues"]);
    expect(config.mcp.defaultToolArgs).toEqual({
      cloudId: "https://example.atlassian.net",
    });
    expect(config.conversation.historyTurns).toBe(4);
  });

  it("allows webhook token verification to be disabled", () => {
    const environment = { ...validEnvironment };
    delete environment.ROCKETCHAT_WEBHOOK_TOKEN;

    expect(loadConfig(environment).rocketChat.webhookToken).toBe("");
  });

  it("uses the joined-room stream when DDP room IDs are omitted", () => {
    const allJoinedRooms = loadConfig({
      ...validEnvironment,
      ROCKETCHAT_TRANSPORT: "ddp",
    });
    expect(allJoinedRooms.rocketChat.ddpRoomIds).toEqual([]);

    const config = loadConfig({
      ...validEnvironment,
      ROCKETCHAT_TRANSPORT: "ddp",
      ROCKETCHAT_DDP_ROOM_IDS: "ROOM1, ROOM2",
    });
    expect(config.rocketChat.ddpRoomIds).toEqual(["ROOM1", "ROOM2"]);
  });

  it("rejects a short actor secret", () => {
    expect(() => loadConfig({
      ...validEnvironment,
      GATEWAY_ACTOR_SECRET: "short",
    })).toThrow(/at least 32 characters/);
  });

  it("prevents extra MCP headers from replacing authorization", () => {
    expect(() => loadConfig({
      ...validEnvironment,
      MCP_HEADERS_JSON: JSON.stringify({ Authorization: "unsafe" }),
    })).toThrow(/cannot override Authorization/);
  });
});
