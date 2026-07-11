import type { ModelRole } from "../config/env.js";

export type { ModelRole };

/**
 * Shape the caller expects to parse out of the response text. Real backends
 * ignore this; DRY_RUN uses it to return a plausibly-shaped mock instead of
 * a single fixed stub per role (a role like "generate" covers more than one
 * response shape, e.g. seed-term arrays vs. idea drafts).
 */
export type ResponseHint = "string-array" | "idea-draft" | "evaluation";

export interface LlmRequest {
  role: ModelRole;
  system?: string;
  prompt: string;
  responseHint?: ResponseHint;
  /**
   * Caller-supplied mock for DRY_RUN, used instead of the generic
   * per-hint stub when the expected shape depends on request-specific
   * data the LLM layer doesn't know about (e.g. an evaluation response
   * whose keys come from a theme's axis definitions). Ignored by real
   * backends.
   */
  dryRunMock?: unknown;
}

export interface LlmResponse {
  text: string;
}

export interface LlmClient {
  readonly backend: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export class LlmQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmQuotaExceededError";
  }
}
