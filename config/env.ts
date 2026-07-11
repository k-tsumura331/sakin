import { homedir } from "node:os";
import { join, resolve } from "node:path";

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

export function resolveSakinHome(): string {
  const raw = process.env.SAKIN_HOME ?? "~/sakin-data";
  return resolve(expandHome(raw));
}

export function sakinPaths(home: string = resolveSakinHome()) {
  return {
    home,
    themesDir: join(home, "themes"),
    jsonlDir: join(home, "jsonl"),
    dbFile: join(home, "sakin.db"),
  };
}

export type LlmBackend = "claude-cli" | "anthropic-api";

export function resolveLlmBackend(): LlmBackend {
  const raw = process.env.SAKIN_LLM_BACKEND ?? "claude-cli";
  if (raw !== "claude-cli" && raw !== "anthropic-api") {
    throw new Error(
      `Unknown SAKIN_LLM_BACKEND: ${raw} (expected "claude-cli" or "anthropic-api")`,
    );
  }
  return raw;
}
