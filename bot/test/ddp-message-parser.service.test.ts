import { describe, expect, it } from "vitest";
import { normalizeDdpMessage } from "../src/services/ddp-message-parser.service.js";

describe("normalizeDdpMessage", () => {
  it("normalizes a Rocket.Chat message", () => {
    expect(normalizeDdpMessage({
      _id: "MSG",
      rid: "ROOM",
      msg: "@helper create a ticket",
      u: { _id: "USER", username: "alice" },
    })).toEqual({
      token: "",
      bot: false,
      roomId: "ROOM",
      roomName: "",
      messageId: "MSG",
      userId: "USER",
      username: "alice",
      text: "@helper create a ticket",
    });
  });

  it("ignores system messages", () => {
    expect(normalizeDdpMessage({
      _id: "MSG",
      rid: "ROOM",
      msg: "alice joined",
      t: "uj",
      u: { _id: "USER", username: "alice" },
    })).toBeUndefined();
  });
});
