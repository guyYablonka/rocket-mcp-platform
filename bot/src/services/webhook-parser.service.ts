import { z } from "zod";
import type { RocketChatEvent } from "../domain/types.js";

const webhookPayloadSchema = z.record(z.string(), z.unknown());

export function normalizeWebhook(value: unknown): RocketChatEvent {
  const payload = webhookPayloadSchema.parse(value);
  const botValue = field(payload, "bot");
  return {
    token: String(field(payload, "token") ?? ""),
    bot: botValue === true || botValue === 1 || String(botValue).toLowerCase() === "true",
    roomId: String(field(payload, "channel_id", "roomId", "rid") ?? ""),
    roomName: String(field(payload, "channel_name", "roomName") ?? ""),
    messageId: String(field(payload, "message_id", "messageId", "_id") ?? ""),
    userId: String(field(payload, "user_id", "userId") ?? ""),
    username: String(field(payload, "user_name", "username") ?? ""),
    text: String(field(payload, "text", "msg") ?? ""),
  };
}

export function stripMention(text: string, botUsername: string): string {
  const escaped = escapeRegex(botUsername);
  return text
    .replace(new RegExp(`(?:^|\\s)@?${escaped}(?=\\s|[:,]|$)[:,]?`, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsMention(text: string, botUsername: string): boolean {
  const escaped = escapeRegex(botUsername);
  return new RegExp(`(?:^|\\s)@?${escaped}(?=\\s|[:,]|$)`, "i").test(text);
}

function field(payload: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (payload[name] !== undefined) return payload[name];
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
