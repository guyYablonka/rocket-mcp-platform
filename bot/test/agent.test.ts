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
          expect(messages[0]?.content).toContain(
            "prefer an unambiguous human account over app, bot, or service accounts",
          );
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

  it("requires configured grounding for a broad non-English task question", async () => {
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
    config.mcp.toolTriggerTerms = ["tasks", "issues", "משימה"];
    config.mcp.defaultToolArgs = {
      cloudId: "https://example.atlassian.net",
    };
    const service = new AgentService(model, config, pino({ level: "silent" }));

    const result = await service.run({
      instruction: "אתה יכול להוסיף לי משימה חדשה?",
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

  it("uses configured tool arguments only as fallbacks", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const mcp: McpClient = {
      async listTools() {
        return [{
          name: "createJiraIssue",
          description: "Create a Jira issue",
          inputSchema: {
            type: "object",
            properties: {
              cloudId: { type: "string" },
              projectKey: { type: "string" },
              summary: { type: "string" },
            },
            required: ["cloudId", "projectKey", "summary"],
          },
        }];
      },
      async callTool(name, args) {
        calls.push({ name, args });
        return { key: "OPS-42" };
      },
      async close() {},
    };
    let turn = 0;
    const model: ModelClient = {
      async complete(_messages, tools) {
        turn += 1;
        if (turn === 1) {
          expect(tools![0]?.function.parameters.required).toEqual(["summary"]);
          return {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "jira-create",
              type: "function",
              function: {
                name: tools![0]!.function.name,
                arguments: JSON.stringify({
                  projectKey: "OPS",
                  summary: "Repair printer",
                }),
              },
            }],
          };
        }
        return { role: "assistant", content: "Created **OPS-42**." };
      },
    };
    const config = testConfig();
    config.mcp.defaultToolArgs = {
      cloudId: "https://example.atlassian.net",
      projectKey: "DEV",
    };
    const service = new AgentService(model, config, pino({ level: "silent" }));

    await service.run({
      instruction: "Create Repair printer in OPS",
      context: {
        username: "guy",
        roomName: "bar",
        roomId: "R1",
        messageId: "MSG",
      },
      mcp,
    });

    expect(calls).toEqual([{
      name: "createJiraIssue",
      args: {
        cloudId: "https://example.atlassian.net",
        projectKey: "OPS",
        summary: "Repair printer",
      },
    }]);
  });

  it("retains bounded conversation context within a room", async () => {
    const mcp: McpClient = {
      async listTools() { return []; },
      async callTool() { return {}; },
      async close() {},
    };
    let turn = 0;
    const model: ModelClient = {
      async complete(messages) {
        turn += 1;
        if (turn === 1) {
          expect(messages).toHaveLength(2);
          return { role: "assistant", content: "The project is **OPS**." };
        }
        expect(messages).toHaveLength(4);
        expect(messages[1]?.content).toContain("Which project?");
        expect(messages[2]?.content).toBe("The project is **OPS**.");
        expect(messages[3]?.content).toContain("Add the task there");
        return { role: "assistant", content: "I understand that “there” means OPS." };
      },
    };
    const service = new AgentService(model, testConfig(), pino({ level: "silent" }));
    const context = {
      username: "guy",
      roomName: "bar",
      roomId: "R1",
      messageId: "MSG1",
    };

    await service.run({ instruction: "Which project?", context, mcp });
    const result = await service.run({
      instruction: "Add the task there",
      context: { ...context, messageId: "MSG2" },
      mcp,
    });

    expect(result).toBe("I understand that “there” means OPS.");
  });
});
