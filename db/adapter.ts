import Database from "better-sqlite3";
import type { ThemeDefinition } from "../config/themes.js";
import { SCHEMA_SQL } from "./schema.js";

export interface IdeaRecord {
  id: string;
  theme: string;
  seedTerms: string[];
  title: string;
  body: string;
  model: string;
  batch: string;
  createdAt: string;
}

export interface IdeaRow {
  id: string;
  themeName: string;
  seedTerms: string[];
  title: string;
  body: string;
  model: string;
  batch: string;
  createdAt: string;
}

export type Verdict = "keep" | "drop" | "maybe";

export type ReviewFilter =
  | { type: "ai-keep" }
  | { type: "human-unevaluated" }
  | { type: "disagreement" }
  | { type: "human-verdict"; verdict: Verdict };

export interface ThemeSummary {
  name: string;
  description: string;
}

export interface ReviewCard {
  id: string;
  themeName: string;
  seedTerms: string[];
  title: string;
  body: string;
  aiVerdict: Verdict | null;
  humanVerdict: Verdict | null;
  humanScores: Record<string, number> | null;
  humanComment: string | null;
}

export interface EvaluationRecord {
  id: string;
  ideaId: string;
  evaluator: string;
  scores: Record<string, number>;
  verdict: Verdict;
  comment: string | null;
  createdAt: string;
}

export interface DbHandle {
  migrate(): Promise<void>;
  upsertTheme(theme: ThemeDefinition): Promise<void>;
  insertIdeaIfAbsent(idea: IdeaRecord): Promise<boolean>;
  countIdeasInBatch(themeName: string, batch: string): Promise<number>;
  pruneUnevaluatedBatch(themeName: string, batch: string): Promise<number>;
  countUnevaluatedIdeas(themeName: string, evaluator: string): Promise<number>;
  listUnevaluatedIdeas(themeName: string, evaluator: string, limit: number): Promise<IdeaRow[]>;
  insertEvaluation(evaluation: EvaluationRecord): Promise<void>;
  listThemes(): Promise<ThemeSummary[]>;
  getNextIdeaForReview(
    themeName: string,
    filter: ReviewFilter,
    humanEvaluator: string,
    afterId: string | null,
  ): Promise<ReviewCard | null>;
  getReviewCard(
    themeName: string,
    ideaId: string,
    humanEvaluator: string,
  ): Promise<ReviewCard | null>;
  close(): Promise<void>;
}

const REVIEW_CARD_BASE_QUERY = `
  WITH latest_ai AS (
    SELECT idea_id, verdict,
           ROW_NUMBER() OVER (PARTITION BY idea_id ORDER BY created_at DESC, id DESC) AS rn
    FROM evaluations
    WHERE evaluator LIKE 'ai:%'
  ),
  latest_human AS (
    SELECT idea_id, verdict, scores_json, comment,
           ROW_NUMBER() OVER (PARTITION BY idea_id ORDER BY created_at DESC, id DESC) AS rn
    FROM evaluations
    WHERE evaluator = @humanEvaluator
  )
  SELECT
    ideas.id AS id,
    ideas.theme_name AS theme_name,
    ideas.seed_terms_json AS seed_terms_json,
    ideas.title AS title,
    ideas.body AS body,
    la.verdict AS ai_verdict,
    lh.verdict AS human_verdict,
    lh.scores_json AS human_scores_json,
    lh.comment AS human_comment
  FROM ideas
  LEFT JOIN latest_ai la ON la.idea_id = ideas.id AND la.rn = 1
  LEFT JOIN latest_human lh ON lh.idea_id = ideas.id AND lh.rn = 1
  WHERE ideas.theme_name = @themeName
`;

interface ReviewCardRow {
  id: string;
  theme_name: string;
  seed_terms_json: string;
  title: string;
  body: string;
  ai_verdict: Verdict | null;
  human_verdict: Verdict | null;
  human_scores_json: string | null;
  human_comment: string | null;
}

function mapReviewCardRow(row: ReviewCardRow): ReviewCard {
  return {
    id: row.id,
    themeName: row.theme_name,
    seedTerms: JSON.parse(row.seed_terms_json) as string[],
    title: row.title,
    body: row.body,
    aiVerdict: row.ai_verdict,
    humanVerdict: row.human_verdict,
    humanScores: row.human_scores_json
      ? (JSON.parse(row.human_scores_json) as Record<string, number>)
      : null,
    humanComment: row.human_comment,
  };
}

function filterPredicate(filter: ReviewFilter): { sql: string; params: Record<string, unknown> } {
  switch (filter.type) {
    case "ai-keep":
      return { sql: "AND la.verdict = 'keep'", params: {} };
    case "human-unevaluated":
      return { sql: "AND lh.verdict IS NULL", params: {} };
    case "disagreement":
      return {
        sql: "AND la.verdict IS NOT NULL AND lh.verdict IS NOT NULL AND la.verdict <> lh.verdict",
        params: {},
      };
    case "human-verdict":
      return { sql: "AND lh.verdict = @filterVerdict", params: { filterVerdict: filter.verdict } };
  }
}

