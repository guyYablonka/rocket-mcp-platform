import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TokenExchangeModule } from "@rocket-mcp/token-exchange/nest";
import { tokenExchangeOptions } from "./shared-options.js";

@Module({
  imports: [
    TokenExchangeModule.register({
      path: "/api/auth/mcp-token",
      ...tokenExchangeOptions(),
    }),
  ],
})
class AppModule {}

const app = await NestFactory.create(AppModule);
await app.listen(3000);
