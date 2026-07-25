import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ToolDefinition, UserLink } from "../domain/types.js";
import { hasScopes } from "./file-user-link.repository.js";

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const toolSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_.-]{1,128}$/),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  requiredScopes: z.array(z.string()).default([]),
  http: z.object({
    method: z.enum(methods),
    path: z.string().regex(/^\/(?!\/)/),
    pathParams: z.array(z.string()).default([]),
    queryParams: z.array(z.string()).default([]),
    bodyParams: z.array(z.string()).default([])
  })
});

export class FileToolRegistryRepository {
  private readonly byName: Map<string, ToolDefinition>;

  public constructor(filePath: string) {
    const tools = z.array(toolSchema).parse(JSON.parse(readFileSync(filePath, "utf8"))).map((tool) => Object.freeze({
      ...tool,
      description: tool.description ?? `Run ${tool.name}`,
      requiredScopes: Object.freeze(tool.requiredScopes),
      http: Object.freeze({ ...tool.http, pathParams: Object.freeze(tool.http.pathParams), queryParams: Object.freeze(tool.http.queryParams), bodyParams: Object.freeze(tool.http.bodyParams) })
    }));
    this.byName = new Map(tools.map((tool) => [tool.name, tool]));
    if (this.byName.size !== tools.length) throw new Error("Tool names must be unique");
  }

  public listFor(link: UserLink | undefined): ToolDefinition[] {
    return [...this.byName.values()].filter((tool) => hasScopes(link, tool.requiredScopes));
  }

  public getFor(name: string | undefined, link: UserLink | undefined): ToolDefinition | undefined {
    const tool = name ? this.byName.get(name) : undefined;
    return tool && hasScopes(link, tool.requiredScopes) ? tool : undefined;
  }
}

export function buildApplicationRequest(tool: ToolDefinition, args: Record<string, unknown>, apiBaseUrl: string) {
  let path = tool.http.path;
  for (const name of tool.http.pathParams) {
    const value = args[name];
    if (value === undefined || value === null || value === "") throw new Error(`Missing path parameter: ${name}`);
    path = path.replaceAll(`{${name}}`, encodeURIComponent(String(value)));
  }
  if (/\{[^}]+\}/.test(path)) throw new Error("An unresolved path parameter remains");
  const url = new URL(path, `${apiBaseUrl}/`);
  if (url.origin !== new URL(apiBaseUrl).origin) throw new Error("Tool URL escaped the configured application origin");
  for (const name of tool.http.queryParams) {
    const value = args[name];
    for (const item of value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]) url.searchParams.append(name, String(item));
  }
  const body = Object.fromEntries(tool.http.bodyParams.filter((name) => args[name] !== undefined).map((name) => [name, args[name]]));
  return { url, body: Object.keys(body).length ? body : undefined };
}
