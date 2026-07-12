import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ThemeDefinition } from "../config/themes.js";
import { type DbHandle, openDb } from "../db/adapter.js";
import { createApp } from "./app.js";

const THEME: ThemeDefinition = {
  name: "example-service",
  description: "サンプル説明",
  axes: [{ key: "novelty", label: "新規性", scale: 5 }],
  seedPolicy: { nearTermsPrompt: "near", farTermsPrompt: "far" },
  evaluationNotes: null,
};

const THEME_YAML = `
name: example-service
description: サンプル説明
axes:
  - { key: novelty, label: 新規性, scale: 5 }
seed_policy:
  near_terms_prompt: near
  far_terms_prompt: far
`;

interface Fixture {
  app: ReturnType<typeof createApp>;
  withDb: <T>(fn: (db: DbHandle) => Promise<T>) => Promise<T>;
  cleanup: () => void;
}

async function setupFixture(options: { secondTheme?: boolean } = {}): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), "sakin-web-app-test-"));
  const themesDir = join(dir, "themes");
  mkdirSync(themesDir, { recursive: true });
  writeFileSync(join(themesDir, "example-service.yaml"), THEME_YAML);

  const dbFile = join(dir, "sakin.db");
  const db = await openDb(dbFile);
  await db.migrate();
  await db.upsertTheme(THEME);
  if (options.secondTheme) {
    await db.upsertTheme({ ...THEME, name: "second-service", description: "2つ目のテーマ" });
    writeFileSync(
      join(themesDir, "second-service.yaml"),
      THEME_YAML.replace("example-service", "second-service").replace(
        "サンプル説明",
        "2つ目のテーマ",
      ),
    );
  }
  await db.close();

  const originalHome = process.env.SAKIN_HOME;
  const originalHuman = process.env.SAKIN_HUMAN_NAME;
  process.env.SAKIN_HOME = dir;
  process.env.SAKIN_HUMAN_NAME = "tester";

  const app = createApp();

  return {
    app,
    withDb: async (fn) => {
      const handle = await openDb(dbFile);
      try {
        return await fn(handle);
      } finally {
        await handle.close();
      }
    },
    cleanup: () => {
      process.env.SAKIN_HOME = originalHome;
      process.env.SAKIN_HUMAN_NAME = originalHuman;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("GET /:theme rejects a theme name outside the safe charset", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/bad!theme");
    assert.equal(res.status, 400);
  } finally {
    cleanup();
  }
});

test("GET /:theme/* rejects a theme name outside the safe charset via the shared middleware", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/bad!theme/card");
    assert.equal(res.status, 400);
  } finally {
    cleanup();
  }
});

test("GET / shows a theme picker even when there is only one theme", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /example-service/);
  } finally {
    cleanup();
  }
});

test("GET / shows a theme picker when there is more than one theme", async () => {
  const { app, cleanup } = await setupFixture({ secondTheme: true });
  try {
    const res = await app.request("/");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /example-service/);
    assert.match(body, /second-service/);
  } finally {
    cleanup();
  }
});

test("GET /:theme renders the swipe page with the next review card", async () => {
  const { app, withDb, cleanup } = await setupFixture();
  try {
    await withDb(async (db) => {
      await db.insertIdeaIfAbsent({
        id: "01",
        theme: THEME.name,
        seedTerms: ["a", "b"],
        title: "案タイトル",
        body: "案本文",
        model: "m",
        batch: "b1",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      await db.insertEvaluation({
        id: "e1",
        ideaId: "01",
        evaluator: "ai:model-a",
        scores: {},
        verdict: "keep",
        comment: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const res = await app.request("/example-service");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<title>/);
    assert.match(body, /案タイトル/);
  } finally {
    cleanup();
  }
});

test("GET /:theme/card returns only the card fragment (no page layout)", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/example-service/card");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.doesNotMatch(body, /<title>/);
    assert.match(body, /これ以上、条件に合う案はありません/);
  } finally {
    cleanup();
  }
});

test("POST /:theme/ideas/:id/verdict rejects an invalid body", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/example-service/ideas/01/verdict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict: "bogus" }),
    });
    assert.equal(res.status, 400);
  } finally {
    cleanup();
  }
});

