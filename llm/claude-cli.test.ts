import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClaudeCliClient } from "./claude-cli.js";
import { LlmQuotaExceededError } from "./types.js";

/**
 * Installs a fake `claude` executable at the front of PATH so
 * createClaudeCliClient() exercises its real spawn/stdin/stdout/exit-code
 * handling without needing the actual claude CLI or network access.
 * `buildScript` receives the stub's own directory to embed absolute marker
 * file paths, since the child's cwd/argv[0] can't be relied on for that.
 */
function installStubClaude(buildScript: (dir: string) => string): {
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "sakin-claude-cli-test-"));
  writeFileSync(join(dir, "claude"), buildScript(dir));
  chmodSync(join(dir, "claude"), 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath ?? ""}`;
  return {
    dir,
    cleanup: () => {
      process.env.PATH = originalPath;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function scriptCapturingStdinAndArgs(dir: string, extra: string): string {
  return [
    "#!/bin/sh",
    `printf '%s' "$*" > "${join(dir, "args.received")}"`,
    `cat > "${join(dir, "stdin.received")}"`,
    extra,
  ].join("\n");
}

test("complete() returns trimmed stdout on success and forwards system+prompt via stdin", async () => {
  const { dir, cleanup } = installStubClaude((d) =>
    scriptCapturingStdinAndArgs(d, 'echo \'  {"title":"t","body":"b"}  \''),
  );
  try {
    const client = createClaudeCliClient();
    const response = await client.complete({
      role: "generate",
      system: "system-instructions",
      prompt: "user-prompt",
    });

    assert.equal(response.text, '{"title":"t","body":"b"}');
    assert.equal(
      readFileSync(join(dir, "stdin.received"), "utf8"),
      "system-instructions\n\nuser-prompt",
    );
    assert.equal(readFileSync(join(dir, "args.received"), "utf8"), "--model haiku -p");
  } finally {
    cleanup();
  }
});

test("complete() passes the role-specific model override through --model", async () => {
  const { dir, cleanup } = installStubClaude((d) => scriptCapturingStdinAndArgs(d, "echo ok"));
  const originalModel = process.env.SAKIN_CLI_MODEL_EVALUATE;
  process.env.SAKIN_CLI_MODEL_EVALUATE = "custom-eval-model";
  try {
    const client = createClaudeCliClient();
    await client.complete({ role: "evaluate", prompt: "x" });
    assert.equal(readFileSync(join(dir, "args.received"), "utf8"), "--model custom-eval-model -p");
  } finally {
    process.env.SAKIN_CLI_MODEL_EVALUATE = originalModel;
    cleanup();
  }
});

test("complete() throws a generic error for a non-zero exit without a quota pattern", async () => {
  const { cleanup } = installStubClaude(() =>
    ["#!/bin/sh", "cat > /dev/null", "echo boom >&2", "exit 1"].join("\n"),
  );
  try {
    const client = createClaudeCliClient();
    await assert.rejects(
      () => client.complete({ role: "generate", prompt: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(!(err instanceof LlmQuotaExceededError));
        assert.match(err.message, /claude CLI exited with code 1/);
        assert.match(err.message, /boom/);
        return true;
      },
    );
  } finally {
    cleanup();
  }
});

test("complete() throws LlmQuotaExceededError when the output matches a usage-limit pattern", async () => {
  const { cleanup } = installStubClaude(() =>
    [
      "#!/bin/sh",
      "cat > /dev/null",
      "echo 'Error: usage limit reached, please upgrade' >&2",
      "exit 1",
    ].join("\n"),
  );
  try {
    const client = createClaudeCliClient();
    await assert.rejects(
      () => client.complete({ role: "generate", prompt: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof LlmQuotaExceededError);
        return true;
      },
    );
  } finally {
    cleanup();
  }
});
