import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import type {
  McpClient,
  MessageDedupeRepository,
  ModelClient,
  RocketChatClient,
} from "../src/domain/ports.js";
import { AgentService } from "../src/services/agent.service.js";
import { WebhookService } from "../src/services/webhook.service.js";
import { testConfig, webhookPayload } from "./fixtures.js";

describe("WebhookService", () => {
  it("acknowledges immediately, processes in the background, and deduplicates", async () => {
    const config = testConfig();
    const close = vi.fn(async () => {});
    const mcp: McpClient = {
      async listTools() { return []; },
      async callTool() { return {}; },
      close,
    };
    const model: ModelClient = {
      async complete() {
        return { role: "assistant", content: "Completed." };
      },
    };
    const postMessage = vi.fn(async () => ({ success: true }));
    const rocketChat: RocketChatClient = { postMessage };
    const seen = new Set<string>();
    const dedupe: MessageDedupeRepository = {
      add(id) {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      },
    };
    const logger = pino({ level: "silent" });
    const service = new WebhookService(
      config,
      dedupe,
      async () => mcp,
      new AgentService(model, config, logger),
      rocketChat,
      logger,
    );

    expect(service.handle(webhookPayload())).toEqual({ accepted: true, status: 202 });
    expect(service.handle(webhookPayload())).toEqual({
      accepted: false,
      status: 200,
      reason: "duplicate",
    });
    await service.drain();

    expect(postMessage).toHaveBeenCalledWith({
      roomId: "ROOM",
      text: "Completed.",
      threadMessageId: "MSG",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects invalid credentials before deduplication", () => {
    const config = testConfig();
    const add = vi.fn(() => true);
    const logger = pino({ level: "silent" });
    const service = new WebhookService(
      config,
      { add },
      async () => {
        throw new Error("must not run");
      },
      new AgentService({
        async complete() {
          return { role: "assistant", content: "unused" };
        },
      }, config, logger),
      { async postMessage() {} },
      logger,
    );

    expect(service.handle(webhookPayload({ token: "wrong" }))).toEqual({
      accepted: false,
      status: 401,
      reason: "invalid token",
    });
    expect(add).not.toHaveBeenCalled();
  });
});
