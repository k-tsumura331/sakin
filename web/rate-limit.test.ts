import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { createRateLimiter } from "./rate-limit.js";

function appWithLimiter(windowMs: number, max: number, now: () => number) {
  const app = new Hono();
  app.use("/*", createRateLimiter({ windowMs, max, now }));
  app.get("/", (c) => c.text("ok"));
  return app;
}

test("allows requests up to the limit within a window", async () => {
  const app = appWithLimiter(1000, 2, () => 0);
  assert.equal((await app.request("/")).status, 200);
  assert.equal((await app.request("/")).status, 200);
});

test("rejects requests once the limit is exceeded within a window", async () => {
  const app = appWithLimiter(1000, 2, () => 0);
  await app.request("/");
  await app.request("/");
  const res = await app.request("/");
  assert.equal(res.status, 429);
});

test("resets the count once the window elapses", async () => {
  let time = 0;
  const app = appWithLimiter(1000, 1, () => time);
  assert.equal((await app.request("/")).status, 200);
  assert.equal((await app.request("/")).status, 429);
  time = 1000;
  assert.equal((await app.request("/")).status, 200);
});
