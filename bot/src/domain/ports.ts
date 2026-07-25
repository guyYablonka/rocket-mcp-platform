import type {
  McpTool,
  ModelCompletion,
  ModelMessage,
  ModelTool,
  ModelToolChoice,
  RocketChatEvent,
} from "./types.js";

export interface McpClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export type McpClientFactory = (event: RocketChatEvent) => Promise<McpClient>;

export interface ModelClient {
  complete(
    messages: ModelMessage[],
    tools?: ModelTool[],
    toolChoice?: ModelToolChoice,
  ): Promise<ModelCompletion>;
}

export interface RocketChatClient {
  postMessage(input: {
    roomId: string;
    text: string;
    threadMessageId?: string;
  }): Promise<unknown>;
}

export interface MessageDedupeRepository {
  add(messageId: string): boolean;
}
