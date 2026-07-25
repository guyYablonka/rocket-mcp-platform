export type Actor = Readonly<{
  rocketUserId: string;
  tenantId: string;
  roomId: string;
  requestId: string;
  username: string;
  tokenId: string;
}>;

export type UserLink = Readonly<{
  tenantId: string;
  rocketUserId: string;
  applicationUserId: string;
  scopes: ReadonlySet<string>;
  disabled: boolean;
}>;

export type ToolDefinition = Readonly<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScopes: readonly string[];
  http: Readonly<{
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    pathParams: readonly string[];
    queryParams: readonly string[];
    bodyParams: readonly string[];
  }>;
}>;

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};
