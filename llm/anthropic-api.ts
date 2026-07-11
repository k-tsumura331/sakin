import Anthropic from "@anthropic-ai/sdk";
import { resolveApiModelId } from "../config/env.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./types.js";
import { LlmQuotaExceededError } from "./types.js";

export function createAnthropicApiClient(): LlmClient {
  const client = new Anthropic();

  return {
    backend: "anthropic-api",
    async complete(request: LlmRequest): Promise<LlmResponse> {
      try {
        const response = await client.messages.create({
          model: resolveApiModelId(request.role),
          max_tokens: 4096,
          system: request.system,
          messages: [{ role: "user", content: request.prompt }],
        });
        const textBlock = response.content.find((block) => block.type === "text");
        if (textBlock?.type !== "text") {
          throw new Error("Anthropic API response contained no text block");
        }
        return { text: textBlock.text };
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
          throw new LlmQuotaExceededError(`Anthropic API rate limit: ${err.message}`);
        }
        if (
          err instanceof Anthropic.PermissionDeniedError &&
          (err as { type?: string }).type === "billing_error"
        ) {
          throw new LlmQuotaExceededError(`Anthropic API billing error: ${err.message}`);
        }
        throw err;
      }
    },
  };
}
