import { createHash, timingSafeEqual } from "node:crypto";
import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
import type {
  McpClientFactory,
  MessageDedupeRepository,
  RocketChatClient,
} from "../domain/ports.js";
import type { RocketChatEvent, WebhookResult } from "../domain/types.js";
import { AgentService } from "./agent.service.js";
import {
  containsMention,
  normalizeWebhook,
  stripMention,
} from "./webhook-parser.service.js";

export class WebhookService {
  private readonly activeTasks = new Set<Promise<void>>();

  constructor(
    private readonly config: AppConfig,
    private readonly dedupe: MessageDedupeRepository,
    private readonly mcpFactory: McpClientFactory,
    private readonly agent: AgentService,
    private readonly rocketChat: RocketChatClient,
    private readonly logger: Logger,
  ) {}

  handle(payload: unknown): WebhookResult {
    let event: RocketChatEvent;
    try {
      event = normalizeWebhook(payload);
    } catch {
      return { accepted: false, status: 400, reason: "invalid payload" };
    }

    const rejection = this.rejectionReason(event);
    if (rejection) return rejection;

    const instruction = stripMention(event.text, this.config.rocketChat.botUsername);
    if (!instruction) return { accepted: false, status: 400, reason: "empty request" };

    this.logger.info(
      { messageId: event.messageId, roomId: event.roomId, userId: event.userId },
      "request accepted",
    );
    const task = this.processAccepted(event, instruction);
    this.activeTasks.add(task);
    void task.finally(() => this.activeTasks.delete(task));
    return { accepted: true, status: 202 };
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.activeTasks]);
  }

  private rejectionReason(event: RocketChatEvent): WebhookResult | undefined {
    if (!sameSecret(event.token, this.config.rocketChat.webhookToken)) {
      return { accepted: false, status: 401, reason: "invalid token" };
    }
    if (
      event.bot
      || event.username.toLowerCase() === this.config.rocketChat.botUsername.toLowerCase()
    ) {
      return { accepted: false, status: 200, reason: "bot message" };
    }
    if (!event.roomId || !event.messageId || !event.userId || !event.text) {
      return { accepted: false, status: 400, reason: "missing message fields" };
    }
    if (
      this.config.rocketChat.requireMention
      && !containsMention(event.text, this.config.rocketChat.botUsername)
    ) {
      return { accepted: false, status: 200, reason: "bot was not mentioned" };
    }
    if (
      this.config.rocketChat.allowedRoomIds.size > 0
      && !this.config.rocketChat.allowedRoomIds.has(event.roomId)
    ) {
      return { accepted: false, status: 403, reason: "room not allowed" };
    }
    if (
      this.config.rocketChat.allowedUserIds.size > 0
      && !this.config.rocketChat.allowedUserIds.has(event.userId)
    ) {
      return { accepted: false, status: 403, reason: "user not allowed" };
    }
    if (!this.dedupe.add(event.messageId)) {
      return { accepted: false, status: 200, reason: "duplicate" };
    }
    return undefined;
  }

  private async processAccepted(event: RocketChatEvent, instruction: string): Promise<void> {
    let mcp;
    try {
      mcp = await this.mcpFactory(event);
      const text = await this.agent.run({
        instruction,
        context: event,
        mcp,
      });
      await this.rocketChat.postMessage({
        roomId: event.roomId,
        text,
        threadMessageId: event.messageId,
      });
      this.logger.info({ messageId: event.messageId }, "reply posted");
    } catch (error) {
      this.logger.error(
        { messageId: event.messageId, err: error },
        "request failed",
      );
      try {
        await this.rocketChat.postMessage({
          roomId: event.roomId,
          text: "I couldn’t complete that request. Please try again, or ask an administrator to check the bot logs.",
          threadMessageId: event.messageId,
        });
      } catch (postError) {
        this.logger.error(
          { messageId: event.messageId, err: postError },
          "error reply failed",
        );
      }
    } finally {
      if (mcp) {
        try {
          await mcp.close();
        } catch (closeError) {
          this.logger.warn(
            { messageId: event.messageId, err: closeError },
            "MCP client close failed",
          );
        }
      }
    }
  }
}

function sameSecret(actual: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}
