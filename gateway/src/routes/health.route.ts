import { Router } from "express";

export const healthRouter = Router().get("/healthz", (_request, response) => response.json({ ok: true }));
