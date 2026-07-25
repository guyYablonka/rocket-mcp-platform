import type { NextFunction, Request, Response } from "express";
import { createTokenExchange } from "../core/create-token-exchange.js";
import type { TokenExchangeOptions } from "../types.js";

export function tokenExchangeExpress(options: TokenExchangeOptions) {
  const handle = createTokenExchange(options);
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await handle({ headers: request.headers, body: request.body, ip: request.ip });
      response.set(result.headers).status(result.status).json(result.body);
    } catch (error) { next(error); }
  };
}
