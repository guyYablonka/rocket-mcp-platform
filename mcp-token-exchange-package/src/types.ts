export type ActorContext = Readonly<{ rocketUserId: string; tenantId: string; roomId: string; requestId: string }>;
export type ExchangeContext = Readonly<{ requestId: string; ip: string; userAgent: string }>;
export type GatewayIdentity = Readonly<{ id: string }>;
export type DelegatedUser = Readonly<{ id?: string; applicationUserId?: string; disabled?: boolean; [key: string]: unknown }>;
export type TokenResult = Readonly<{ accessToken: string; tokenType?: string; expiresIn: number; scopes?: readonly string[] }>;
export type TokenExchangeInput = Readonly<{ headers?: Record<string, string | string[] | undefined>; body?: unknown; ip?: string }>;
export type TokenExchangeResponse = Readonly<{ status: number; headers: Record<string, string>; body: Record<string, unknown> }>;

export type TokenExchangeOptions = {
  authenticateGateway(input: { authorization?: string; headers: TokenExchangeInput["headers"]; context: ExchangeContext }): Promise<GatewayIdentity | null> | GatewayIdentity | null;
  findUser(input: { applicationUserId: string; actor: ActorContext; gateway: GatewayIdentity; context: ExchangeContext }): Promise<DelegatedUser | null> | DelegatedUser | null;
  authorizeScopes(input: { user: DelegatedUser; requestedScopes: readonly string[]; actor: ActorContext; gateway: GatewayIdentity; context: ExchangeContext }): Promise<readonly string[]> | readonly string[];
  issueToken(input: { user: DelegatedUser; scopes: readonly string[]; actor: ActorContext; gateway: GatewayIdentity; context: ExchangeContext }): Promise<TokenResult> | TokenResult;
  audit?(event: Record<string, unknown>): Promise<void> | void;
  maxScopes?: number;
  requireActor?: boolean;
};