test("POST /:theme/ideas/:id/verdict returns 404 for a nonexistent idea", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/example-service/ideas/no-such-id/verdict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict: "keep" }),
    });
    assert.equal(res.status, 404);
  } finally {
    cleanup();
  }
});

test("POST /:theme/ideas/:id/verdict records the evaluation and returns the next card", async () => {
  const { app, withDb, cleanup } = await setupFixture();
  try {
    await withDb(async (db) => {
      for (const [id, title] of [
        ["01", "一つ目の案"],
        ["02", "二つ目の案"],
      ] as const) {
        await db.insertIdeaIfAbsent({
          id,
          theme: THEME.name,
          seedTerms: ["a", "b"],
          title,
          body: "本文",
          model: "m",
          batch: "b1",
          createdAt: `2026-01-01T00:00:0${id}.000Z`,
        });
        await db.insertEvaluation({
          id: `ai-${id}`,
          ideaId: id,
          evaluator: "ai:model-a",
          scores: {},
          verdict: "keep",
          comment: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
    });

    const res = await app.request("/example-service/ideas/01/verdict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict: "keep" }),
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /二つ目の案/);

    await withDb(async (db) => {
      const card = await db.getReviewCard(THEME.name, "01", "human:tester");
      assert.equal(card?.humanVerdict, "keep");
    });
  } finally {
    cleanup();
  }
});

test("GET /:theme/ideas/:id renders the detail page for an existing idea", async () => {
  const { app, withDb, cleanup } = await setupFixture();
  try {
    await withDb(async (db) => {
      await db.insertIdeaIfAbsent({
        id: "01",
        theme: THEME.name,
        seedTerms: ["a", "b"],
        title: "詳細タイトル",
        body: "詳細本文",
        model: "m",
        batch: "b1",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const res = await app.request("/example-service/ideas/01");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /詳細タイトル/);
    assert.match(body, /name="axis_novelty"/);
  } finally {
    cleanup();
  }
});

test("GET /:theme/ideas/:id returns 404 for a nonexistent idea", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/example-service/ideas/no-such-id");
    assert.equal(res.status, 404);
  } finally {
    cleanup();
  }
});

test("POST /:theme/ideas/:id/evaluate rejects an out-of-range axis score", async () => {
  const { app, withDb, cleanup } = await setupFixture();
  try {
    await withDb(async (db) => {
      await db.insertIdeaIfAbsent({
        id: "01",
        theme: THEME.name,
        seedTerms: ["a", "b"],
        title: "t",
        body: "b",
        model: "m",
        batch: "b1",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const res = await app.request("/example-service/ideas/01/evaluate", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ axis_novelty: "6", verdict: "keep" }).toString(),
    });
    assert.equal(res.status, 400);
  } finally {
    cleanup();
  }
});

test("POST /:theme/ideas/:id/evaluate returns 404 for a nonexistent idea", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/example-service/ideas/no-such-id/evaluate", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ axis_novelty: "3", verdict: "keep" }).toString(),
    });
    assert.equal(res.status, 404);
  } finally {
    cleanup();
  }
});

test("POST /:theme/ideas/:id/evaluate persists scores/verdict/comment and redirects back", async () => {
  const { app, withDb, cleanup } = await setupFixture();
  try {
    await withDb(async (db) => {
      await db.insertIdeaIfAbsent({
        id: "01",
        theme: THEME.name,
        seedTerms: ["a", "b"],
        title: "t",
        body: "b",
        model: "m",
        batch: "b1",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    const res = await app.request("/example-service/ideas/01/evaluate?filter=ai-keep", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        axis_novelty: "4",
        verdict: "maybe",
        comment: "テストコメント",
      }).toString(),
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/example-service?filter=ai-keep");

    await withDb(async (db) => {
      const card = await db.getReviewCard(THEME.name, "01", "human:tester");
      assert.equal(card?.humanVerdict, "maybe");
      assert.deepEqual(card?.humanScores, { novelty: 4 });
      assert.equal(card?.humanComment, "テストコメント");
    });
  } finally {
    cleanup();
  }
});

test("an unmatched route under a valid theme falls through to the custom 404 handler", async () => {
  const { app, cleanup } = await setupFixture();
  try {
    const res = await app.request("/example-service/unknown-subpath");
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.match(body, /Not found/);
  } finally {
    cleanup();
  }
});
