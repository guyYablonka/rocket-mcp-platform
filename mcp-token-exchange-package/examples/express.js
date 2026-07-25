import express from "express";
import { tokenExchangeExpress } from "@rocket-mcp/token-exchange/express";
import { tokenExchangeOptions } from "./shared-options.js";

const app = express();
app.use(express.json({ limit: "16kb" }));
app.post("/api/auth/mcp-token", tokenExchangeExpress(tokenExchangeOptions()));
app.listen(3000, () => console.log("Express token exchange listening on http://localhost:3000"));
