export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
  "claude-sonnet-5": { inputPerMillion: 3, outputPerMillion: 15 },
};

/**
 * Rough, order-of-magnitude cost estimate for a batch of API calls against
 * a known model. Returns null if the model has no known pricing (e.g. a
 * user-overridden model id) rather than guessing.
 */
export function estimateCostUsd(
  modelId: string,
  calls: number,
  avgInputTokensPerCall: number,
  avgOutputTokensPerCall: number,
): number | null {
  const pricing = PRICING[modelId];
  if (!pricing) return null;
  const inputCost = ((calls * avgInputTokensPerCall) / 1_000_000) * pricing.inputPerMillion;
  const outputCost = ((calls * avgOutputTokensPerCall) / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}
