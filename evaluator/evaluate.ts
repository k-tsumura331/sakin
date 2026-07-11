import { ulid } from "ulid";
import {
  resolveApiModelId,
  resolveCliModelAlias,
  resolveLlmBackend,
  sakinPaths,
} from "../config/env.js";
import { loadThemeFile, type ThemeDefinition } from "../config/themes.js";
import { openDb, type IdeaRow, type Verdict } from "../db/adapter.js";
import { join } from "node:path";
import { completeJson, createLlmClient, estimateCostUsd, LlmQuotaExceededError } from "../llm/index.js";

const DEFAULT_LIMIT = 100;

interface EvaluateArgs {
  theme: string;
  limit: number;
  all: boolean;
  retries: number;
}

function parseArgs(argv: string[]): EvaluateArgs {
  const flags = new Map<string, string>();
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      all = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    flags.set(arg.slice(2), value);
    i += 1;
  }

  const theme = flags.get("theme");
  if (!theme) {
    throw new Error(
      "Usage: node evaluator/evaluate.js --theme <name> [--limit <N>] [--all] [--retries <N>]",
    );
  }
  const limitRaw = flags.get("limit") ?? String(DEFAULT_LIMIT);
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }
  const retriesRaw = flags.get("retries") ?? "3";
  const retries = Number(retriesRaw);
  if (!Number.isInteger(retries) || retries < 0) {
    throw new Error("--retries must be a non-negative integer");
  }
  return { theme, limit, all, retries };
}

interface EvaluationDraft {
  scores: Record<string, number>;
  verdict: Verdict;
  comment: string | null;
}

function validateEvaluationDraft(theme: ThemeDefinition, value: unknown): EvaluationDraft {
  if (typeof value !== "object" || value === null) {
    throw new Error("expected an object with scores/verdict/comment");
  }
  const { scores, verdict, comment } = value as Record<string, unknown>;
  if (typeof scores !== "object" || scores === null) {
    throw new Error("scores must be an object");
  }
  const scoresRecord = scores as Record<string, unknown>;
  const validatedScores: Record<string, number> = {};
  for (const axis of theme.axes) {
    const raw = scoresRecord[axis.key];
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > axis.scale) {
      throw new Error(`scores.${axis.key} must be an integer between 1 and ${axis.scale}`);
    }
    validatedScores[axis.key] = raw;
  }
  if (verdict !== "keep" && verdict !== "drop" && verdict !== "maybe") {
    throw new Error('verdict must be "keep", "drop", or "maybe"');
  }
  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    throw new Error("comment must be a string when present");
  }
  return {
    scores: validatedScores,
    verdict,
    comment: (comment as string | undefined) ?? null,
  };
}

function buildEvaluationPrompt(theme: ThemeDefinition, idea: IdeaRow): string {
  const axesDescription = theme.axes
    .map((axis) => `- ${axis.key} (${axis.label}): 1〜${axis.scale}の整数`)
    .join("\n");
  const lines = [
    `テーマ: ${theme.description}`,
    `評価軸:\n${axesDescription}`,
  ];
  if (theme.evaluationNotes) {
    lines.push(`採点時の注意:\n${theme.evaluationNotes}`);
  }
  lines.push(
    `評価対象の案:\nタイトル: ${idea.title}\n本文: ${idea.body}`,
    "各評価軸を採点し、verdict(keep/drop/maybe)とコメントを付けてください。",
    'JSON形式で { "scores": { <軸key>: number, ... }, "verdict": "keep"|"drop"|"maybe", "comment": string } のみを出力してください。他のテキストやマークダウンのコードフェンスは不要です。',
  );
  return lines.join("\n\n");
}

function buildDryRunMock(theme: ThemeDefinition) {
  return {
    scores: Object.fromEntries(theme.axes.map((axis) => [axis.key, 1])),
    verdict: "maybe" as const,
    comment: "[DRY_RUN] モック評価",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const paths = sakinPaths();
  const theme = loadThemeFile(join(paths.themesDir, `${args.theme}.yaml`));

  const backend = resolveLlmBackend();
  const modelId =
    backend === "anthropic-api"
      ? resolveApiModelId("evaluate")
      : `claude-cli:${resolveCliModelAlias("evaluate")}`;
  const evaluatorLabel = `ai:${modelId}`;

  const db = await openDb(paths.dbFile);
  try {
    await db.migrate();

    const totalUnevaluated = await db.countUnevaluatedIdeas(theme.name, evaluatorLabel);
    const effectiveLimit = args.all ? totalUnevaluated : Math.min(totalUnevaluated, args.limit);

    console.log(`Theme: ${theme.name}`);
    console.log(`Evaluator: ${evaluatorLabel}`);
    console.log(`Backend: ${backend}`);
    console.log(`Unevaluated ideas: ${totalUnevaluated}`);
    console.log(`Will evaluate: ${effectiveLimit}${args.all ? " (--all)" : ` (limit ${args.limit})`}`);
    if (!args.all && totalUnevaluated > args.limit) {
      console.log(
        `Note: ${totalUnevaluated - args.limit} idea(s) will remain unevaluated this run. Use --all or a higher --limit to process more.`,
      );
    }
    if (backend === "anthropic-api" && effectiveLimit > 0) {
      const estimate = estimateCostUsd(modelId, effectiveLimit, 600, 200);
      console.log(
        estimate !== null
          ? `Estimated cost (rough, ${effectiveLimit} call(s)): $${estimate.toFixed(3)}`
          : `Estimated cost: unavailable for model "${modelId}"`,
      );
    }

    if (effectiveLimit === 0) {
      console.log("Nothing to evaluate.");
      return;
    }

    const ideas = await db.listUnevaluatedIdeas(theme.name, evaluatorLabel, effectiveLimit);
    const client = createLlmClient();

    let succeeded = 0;
    let failed = 0;
    for (const [index, idea] of ideas.entries()) {
      try {
        const draft = await completeJson(
          client,
          {
            role: "evaluate",
            responseHint: "evaluation",
            prompt: buildEvaluationPrompt(theme, idea),
            dryRunMock: buildDryRunMock(theme),
          },
          args.retries,
          (value) => validateEvaluationDraft(theme, value),
        );
        await db.insertEvaluation({
          id: ulid(),
          ideaId: idea.id,
          evaluator: evaluatorLabel,
          scores: draft.scores,
          verdict: draft.verdict,
          comment: draft.comment,
          createdAt: new Date().toISOString(),
        });
        succeeded += 1;
      } catch (err) {
        if (err instanceof LlmQuotaExceededError) {
          console.error(`Stopping: ${err.message}`);
          console.error(
            `Progress saved (${succeeded} idea(s) evaluated this run). Rerun the same command to resume.`,
          );
          process.exitCode = 1;
          return;
        }
        console.error(
          `Idea ${index + 1}/${ideas.length} (${idea.id}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        failed += 1;
      }
    }

    console.log(`Done. ${succeeded} idea(s) evaluated, ${failed} failed.`);
  } finally {
    await db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
