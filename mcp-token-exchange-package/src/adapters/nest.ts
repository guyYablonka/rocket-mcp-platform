import { Controller, Inject, Injectable, Module, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createTokenExchange } from "../core/create-token-exchange.js";
import type { TokenExchangeOptions } from "../types.js";

const TOKEN_EXCHANGE_OPTIONS = Symbol("TOKEN_EXCHANGE_OPTIONS");
@Injectable()
class TokenExchangeService {
  public readonly handle: ReturnType<typeof createTokenExchange>;
  public constructor(@Inject(TOKEN_EXCHANGE_OPTIONS) options: TokenExchangeOptions) { this.handle = createTokenExchange(options); }
}

@Module({})
export class TokenExchangeModule {
  public static register(options: TokenExchangeOptions & { path?: string }) {
    const path = options.path ?? "/api/auth/mcp-token";
    @Controller()
    class TokenExchangeController {
      public constructor(private readonly service: TokenExchangeService) {}
      @Post(path)
      public async exchange(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
        const result = await this.service.handle({ headers: request.headers, body: request.body, ip: request.ip });
        response.set(result.headers).status(result.status);
        return result.body;
      }
    }
    return { module: TokenExchangeModule, providers: [{ provide: TOKEN_EXCHANGE_OPTIONS, useValue: options }, TokenExchangeService], controllers: [TokenExchangeController] };
  }
}
