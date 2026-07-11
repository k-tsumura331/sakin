import type { LlmClient, LlmRequest, LlmResponse } from "./types.js";

const MOCK_RESPONSES: Record<LlmRequest["role"], string> = {
  generate: JSON.stringify({
    title: "[DRY_RUN] サンプル案タイトル",
    body: "[DRY_RUN] サンプル本文",
  }),
  evaluate: JSON.stringify({
    scores: {},
    verdict: "maybe",
    comment: "[DRY_RUN] モック評価",
  }),
};

export function createDryRunClient(underlyingBackend: string): LlmClient {
  return {
    backend: `${underlyingBackend} (dry-run)`,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      return { text: MOCK_RESPONSES[request.role] };
    },
  };
}
