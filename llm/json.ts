import type { LlmClient, LlmRequest } from "./types.js";

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function completeJson<T>(
  client: LlmClient,
  request: LlmRequest,
  retries: number,
  validate: (value: unknown) => T,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await client.complete(request);
    try {
      const parsed: unknown = JSON.parse(extractJson(response.text));
      return validate(parsed);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Failed to parse JSON response after ${retries + 1} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
