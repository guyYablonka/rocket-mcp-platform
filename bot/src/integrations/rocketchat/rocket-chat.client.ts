import type { AppConfig } from "../../config/config.js";
import type { RocketChatClient } from "../../domain/ports.js";
import { fetchWithTimeout, remoteResponseError } from "../../utils/http.js";

export class RocketChatRestClient implements RocketChatClient {
  constructor(private readonly config: AppConfig["rocketChat"]) {}

  async postMessage(input: {
    roomId: string;
    text: string;
    threadMessageId?: string;
  }): Promise<unknown> {
    const response = await fetchWithTimeout(
      `${this.config.url}/api/v1/chat.postMessage`,
      {
        method: "POST",
        headers: {
          "X-Auth-Token": this.config.authToken,
          "X-User-Id": this.config.userId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId: input.roomId,
          text: input.text,
          parseUrls: false,
          ...(this.config.replyInThread && input.threadMessageId
            ? { tmid: input.threadMessageId }
            : {}),
        }),
      },
      30_000,
    );
    if (!response.ok) throw await remoteResponseError(response);
    return response.json();
  }
}
