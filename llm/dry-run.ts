import type { LlmClient, LlmRequest, LlmResponse, ResponseHint } from "./types.js";

const MOCK_RESPONSES: Record<ResponseHint, string> = {
  "string-array": JSON.stringify(["[DRY_RUN] 種用語A", "[DRY_RUN] 種用語B", "[DRY_RUN] 種用語C"]),
  "idea-draft": JSON.stringify({
    title: "[DRY_RUN] サンプル案タイトル",
    body: "[DRY_RUN] サンプル本文",
  }),
  evaluation: JSON.stringify({
    scores: {},
    verdict: "maybe",
    comment: "[DRY_RUN] モック評価",
  }),
};

const DEFAULT_HINT_BY_ROLE: Record<LlmRequest["role"], ResponseHint> = {
  generate: "idea-draft",
  evaluate: "evaluation",
};

export function createDryRunClient(underlyingBackend: string): LlmClient {
  return {
    backend: `${underlyingBackend} (dry-run)`,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      if (request.dryRunMock !== undefined) {
        return { text: JSON.stringify(request.dryRunMock) };
      }
      const hint = request.responseHint ?? DEFAULT_HINT_BY_ROLE[request.role];
      return { text: MOCK_RESPONSES[hint] };
    },
  };
}
