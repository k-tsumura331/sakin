import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ThemeDefinition } from "../config/themes.js";
import { openDb } from "./adapter.js";
import { pruneUnevaluatedBatch } from "./prune.js";

const THEME: ThemeDefinition = {
  name: "example-service",
  description: "サンプルテーマ",
  axes: [{ key: "novelty", label: "新規性", scale: 5 }],
  seedPolicy: { nearTermsPrompt: "near", farTermsPrompt: "far" },
  evaluationNotes: null,
};

function tempDbFile(): { dbFile: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "sakin-prune-test-"));
  return {
    dbFile: join(dir, "sakin.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("pruneUnevaluatedBatch deletes only unevaluated ideas in the given batch", async () => {
  const { dbFile, cleanup } = tempDbFile();
  try {
    const db = await openDb(dbFile);
    await db.migrate();
    await db.upsertTheme(THEME);
    await db.insertIdeaIfAbsent({
      id: "01",
      theme: THEME.name,
      seedTerms: ["a", "b"],
      title: "t1",
      body: "b1",
      model: "m",
      batch: "batch-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await db.insertIdeaIfAbsent({
      id: "02",
      theme: THEME.name,
      seedTerms: ["a", "b"],
      title: "t2",
      body: "b2",
      model: "m",
      batch: "batch-1",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    await db.insertEvaluation({
      id: "eval-1",
      ideaId: "01",
      evaluator: "human:tester",
      scores: {},
      verdict: "keep",
      comment: null,
      createdAt: "2026-01-01T01:00:00.000Z",
    });
    await db.close();

    const deleted = await pruneUnevaluatedBatch(THEME.name, "batch-1", dbFile);
    assert.equal(deleted, 1);

    const verify = await openDb(dbFile);
    try {
      assert.equal(await verify.countIdeasInBatch(THEME.name, "batch-1"), 1);
    } finally {
      await verify.close();
    }
  } finally {
    cleanup();
  }
});

test("pruneUnevaluatedBatch is a no-op for a batch with nothing to delete", async () => {
  const { dbFile, cleanup } = tempDbFile();
  try {
    const db = await openDb(dbFile);
    await db.migrate();
    await db.upsertTheme(THEME);
    await db.close();

    const deleted = await pruneUnevaluatedBatch(THEME.name, "no-such-batch", dbFile);
    assert.equal(deleted, 0);
  } finally {
    cleanup();
  }
});
