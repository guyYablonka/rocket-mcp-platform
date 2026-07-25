import { describe, expect, it } from "vitest";
import {
  containsMention,
  normalizeWebhook,
  stripMention,
} from "../src/services/webhook-parser.service.js";

describe("webhook parsing", () => {
  it("normalizes the standard Rocket.Chat outgoing payload", () => {
    expect(normalizeWebhook({
      token: "secret",
      channel_id: "room",
      channel_name: "general",
      message_id: "msg",
      user_id: "user",
      user_name: "alice",
      text: "@helper do it",
    })).toEqual({
      token: "secret",
      bot: false,
      roomId: "room",
      roomName: "general",
      messageId: "msg",
      userId: "user",
      username: "alice",
      text: "@helper do it",
    });
    expect(normalizeWebhook({ bot: "false" }).bot).toBe(false);
    expect(normalizeWebhook({ bot: "true" }).bot).toBe(true);
  });

  it("detects and removes a mention without damaging the request", () => {
    expect(containsMention("please @helper: create a ticket", "helper")).toBe(true);
    expect(stripMention("please @helper: create a ticket", "helper"))
      .toBe("please create a ticket");
    expect(containsMention("@someone-else hello", "helper")).toBe(false);
    expect(containsMention("helper create a ticket", "helper")).toBe(false);
  });
});
