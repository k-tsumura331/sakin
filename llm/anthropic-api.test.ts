import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnthropicApiClient } from "./anthropic-api.js";
import { LlmQuotaExceededError } from "./types.js";

/**
 * The Anthropic SDK falls back to the global `fetch` when no custom `fetch`
 * is passed to its constructor (which llm/anthropic-api.ts doesn't), so
 * stubbing globalThis.fetch exercises the real client/retry/error-mapping
 * code without a network call. The SDK only parses the body as JSON when
 * content-type says so, so every mocked response must set that header.
 */
type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(
  body: unknown,
  init: { status: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function withMockFetch(handler: (...args: FetchArgs) => Response): {
  restore: () => void;
  calls: FetchArgs[];
} {
  const original = globalThis.fetch;
  const calls: FetchArgs[] = [];
  globalThis.fetch = (async (...args: FetchArgs) => {
    calls.push(args);
    return handler(...args);
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
    calls,
  };
}

function withApiKey<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  return fn().finally(() => {
    process.env.ANTHROPIC_API_KEY = original;
  });
}

function sentBody(calls: FetchArgs[], index = 0): Record<string, unknown> {
  const init = calls[index][1];
  return JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>;
}

test("complete() returns the text block from a successful response", async () => {
  const { restore, calls } = withMockFetch(() =>
    jsonResponse({ content: [{ type: "text", text: "hello world" }] }, { status: 200 }),
  );
  try {
    await withApiKey(async () => {
      const client = createAnthropicApiClient();
      const response = await client.complete({ role: "generate", prompt: "hi", system: "sys" });
      assert.equal(response.text, "hello world");

      assert.equal(calls.length, 1);
      const body = sentBody(calls);
      assert.equal(body.model, "claude-haiku-4-5");
      assert.equal(body.system, "sys");
      assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
    });
  } finally {
    restore();
  }
});

test("complete() uses the evaluate role's model id", async () => {
  const { restore, calls } = withMockFetch(() =>
    jsonResponse({ content: [{ type: "text", text: "ok" }] }, { status: 200 }),
  );
  try {
    await withApiKey(async () => {
      const client = createAnthropicApiClient();
      await client.complete({ role: "evaluate", prompt: "hi" });
      assert.equal(sentBody(calls).model, "claude-sonnet-5");
    });
  } finally {
    restore();
  }
});

test("complete() throws when the response contains no text block", async () => {
  const { restore } = withMockFetch(() =>
    jsonResponse({ content: [{ type: "tool_use", id: "x", input: {} }] }, { status: 200 }),
  );
  try {
    await withApiKey(async () => {
      const client = createAnthropicApiClient();
      await assert.rejects(
        () => client.complete({ role: "generate", prompt: "hi" }),
        /no text block/,
      );
    });
  } finally {
    restore();
  }
});

test("complete() maps a 429 rate-limit response to LlmQuotaExceededError", async () => {
  const { restore } = withMockFetch(() =>
    jsonResponse(
      { error: { type: "rate_limit_error", message: "slow down" } },
      { status: 429, headers: { "x-should-retry": "false" } },
    ),
  );
  try {
    await withApiKey(async () => {
      const client = createAnthropicApiClient();
      await assert.rejects(
        () => client.complete({ role: "generate", prompt: "hi" }),
        (err: unknown) => {
          assert.ok(err instanceof LlmQuotaExceededError);
          assert.match(err.message, /rate limit/i);
          return true;
        },
      );
    });
  } finally {
    restore();
  }
});

test("complete() maps a 403 billing_error response to LlmQuotaExceededError", async () => {
  const { restore } = withMockFetch(() =>
    jsonResponse(
      { error: { type: "billing_error", message: "no credits left" } },
      { status: 403, headers: { "x-should-retry": "false" } },
    ),
  );
  try {
    await withApiKey(async () => {
      const client = createAnthropicApiClient();
      await assert.rejects(
        () => client.complete({ role: "generate", prompt: "hi" }),
        (err: unknown) => {
          assert.ok(err instanceof LlmQuotaExceededError);
          assert.match(err.message, /billing/i);
          return true;
        },
      );
    });
  } finally {
    restore();
  }
});

test("complete() rethrows a plain 403 that is not a billing_error", async () => {
  const { restore } = withMockFetch(() =>
    jsonResponse(
      { error: { type: "permission_error", message: "nope" } },
      { status: 403, headers: { "x-should-retry": "false" } },
    ),
  );
  try {
    await withApiKey(async () => {
      const client = createAnthropicApiClient();
      await assert.rejects(
        () => client.complete({ role: "generate", prompt: "hi" }),
        (err: unknown) => {
          assert.ok(!(err instanceof LlmQuotaExceededError));
          return true;
        },
      );
    });
  } finally {
    restore();
  }
});
