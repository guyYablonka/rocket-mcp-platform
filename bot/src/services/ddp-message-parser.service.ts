import { z } from "zod";
import type { RocketChatEvent } from "../domain/types.js";

const ddpMessageSchema = z.object({
  _id: z.string().min(1),
  rid: z.string().min(1),
  msg: z.string(),
  t: z.string().optional(),
  bot: z.unknown().optional(),
  u: z.object({
    _id: z.string().min(1),
    username: z.string().default(""),
  }),
});

export function normalizeDdpMessage(value: unknown): RocketChatEvent | undefined {
  const message = ddpMessageSchema.parse(value);
  if (message.t) return undefined;
  return {
    token: "",
    bot: Boolean(message.bot),
    roomId: message.rid,
    roomName: "",
    messageId: message._id,
    userId: message.u._id,
    username: message.u.username,
    text: message.msg,
  };
}
