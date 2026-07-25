import { z } from "zod";
import type { AppConfig } from "../../config/config.js";
import type { ModelClient } from "../../domain/ports.js";
import type {
  ModelCompletion,
  ModelMessage,
  ModelTool,
} from "../../domain/types.js";
import { fetchWithTimeout, remoteResponseError } from "../../utils/http.js";

const modelCompletionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      role: z.literal("assistant").default("assistant"),
      content: z.string().nullable().default(null),
      reasoning_content: z.string().optional(),
      tool_calls: z.array(z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })).optional(),
    }),
  })).min(1),
});

export class OpenAiCompatibleModelClient implements ModelClient {
  constructor(private readonly config: AppConfig["model"]) {}

  async complete(
    messages: ModelMessage[],
    tools: ModelTool[] = [],
  ): Promise<ModelCompletion> {
    const response = await fetchWithTimeout(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.name,
          messages,
          ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
        }),
      },
      this.config.timeoutMs,
    );
    if (!response.ok) throw await remoteResponseError(response);
    const parsed = modelCompletionSchema.parse(await response.json());
    return parsed.choices[0]!.message;
  }
}
