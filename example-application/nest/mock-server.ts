import "reflect-metadata";
import {
  Body,
  Controller,
  Get,
  HttpException,
  Module,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TokenExchangeModule } from "@rocket-mcp/token-exchange/nest";
import type { Request } from "express";
import {
  HttpError,
  authorizeApiRequest,
  createTicket,
  getTicket,
  listTickets,
  port,
  tokenExchangeOptions,
} from "../src/application.js";

function asNestError<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof HttpError) throw new HttpException({ error: error.message }, error.status);
    throw error;
  }
}

@Controller()
class ApplicationController {
  @Get("/healthz")
  health() {
    return { ok: true, framework: "nest" };
  }

  @Get("/api/tickets")
  list(@Req() request: Request, @Query("status") status?: string) {
    return asNestError(() => {
      const principal = authorizeApiRequest(request.headers.authorization, "tickets:read");
      return listTickets(principal, status);
    });
  }

  @Get("/api/tickets/:ticketId")
  get(@Req() request: Request, @Param("ticketId") ticketId: string) {
    return asNestError(() => {
      const principal = authorizeApiRequest(request.headers.authorization, "tickets:read");
      return getTicket(principal, ticketId);
    });
  }

  @Post("/api/tickets")
  create(@Req() request: Request, @Body() body: unknown) {
    return asNestError(() => {
      const principal = authorizeApiRequest(request.headers.authorization, "tickets:create");
      return createTicket(principal, body);
    });
  }
}

@Module({
  imports: [
    TokenExchangeModule.register({
      path: "/api/auth/mcp-token",
      ...tokenExchangeOptions(),
    }),
  ],
  controllers: [ApplicationController],
})
class AppModule {}

const app = await NestFactory.create(AppModule, { bodyParser: true });
await app.listen(port, "0.0.0.0");
const address = await app.getUrl();
process.stdout.write(`Nest mock application listening on ${address}\n`);
