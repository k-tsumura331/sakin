import assert from "node:assert/strict";
import { test } from "node:test";
import type { ThemeDefinition } from "../config/themes.js";
import {
  type DbHandle,
  type EvaluationRecord,
  type IdeaRecord,
  openDb,
  type Verdict,
} from "./adapter.js";

const THEME: ThemeDefinition = {
  name: "example-service",
  description: "サンプルテーマ",
  axes: [
    { key: "novelty", label: "新規性", scale: 5 },
    { key: "clarity", label: "具体性", scale: 5 },
  ],
  seedPolicy: { nearTermsPrompt: "near", farTermsPrompt: "far" },
  evaluationNotes: null,
};

async function freshDb(): Promise<DbHandle> {
  const db = await openDb(":memory:");
  await db.migrate();
  await db.upsertTheme(THEME);
  return db;
}

function idea(id: string, overrides: Partial<IdeaRecord> = {}): IdeaRecord {
  return {
    id,
    theme: THEME.name,
    seedTerms: ["a", "b"],
    title: `title-${id}`,
    body: `body-${id}`,
    model: "test-model",
    batch: "batch-1",
    createdAt: `2026-01-01T00:00:${id.padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

function evaluation(
  ideaId: string,
  evaluator: string,
  verdict: Verdict,
  overrides: Partial<EvaluationRecord> = {},
): EvaluationRecord {
  return {
    id: `${ideaId}-${evaluator}-${Math.random().toString(36).slice(2)}`,
    ideaId,
    evaluator,
    scores: { novelty: 3, clarity: 3 },
    verdict,
    comment: null,
    createdAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

test("insertIdeaIfAbsent is idempotent on id", async () => {
  const db = await freshDb();
  try {
    assert.equal(await db.insertIdeaIfAbsent(idea("01")), true);
    assert.equal(await db.insertIdeaIfAbsent(idea("01")), false);
    assert.equal(await db.countIdeasInBatch(THEME.name, "batch-1"), 1);
  } finally {
    await db.close();
  }
});

test("pruneUnevaluatedBatch removes only ideas with no evaluation", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01"));
    await db.insertIdeaIfAbsent(idea("02"));
    await db.insertEvaluation(evaluation("01", "human:tester", "keep"));

    const deleted = await db.pruneUnevaluatedBatch(THEME.name, "batch-1");
    assert.equal(deleted, 1);
    assert.equal(await db.countIdeasInBatch(THEME.name, "batch-1"), 1);
  } finally {
    await db.close();
  }
});

test("countUnevaluatedIdeas / listUnevaluatedIdeas scope by evaluator", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01"));
    await db.insertIdeaIfAbsent(idea("02"));
    await db.insertEvaluation(evaluation("01", "ai:model-a", "keep"));

    assert.equal(await db.countUnevaluatedIdeas(THEME.name, "ai:model-a"), 1);
    assert.equal(await db.countUnevaluatedIdeas(THEME.name, "human:tester"), 2);

    const unevaluated = await db.listUnevaluatedIdeas(THEME.name, "ai:model-a", 10);
    assert.equal(unevaluated.length, 1);
    assert.equal(unevaluated[0].id, "02");
  } finally {
    await db.close();
  }
});

test("insertEvaluation rejects an invalid verdict via the CHECK constraint", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01"));
    const bad = evaluation("01", "human:tester", "keep", {
      verdict: "bogus" as unknown as Verdict,
    });
    await assert.rejects(() => db.insertEvaluation(bad));
  } finally {
    await db.close();
  }
});

test("getNextIdeaForReview: ai-keep only returns ideas whose latest AI verdict is keep", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01"));
    await db.insertIdeaIfAbsent(idea("02"));
    await db.insertEvaluation(evaluation("01", "ai:model-a", "keep"));
    await db.insertEvaluation(evaluation("02", "ai:model-a", "maybe"));

    const card = await db.getNextIdeaForReview(
      THEME.name,
      { type: "ai-keep" },
      "human:tester",
      null,
    );
    assert.equal(card?.id, "01");

    const next = await db.getNextIdeaForReview(
      THEME.name,
      { type: "ai-keep" },
      "human:tester",
      "01",
    );
    assert.equal(next, null);
  } finally {
    await db.close();
  }
});

test("getNextIdeaForReview: human-unevaluated excludes ideas already reviewed by that evaluator", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01"));
    await db.insertIdeaIfAbsent(idea("02"));
    await db.insertEvaluation(evaluation("01", "human:tester", "keep"));

    const card = await db.getNextIdeaForReview(
      THEME.name,
      { type: "human-unevaluated" },
      "human:tester",
      null,
    );
    assert.equal(card?.id, "02");
  } finally {
    await db.close();
  }
});

test("getNextIdeaForReview: disagreement requires both a latest AI and human verdict that differ", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01")); // ai=keep, human=drop -> disagree
    await db.insertIdeaIfAbsent(idea("02")); // ai=keep, human=keep -> agree
    await db.insertIdeaIfAbsent(idea("03")); // ai=keep, no human eval yet
    await db.insertEvaluation(evaluation("01", "ai:model-a", "keep"));
    await db.insertEvaluation(evaluation("01", "human:tester", "drop"));
    await db.insertEvaluation(evaluation("02", "ai:model-a", "keep"));
    await db.insertEvaluation(evaluation("02", "human:tester", "keep"));
    await db.insertEvaluation(evaluation("03", "ai:model-a", "keep"));

    const card = await db.getNextIdeaForReview(
      THEME.name,
      { type: "disagreement" },
      "human:tester",
      null,
    );
    assert.equal(card?.id, "01");

    const next = await db.getNextIdeaForReview(
      THEME.name,
      { type: "disagreement" },
      "human:tester",
      "01",
    );
    assert.equal(next, null);
  } finally {
    await db.close();
  }
});

test("getNextIdeaForReview: human-verdict filters by the evaluator's latest verdict", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01"));
    await db.insertIdeaIfAbsent(idea("02"));
    await db.insertEvaluation(evaluation("01", "human:tester", "drop"));
    await db.insertEvaluation(evaluation("02", "human:tester", "keep"));

    const dropCard = await db.getNextIdeaForReview(
      THEME.name,
      { type: "human-verdict", verdict: "drop" },
      "human:tester",
      null,
    );
    assert.equal(dropCard?.id, "01");

    const keepCard = await db.getNextIdeaForReview(
      THEME.name,
      { type: "human-verdict", verdict: "keep" },
      "human:tester",
      null,
    );
    assert.equal(keepCard?.id, "02");
  } finally {
    await db.close();
  }
});

test("getNextIdeaForReview: re-evaluation supersedes the earlier verdict (latest wins)", async () => {
  const db = await freshDb();
  try {
    await db.insertIdeaIfAbsent(idea("01"));
    await db.insertEvaluation(
      evaluation("01", "human:tester", "drop", { createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    await db.insertEvaluation(
      evaluation("01", "human:tester", "keep", { createdAt: "2026-01-01T01:00:00.000Z" }),
    );

    const card = await db.getReviewCard(THEME.name, "01", "human:tester");
    assert.equal(card?.humanVerdict, "keep");
  } finally {
    await db.close();
  }
});

test("getReviewCard returns null for a nonexistent idea", async () => {
  const db = await freshDb();
  try {
    const card = await db.getReviewCard(THEME.name, "does-not-exist", "human:tester");
    assert.equal(card, null);
  } finally {
    await db.close();
  }
});

test("listThemes returns synced themes ordered by name", async () => {
  const db = await freshDb();
  try {
    const themes = await db.listThemes();
    assert.deepEqual(themes, [{ name: THEME.name, description: THEME.description }]);
  } finally {
    await db.close();
  }
});
