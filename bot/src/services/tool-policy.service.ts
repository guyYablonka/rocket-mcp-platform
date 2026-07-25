import type { AppConfig } from "../config/config.js";

type ToolPolicyConfig = Pick<AppConfig["mcp"], "toolPolicy" | "toolAllowlist">;

export function isToolAllowed(name: string, config: ToolPolicyConfig): boolean {
  if (config.toolPolicy === "allow-all") return true;
  if (config.toolPolicy === "deny-all") return false;
  return config.toolAllowlist.some((pattern) => patternToRegex(pattern).test(name));
}

export function safeToolName(name: string, index: number): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return `mcp_${index}_${cleaned}`.slice(0, 64);
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
