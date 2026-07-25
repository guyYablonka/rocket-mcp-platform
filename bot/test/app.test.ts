import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { testConfig } from "./fixtures.js";

describe("Express application", () => {
  it("serves health and delegates Rocket.Chat webhooks", async () => {
    const app = createApp({
      config: testConfig(),
      logger: pino({ level: "silent" }),
      webhookService: {
        handle: () => ({ accepted: true, status: 202 }),
      },
    });

    const health = await request(app).get("/healthz").expect(200);
    expect(health.body).toEqual({ ok: true });
    expect(health.headers["x-content-type-options"]).toBe("nosniff");

    const webhook = await request(app)
      .post("/webhooks/rocketchat")
      .send({ hello: "world" })
      .expect(202);
    expect(webhook.body).toEqual({ accepted: true });
    await request(app).get("/missing").expect(404, { error: "not found" });
  });

  it("returns a sanitized response for malformed JSON", async () => {
    const app = createApp({
      config: testConfig(),
      logger: pino({ level: "silent" }),
      webhookService: {
        handle: () => ({ accepted: true, status: 202 }),
      },
    });

    await request(app)
      .post("/webhooks/rocketchat")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400, { error: "invalid request" });
  });
});
