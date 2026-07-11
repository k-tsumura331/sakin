import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ThemeDefinition } from "../config/themes.js";
import { openDb } from "./adapter.js";
import { importJsonl } from "./import.js";

const THEME: ThemeDefinition = {
  name: "example-service",
  description: "サンプルテーマ",
  axes: [{ key: "novelty", label: "新規性", scale: 5 }],
  seedPolicy: { nearTermsPrompt: "near", farTermsPrompt: "far" },
  evaluationNotes: null,
};

function ideaLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "01",
    theme: THEME.name,
    seed_terms: ["a", "b"],
    title: "title",
    body: "body",
    model: "test-model",
    batch: "batch-1",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

interface Fixture {
  dbFile: string;
  jsonlPath: string;
  cleanup: () => void;
}

async function setupFixture(): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), "sakin-import-test-"));
  const dbFile = join(dir, "sakin.db");
  const db = await openDb(dbFile);
  await db.migrate();
  await db.upsertTheme(THEME);
  await db.close();
  return {
    dbFile,
    jsonlPath: join(dir, "batch.jsonl"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("importJsonl inserts valid lines and skips duplicate ids", async () => {
  const { dbFile, jsonlPath, cleanup } = await setupFixture();
  try {
    writeFileSync(
      jsonlPath,
      [ideaLine({ id: "01" }), ideaLine({ id: "02" }), ideaLine({ id: "01" })].join("\n"),
    );

    const result = await importJsonl(jsonlPath, dbFile);
    assert.deepEqual(result, { inserted: 2, skipped: 1 });

    const db = await openDb(dbFile);
    try {
      assert.equal(await db.countIdeasInBatch(THEME.name, "batch-1"), 2);
    } finally {
      await db.close();
    }
  } finally {
    cleanup();
  }
});

test("importJsonl is idempotent across separate runs against the same file", async () => {
  const { dbFile, jsonlPath, cleanup } = await setupFixture();
  try {
    writeFileSync(jsonlPath, ideaLine({ id: "01" }));
    await importJsonl(jsonlPath, dbFile);
    const second = await importJsonl(jsonlPath, dbFile);
    assert.deepEqual(second, { inserted: 0, skipped: 1 });
  } finally {
    cleanup();
  }
});

test("importJsonl skips blank/whitespace-only lines", async () => {
  const { dbFile, jsonlPath, cleanup } = await setupFixture();
  try {
    writeFileSync(jsonlPath, `${ideaLine({ id: "01" })}\n\n   \n`);
    const result = await importJsonl(jsonlPath, dbFile);
    assert.deepEqual(result, { inserted: 1, skipped: 0 });
  } finally {
    cleanup();
  }
});

test("importJsonl reports the source and line number for invalid JSON", async () => {
  const { dbFile, jsonlPath, cleanup } = await setupFixture();
  try {
    writeFileSync(jsonlPath, `${ideaLine({ id: "01" })}\nnot json\n`);
    await assert.rejects(
      () => importJsonl(jsonlPath, dbFile),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /batch\.jsonl:2: invalid JSON/);
        return true;
      },
    );
  } finally {
    cleanup();
  }
});

test("importJsonl rejects a line missing a required field", async () => {
  const { dbFile, jsonlPath, cleanup } = await setupFixture();
  try {
    writeFileSync(jsonlPath, `${JSON.stringify({ id: "01", theme: THEME.name })}\n`);
    await assert.rejects(
      () => importJsonl(jsonlPath, dbFile),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /missing\/invalid field/);
        return true;
      },
    );
  } finally {
    cleanup();
  }
});
