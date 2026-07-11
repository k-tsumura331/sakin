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

export type Verdict = "keep" | "drop" | "maybe";

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
  insertEvaluation(evaluation: EvaluationRecord): Promise<void>;
  close(): Promise<void>;
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

    async close() {
      raw.close();
    },
  };
}
