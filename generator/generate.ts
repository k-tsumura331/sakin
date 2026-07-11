import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import {
  resolveApiModelId,
  resolveCliModelAlias,
  resolveLlmBackend,
  sakinPaths,
} from "../config/env.js";
import { loadThemeFile, type ThemeDefinition } from "../config/themes.js";
import {
  completeJson,
  createLlmClient,
  estimateCostUsd,
  LlmQuotaExceededError,
} from "../llm/index.js";
import { buildCombos, pickCombo } from "./combos.js";

interface GenerateArgs {
  theme: string;
  batch: string;
  count: number;
  retries: number;
}

function parseArgs(argv: string[]): GenerateArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    flags.set(arg.slice(2), value);
    i += 1;
  }

  const theme = flags.get("theme");
  const batch = flags.get("batch");
  const countRaw = flags.get("count");
  if (!theme || !batch || !countRaw) {
    throw new Error(
      "Usage: node generator/generate.js --theme <name> --batch <name> --count <N> [--retries <N>]",
    );
  }
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("--count must be a positive integer");
  }
  const retriesRaw = flags.get("retries") ?? "3";
  const retries = Number(retriesRaw);
  if (!Number.isInteger(retries) || retries < 0) {
    throw new Error("--retries must be a non-negative integer");
  }
  return { theme, batch, count, retries };
}

function countCompletedLines(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

function appendJsonArrayInstruction(prompt: string): string {
  return `${prompt}\n\nRespond with a JSON array of strings only. No other text, no markdown code fences.`;
}

function validateStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.length === 0)) {
    throw new Error("expected a non-empty JSON array of non-empty strings");
  }
  if (value.length === 0) {
    throw new Error("expected a non-empty JSON array of non-empty strings");
  }
  return value as string[];
}

interface IdeaDraft {
  title: string;
  body: string;
}

function validateIdeaDraft(value: unknown): IdeaDraft {
  if (typeof value !== "object" || value === null) {
    throw new Error("expected a JSON object with title/body");
  }
  const { title, body } = value as Record<string, unknown>;
  if (typeof title !== "string" || title.length === 0) {
    throw new Error("title must be a non-empty string");
  }
  if (typeof body !== "string" || body.length === 0) {
    throw new Error("body must be a non-empty string");
  }
  return { title, body };
}

function buildIdeaPrompt(theme: ThemeDefinition, nearTerm: string, farTerm: string): string {
  return [
    `テーマ: ${theme.description}`,
    `種用語: 「${nearTerm}」と「${farTerm}」`,
    "この2つの種用語を組み合わせて、テーマに沿った新規事業案を1つ考えてください。",
    'JSON形式で { "title": string, "body": string } のみを出力してください。他のテキストやマークダウンのコードフェンスは不要です。',
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const paths = sakinPaths();
  const theme = loadThemeFile(join(paths.themesDir, `${args.theme}.yaml`));

  const backend = resolveLlmBackend();
  const modelId =
    backend === "anthropic-api"
      ? resolveApiModelId("generate")
      : `claude-cli:${resolveCliModelAlias("generate")}`;

  console.log(`Theme: ${theme.name}`);
  console.log(`Batch: ${args.batch}`);
  console.log(`Backend: ${backend} (${modelId})`);
  console.log(`Target idea count: ${args.count}`);
  if (backend === "anthropic-api") {
    const totalCalls = args.count + 2; // + near-terms + far-terms
    const estimate = estimateCostUsd(modelId, totalCalls, 500, 250);
    console.log(
      estimate !== null
        ? `Estimated cost (rough, ~${totalCalls} call(s)): $${estimate.toFixed(3)}`
        : `Estimated cost: unavailable for model "${modelId}"`,
    );
  }

  mkdirSync(paths.jsonlDir, { recursive: true });
  const outputPath = join(paths.jsonlDir, `${args.batch}.jsonl`);
  const seedTermsPath = join(paths.jsonlDir, `${args.batch}.seed-terms.json`);

  const client = createLlmClient();

  let seedTerms: { near: string[]; far: string[] };
  if (existsSync(seedTermsPath)) {
    seedTerms = JSON.parse(readFileSync(seedTermsPath, "utf8")) as {
      near: string[];
      far: string[];
    };
    console.log(
      `Reusing cached seed terms (${seedTerms.near.length} near / ${seedTerms.far.length} far)`,
    );
  } else {
    console.log("Generating seed terms...");
    const near = await completeJson(
      client,
      {
        role: "generate",
        responseHint: "string-array",
        prompt: appendJsonArrayInstruction(theme.seedPolicy.nearTermsPrompt),
      },
      args.retries,
      validateStringArray,
    );
    const far = await completeJson(
      client,
      {
        role: "generate",
        responseHint: "string-array",
        prompt: appendJsonArrayInstruction(theme.seedPolicy.farTermsPrompt),
      },
      args.retries,
      validateStringArray,
    );
    seedTerms = { near, far };
    writeFileSync(seedTermsPath, JSON.stringify(seedTerms, null, 2));
    console.log(`Generated ${near.length} near term(s), ${far.length} far term(s)`);
  }

  const combos = buildCombos(seedTerms.near, seedTerms.far, args.batch);
  if (args.count > combos.length) {
    console.warn(
      `Warning: requested count (${args.count}) exceeds unique near/far combinations ` +
        `(${combos.length}); term pairs will repeat.`,
    );
  }

  const alreadyDone = countCompletedLines(outputPath);
  if (alreadyDone > 0) {
    console.log(`Resuming: ${alreadyDone} idea(s) already generated in this batch`);
  }
  if (alreadyDone >= args.count) {
    console.log("Nothing to do: batch already has the requested idea count.");
    return;
  }

  let succeeded = 0;
  let failed = 0;
  for (let index = alreadyDone; index < args.count; index++) {
    const [nearTerm, farTerm] = pickCombo(combos, index);
    try {
      const draft = await completeJson(
        client,
        {
          role: "generate",
          responseHint: "idea-draft",
          prompt: buildIdeaPrompt(theme, nearTerm, farTerm),
        },
        args.retries,
        validateIdeaDraft,
      );
      const record = {
        id: ulid(),
        theme: theme.name,
        seed_terms: [nearTerm, farTerm],
        title: draft.title,
        body: draft.body,
        model: modelId,
        batch: args.batch,
        created_at: new Date().toISOString(),
      };
      appendFileSync(outputPath, `${JSON.stringify(record)}\n`);
      succeeded += 1;
    } catch (err) {
      if (err instanceof LlmQuotaExceededError) {
        console.error(`Stopping: ${err.message}`);
        console.error(
          `Progress saved (${succeeded} idea(s) written this run). Rerun the same command to resume.`,
        );
        process.exitCode = 1;
        return;
      }
      console.error(
        `Idea ${index + 1}/${args.count} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed += 1;
    }
  }

  console.log(`Done. ${succeeded} idea(s) generated, ${failed} failed. Output: ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
