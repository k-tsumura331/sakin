import type { ReviewFilter, Verdict } from "../db/adapter.js";

const VERDICTS: Verdict[] = ["keep", "drop", "maybe"];

export function filterToQueryValue(filter: ReviewFilter): string {
  return filter.type === "human-verdict" ? `human-verdict:${filter.verdict}` : filter.type;
}

export function parseFilterFromQuery(value: string | undefined): ReviewFilter {
  if (!value || value === "ai-keep") return { type: "ai-keep" };
  if (value === "human-unevaluated") return { type: "human-unevaluated" };
  if (value === "disagreement") return { type: "disagreement" };
  if (value.startsWith("human-verdict:")) {
    const verdict = value.slice("human-verdict:".length);
    if ((VERDICTS as string[]).includes(verdict)) {
      return { type: "human-verdict", verdict: verdict as Verdict };
    }
  }
  return { type: "ai-keep" };
}

export const FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ai-keep", label: "AI高評価のみ" },
  { value: "human-unevaluated", label: "人間未評価のみ" },
  { value: "disagreement", label: "AIと人間で評価が割れた案" },
  { value: "human-verdict:keep", label: "自分の評価: 採用" },
  { value: "human-verdict:drop", label: "自分の評価: 見送り" },
  { value: "human-verdict:maybe", label: "自分の評価: 保留" },
];
