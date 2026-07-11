import { isDryRun, resolveLlmBackend } from "../config/env.js";
import { createAnthropicApiClient } from "./anthropic-api.js";
import { createClaudeCliClient } from "./claude-cli.js";
import { createDryRunClient } from "./dry-run.js";

export * from "./types.js";
export * from "./json.js";
export * from "./pricing.js";

export function createLlmClient() {
  const backend = resolveLlmBackend();
  if (isDryRun()) {
    return createDryRunClient(backend);
  }
  return backend === "claude-cli" ? createClaudeCliClient() : createAnthropicApiClient();
}
