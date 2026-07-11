import { spawn } from "node:child_process";
import { resolveCliModelAlias } from "../config/env.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./types.js";
import { LlmQuotaExceededError } from "./types.js";

const QUOTA_PATTERN = /usage limit|rate limit|quota|429/i;

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runClaudeCli(args: string[], input: string): Promise<ProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? 1 });
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

function buildPrompt(request: LlmRequest): string {
  return request.system ? `${request.system}\n\n${request.prompt}` : request.prompt;
}

export function createClaudeCliClient(): LlmClient {
  return {
    backend: "claude-cli",
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const model = resolveCliModelAlias(request.role);
      const { stdout, stderr, exitCode } = await runClaudeCli(
        ["--model", model, "-p"],
        buildPrompt(request),
      );
      if (exitCode !== 0) {
        const output = stderr || stdout;
        if (QUOTA_PATTERN.test(output)) {
          throw new LlmQuotaExceededError(
            `claude CLI reported a usage-limit/rate-limit condition (exit ${exitCode}): ${output}`,
          );
        }
        throw new Error(`claude CLI exited with code ${exitCode}: ${output}`);
      }
      return { text: stdout.trim() };
    },
  };
}
