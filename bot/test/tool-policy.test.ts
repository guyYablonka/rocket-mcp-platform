import { describe, expect, it } from "vitest";
import {
  isToolAllowed,
  safeToolName,
} from "../src/services/tool-policy.service.js";

describe("tool policy", () => {
  it("supports wildcard allow-list patterns", () => {
    const config = {
      toolPolicy: "allow-list" as const,
      toolAllowlist: ["get_*", "create_ticket"],
    };
    expect(isToolAllowed("get_customer", config)).toBe(true);
    expect(isToolAllowed("create_ticket", config)).toBe(true);
    expect(isToolAllowed("delete_customer", config)).toBe(false);
  });

  it("creates provider-safe tool names", () => {
    expect(safeToolName("tickets.create / urgent", 2)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });
});
