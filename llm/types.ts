import type { ModelRole } from "../config/env.js";

export type { ModelRole };

export interface LlmRequest {
  role: ModelRole;
  system?: string;
  prompt: string;
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
