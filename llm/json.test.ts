import assert from "node:assert/strict";
import { test } from "node:test";
import { completeJson } from "./json.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./types.js";

function fakeClient(responses: string[]): LlmClient {
  let call = 0;
  return {
    backend: "fake",
    async complete(_request: LlmRequest): Promise<LlmResponse> {
      const text = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return { text };
    },
  };
}

const passthrough = (value: unknown) => value as { ok: boolean };

test("parses a valid JSON response on the first attempt", async () => {
  const client = fakeClient(['{"ok": true}']);
  const result = await completeJson(client, { role: "generate", prompt: "x" }, 3, passthrough);
  assert.deepEqual(result, { ok: true });
});

test("extracts JSON from a markdown code fence", async () => {
  const client = fakeClient(['```json\n{"ok": true}\n```']);
  const result = await completeJson(client, { role: "generate", prompt: "x" }, 3, passthrough);
  assert.deepEqual(result, { ok: true });
});

test("retries on invalid JSON and succeeds once a good response arrives", async () => {
  const client = fakeClient(["not json", "still not json", '{"ok": true}']);
  const result = await completeJson(client, { role: "generate", prompt: "x" }, 3, passthrough);
  assert.deepEqual(result, { ok: true });
});

test("throws after exhausting all retries", async () => {
  const client = fakeClient(["not json"]);
  await assert.rejects(() =>
    completeJson(client, { role: "generate", prompt: "x" }, 2, passthrough),
  );
});

test("throws when the validator rejects the parsed value", async () => {
  const client = fakeClient(['{"ok": true}']);
  const strictValidator = () => {
    throw new Error("always invalid");
  };
  await assert.rejects(() =>
    completeJson(client, { role: "generate", prompt: "x" }, 0, strictValidator),
  );
});
