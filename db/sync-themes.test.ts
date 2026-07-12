import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "./adapter.js";
import { syncThemes } from "./sync-themes.js";

const THEME_YAML = `
name: example-service
description: サンプル説明
axes:
  - { key: novelty, label: 新規性, scale: 5 }
seed_policy:
  near_terms_prompt: near
  far_terms_prompt: far
`;

function setup(): { themesDir: string; dbFile: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "sakin-sync-themes-test-"));
  const themesDir = join(dir, "themes");
  mkdirSync(themesDir, { recursive: true });
  return {
    themesDir,
    dbFile: join(dir, "sakin.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("syncThemes upserts every theme YAML in the directory and returns their names", async () => {
  const { themesDir, dbFile, cleanup } = setup();
  try {
    writeFileSync(join(themesDir, "example-service.yaml"), THEME_YAML);

    const names = await syncThemes(themesDir, dbFile);
    assert.deepEqual(names, ["example-service"]);

    const db = await openDb(dbFile);
    try {
      assert.deepEqual(await db.listThemes("human:tester"), [
        {
          name: "example-service",
          description: "サンプル説明",
          ideaCount: 0,
          aiKeepCount: 0,
          humanEvaluatedCount: 0,
        },
      ]);
    } finally {
      await db.close();
    }
  } finally {
    cleanup();
  }
});

test("syncThemes re-run updates an existing theme's description (upsert, not duplicate)", async () => {
  const { themesDir, dbFile, cleanup } = setup();
  try {
    writeFileSync(join(themesDir, "example-service.yaml"), THEME_YAML);
    await syncThemes(themesDir, dbFile);

    writeFileSync(
      join(themesDir, "example-service.yaml"),
      THEME_YAML.replace("サンプル説明", "更新後の説明"),
    );
    await syncThemes(themesDir, dbFile);

    const db = await openDb(dbFile);
    try {
      assert.deepEqual(await db.listThemes("human:tester"), [
        {
          name: "example-service",
          description: "更新後の説明",
          ideaCount: 0,
          aiKeepCount: 0,
          humanEvaluatedCount: 0,
        },
      ]);
    } finally {
      await db.close();
    }
  } finally {
    cleanup();
  }
});
