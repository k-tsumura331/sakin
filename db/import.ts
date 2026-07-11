import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sakinPaths } from "../config/env.js";
import { type IdeaRecord, openDb } from "./adapter.js";

function parseIdeaLine(source: string, lineNumber: number, line: string): IdeaRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw new Error(`${source}:${lineNumber}: invalid JSON`);
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${source}:${lineNumber}: must be a JSON object`);
  }
  const { id, theme, seed_terms, title, body, model, batch, created_at } = raw as Record<
    string,
    unknown
  >;

  const missing = [
    ["id", id],
    ["theme", theme],
    ["seed_terms", seed_terms],
    ["title", title],
    ["body", body],
    ["model", model],
    ["batch", batch],
    ["created_at", created_at],
  ].filter(([, value]) => typeof value !== "string" && !Array.isArray(value));
  if (missing.length > 0) {
    throw new Error(
      `${source}:${lineNumber}: missing/invalid field(s): ${missing.map(([k]) => k).join(", ")}`,
    );
  }

  return {
    id: id as string,
    theme: theme as string,
    seedTerms: seed_terms as string[],
    title: title as string,
    body: body as string,
    model: model as string,
    batch: batch as string,
    createdAt: created_at as string,
  };
}

export async function importJsonl(
  jsonlPath: string,
  dbFile: string,
): Promise<{ inserted: number; skipped: number }> {
  const db = await openDb(dbFile);
  let inserted = 0;
  let skipped = 0;
  try {
    await db.migrate();
    const rl = createInterface({ input: createReadStream(jsonlPath, "utf8") });
    let lineNumber = 0;
    for await (const line of rl) {
      lineNumber += 1;
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const idea = parseIdeaLine(jsonlPath, lineNumber, trimmed);
      const wasInserted = await db.insertIdeaIfAbsent(idea);
      if (wasInserted) inserted += 1;
      else skipped += 1;
    }
  } finally {
    await db.close();
  }
  return { inserted, skipped };
}

async function main() {
  const jsonlPath = process.argv[2];
  if (!jsonlPath) {
    console.error("Usage: node db/import.js <path-to-jsonl>");
    process.exitCode = 1;
    return;
  }
  const { dbFile } = sakinPaths();
  const { inserted, skipped } = await importJsonl(jsonlPath, dbFile);
  console.log(`Imported ${inserted} idea(s), skipped ${skipped} duplicate(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
