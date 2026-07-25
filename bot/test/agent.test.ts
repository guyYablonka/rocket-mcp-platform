import pino from "pino";
import { describe, expect, it } from "vitest";
import type { McpClient, ModelClient } from "../src/domain/ports.js";
import type {
  ModelCompletion,
  ModelMessage,
  ModelTool,
} from "../src/domain/types.js";
import { AgentService } from "../src/services/agent.service.js";
import { testConfig } from "./fixtures.js";

describe("AgentService", () => {
  it("turns MCP tools into model tools and completes a tool loop", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const mcp: McpClient = {
      async listTools() {
        return [{
          name: "tickets.create",
          description: "Create a ticket",
          inputSchema: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
          },
        }];
      },
      async callTool(name, args) {
        calls.push({ name, args });
        return { content: [{ type: "text", text: "Created T-42" }] };
      },
      async close() {},
    };
    let turn = 0;
    const model: ModelClient = {
      async complete(messages: ModelMessage[], tools: ModelTool[]): Promise<ModelCompletion> {
        turn += 1;
        if (turn === 1) {
          expect(tools).toHaveLength(1);
          return {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: {
                name: tools[0]!.function.name,
                arguments: JSON.stringify({ title: "Printer" }),
              },
            }],
          };
        }
        expect(messages.at(-1)?.role).toBe("tool");
        expect(messages.at(-1)?.content).toContain("T-42");
        return { role: "assistant", content: "Created ticket **T-42**." };
      },
    };
    const service = new AgentService(model, testConfig(), pino({ level: "silent" }));

    const result = await service.run({
      instruction: "Create a printer ticket",
      context: {
        username: "alice",
        roomName: "help",
        roomId: "R1",
        messageId: "MSG",
      },
      mcp,
    });

    expect(result).toBe("Created ticket **T-42**.");
    expect(calls).toEqual([{
      name: "tickets.create",
      args: { title: "Printer" },
    }]);
  });

  it("requires Jira grounding for a broad tasks question", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const mcp: McpClient = {
      async listTools() {
        return [{
          name: "searchJiraIssuesUsingJql",
          description: "Search issues with JQL",
          inputSchema: {
            type: "object",
            properties: {
              cloudId: { type: "string" },
              jql: { type: "string" },
            },
            required: ["cloudId", "jql"],
          },
        }];
      },
      async callTool(name, args) {
        calls.push({ name, args });
        return { issues: [{ key: "OPS-42", summary: "Repair printer" }] };
      },
      async close() {},
    };
    let turn = 0;
    const model: ModelClient = {
      async complete(messages, tools, toolChoice) {
        turn += 1;
        if (turn === 1) {
          expect(toolChoice).toBe("required");
          expect(tools).toHaveLength(1);
          expect(messages[0]?.content).toContain(
            "matches the deployment's configured application vocabulary",
          );
          return {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "jira-search",
              type: "function",
              function: {
                name: tools![0]!.function.name,
                arguments: JSON.stringify({
                  jql: "resolution = Unresolved ORDER BY updated DESC",
                }),
              },
            }],
          };
        }
        expect(toolChoice).toBe("auto");
        expect(messages.at(-1)?.content).toContain("OPS-42");
        return { role: "assistant", content: "**OPS-42** — Repair printer" };
      },
    };
    const config = testConfig();
    config.mcp.toolTriggerTerms = ["tasks", "issues"];
    config.mcp.defaultToolArgs = {
      cloudId: "https://example.atlassian.net",
    };
    const service = new AgentService(model, config, pino({ level: "silent" }));

    const result = await service.run({
      instruction: "Can you explain a little bit about our tasks?",
      context: {
        username: "guy",
        roomName: "bar",
        roomId: "R1",
        messageId: "MSG",
      },
      mcp,
    });

    expect(result).toBe("**OPS-42** — Repair printer");
    expect(calls).toEqual([{
      name: "searchJiraIssuesUsingJql",
      args: {
        jql: "resolution = Unresolved ORDER BY updated DESC",
        cloudId: "https://example.atlassian.net",
      },
    }]);
  });
});
