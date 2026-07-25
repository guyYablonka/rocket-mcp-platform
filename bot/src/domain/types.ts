export interface RocketChatEvent {
  token: string;
  bot: boolean;
  roomId: string;
  roomName: string;
  messageId: string;
  userId: string;
  username: string;
  text: string;
}

export interface WebhookResult {
  accepted: boolean;
  status: number;
  reason?: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ModelToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ModelToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface ModelTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ModelToolChoice = "auto" | "required";

export interface ModelCompletion {
  role: "assistant";
  content: string | null;
  tool_calls?: ModelToolCall[];
  reasoning_content?: string;
}
