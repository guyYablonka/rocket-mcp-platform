import { describe, expect, it } from "vitest";
import { buildApplicationRequest } from "../src/dal/file-tool-registry.repository.js";
import type { ToolDefinition } from "../src/domain/types.js";

const tool: ToolDefinition = {
  name: "tickets.get", description: "Get a ticket", inputSchema: {}, requiredScopes: ["tickets:read"],
  http: { method: "GET", path: "/api/tickets/{ticketId}", pathParams: ["ticketId"], queryParams: ["include"], bodyParams: [] }
};

describe("buildApplicationRequest", () => {
  it("keeps calls inside the configured application origin", () => {
    const result = buildApplicationRequest(tool, { ticketId: "A/B", include: ["comments", "history"] }, "https://app.example.com");
    expect(result.url.toString()).toBe("https://app.example.com/api/tickets/A%2FB?include=comments&include=history");
  });
});
