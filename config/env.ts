import { homedir, networkInterfaces } from "node:os";
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

export type ModelRole = "generate" | "evaluate";

const DEFAULT_API_MODEL_IDS: Record<ModelRole, string> = {
  generate: "claude-haiku-4-5",
  evaluate: "claude-sonnet-5",
};

const DEFAULT_CLI_MODEL_ALIASES: Record<ModelRole, string> = {
  generate: "haiku",
  evaluate: "sonnet",
};

export function resolveApiModelId(role: ModelRole): string {
  const envKey = role === "generate" ? "SAKIN_MODEL_GENERATE" : "SAKIN_MODEL_EVALUATE";
  return process.env[envKey] ?? DEFAULT_API_MODEL_IDS[role];
}

export function resolveCliModelAlias(role: ModelRole): string {
  const envKey = role === "generate" ? "SAKIN_CLI_MODEL_GENERATE" : "SAKIN_CLI_MODEL_EVALUATE";
  return process.env[envKey] ?? DEFAULT_CLI_MODEL_ALIASES[role];
}

export function isDryRun(): boolean {
  const raw = process.env.SAKIN_DRY_RUN;
  return raw === "1" || raw === "true";
}

function isTailscaleAddress(address: string): boolean {
  // Tailscale assigns IPv4 addresses from the 100.64.0.0/10 CGNAT range.
  const match = address.match(/^100\.(\d{1,3})\./);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 64 && secondOctet <= 127;
}

export function detectTailscaleAddress(): string | null {
  const interfaces = networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const info of addresses ?? []) {
      if (info.family === "IPv4" && isTailscaleAddress(info.address)) {
        return info.address;
      }
    }
  }
  return null;
}

export function resolveBindAddress(): string {
  return process.env.SAKIN_BIND_ADDRESS || detectTailscaleAddress() || "127.0.0.1";
}

export function resolvePort(): number {
  const raw = process.env.SAKIN_PORT ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid SAKIN_PORT: ${raw}`);
  }
  return port;
}

export function resolveHumanEvaluator(): string {
  const name = process.env.SAKIN_HUMAN_NAME;
  if (!name || name.trim().length === 0) {
    throw new Error("SAKIN_HUMAN_NAME must be set to record human evaluations");
  }
  return `human:${name}`;
}