export async function openDb(dbFile: string): Promise<DbHandle> {
  const raw = new Database(dbFile);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");

  return {
    async migrate() {
      raw.exec(SCHEMA_SQL);
    },

    async upsertTheme(theme) {
      raw
        .prepare(
          `INSERT INTO themes (name, description, axes_json, updated_at)
           VALUES (@name, @description, @axesJson, @updatedAt)
           ON CONFLICT(name) DO UPDATE SET
             description = excluded.description,
             axes_json = excluded.axes_json,
             updated_at = excluded.updated_at`,
        )
        .run({
          name: theme.name,
          description: theme.description,
          axesJson: JSON.stringify(theme.axes),
          updatedAt: new Date().toISOString(),
        });
    },

    async insertIdeaIfAbsent(idea) {
      const result = raw
        .prepare(
          `INSERT OR IGNORE INTO ideas
             (id, theme_name, seed_terms_json, title, body, model, batch, created_at)
           VALUES (@id, @themeName, @seedTermsJson, @title, @body, @model, @batch, @createdAt)`,
        )
        .run({
          id: idea.id,
          themeName: idea.theme,
          seedTermsJson: JSON.stringify(idea.seedTerms),
          title: idea.title,
          body: idea.body,
          model: idea.model,
          batch: idea.batch,
          createdAt: idea.createdAt,
        });
      return result.changes > 0;
    },

    async countIdeasInBatch(themeName, batch) {
      const row = raw
        .prepare(
          `SELECT COUNT(*) AS count FROM ideas WHERE theme_name = ? AND batch = ?`,
        )
        .get(themeName, batch) as { count: number };
      return row.count;
    },

    async pruneUnevaluatedBatch(themeName, batch) {
      const result = raw
        .prepare(
          `DELETE FROM ideas
           WHERE theme_name = @themeName
             AND batch = @batch
             AND id NOT IN (SELECT DISTINCT idea_id FROM evaluations)`,
        )
        .run({ themeName, batch });
      return result.changes;
    },

    async countUnevaluatedIdeas(themeName, evaluator) {
      const row = raw
        .prepare(
          `SELECT COUNT(*) AS count FROM ideas
           WHERE theme_name = @themeName
             AND NOT EXISTS (
               SELECT 1 FROM evaluations
               WHERE evaluations.idea_id = ideas.id AND evaluations.evaluator = @evaluator
             )`,
        )
        .get({ themeName, evaluator }) as { count: number };
      return row.count;
    },

    async listUnevaluatedIdeas(themeName, evaluator, limit) {
      const rows = raw
        .prepare(
          `SELECT id, theme_name, seed_terms_json, title, body, model, batch, created_at
           FROM ideas
           WHERE theme_name = @themeName
             AND NOT EXISTS (
               SELECT 1 FROM evaluations
               WHERE evaluations.idea_id = ideas.id AND evaluations.evaluator = @evaluator
             )
           ORDER BY created_at ASC
           LIMIT @limit`,
        )
        .all({ themeName, evaluator, limit }) as Array<{
        id: string;
        theme_name: string;
        seed_terms_json: string;
        title: string;
        body: string;
        model: string;
        batch: string;
        created_at: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        themeName: row.theme_name,
        seedTerms: JSON.parse(row.seed_terms_json) as string[],
        title: row.title,
        body: row.body,
        model: row.model,
        batch: row.batch,
        createdAt: row.created_at,
      }));
    },

    async insertEvaluation(evaluation) {
      raw
        .prepare(
          `INSERT INTO evaluations
             (id, idea_id, evaluator, scores_json, verdict, comment, created_at)
           VALUES (@id, @ideaId, @evaluator, @scoresJson, @verdict, @comment, @createdAt)`,
        )
        .run({
          id: evaluation.id,
          ideaId: evaluation.ideaId,
          evaluator: evaluation.evaluator,
          scoresJson: JSON.stringify(evaluation.scores),
          verdict: evaluation.verdict,
          comment: evaluation.comment,
          createdAt: evaluation.createdAt,
        });
    },

    async listThemes() {
      return raw
        .prepare(`SELECT name, description FROM themes ORDER BY name ASC`)
        .all() as ThemeSummary[];
    },

    async getNextIdeaForReview(themeName, filter, humanEvaluator, afterId) {
      const { sql: filterSql, params: filterParams } = filterPredicate(filter);
      const cursorSql = `
        AND (
          @afterId IS NULL
          OR ideas.created_at > (SELECT created_at FROM ideas WHERE id = @afterId)
          OR (
            ideas.created_at = (SELECT created_at FROM ideas WHERE id = @afterId)
            AND ideas.id > @afterId
          )
        )
      `;
      const row = raw
        .prepare(
          `${REVIEW_CARD_BASE_QUERY} ${filterSql} ${cursorSql}
           ORDER BY ideas.created_at ASC, ideas.id ASC
           LIMIT 1`,
        )
        .get({ themeName, humanEvaluator, afterId, ...filterParams }) as
        | ReviewCardRow
        | undefined;
      return row ? mapReviewCardRow(row) : null;
    },

    async getReviewCard(themeName, ideaId, humanEvaluator) {
      const row = raw
        .prepare(`${REVIEW_CARD_BASE_QUERY} AND ideas.id = @ideaId LIMIT 1`)
        .get({ themeName, humanEvaluator, ideaId }) as ReviewCardRow | undefined;
      return row ? mapReviewCardRow(row) : null;
    },

    async close() {
      raw.close();
    },
  };
}
