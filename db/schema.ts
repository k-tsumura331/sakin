export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS themes (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  axes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  theme_name TEXT NOT NULL REFERENCES themes(name),
  seed_terms_json TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  model TEXT NOT NULL,
  batch TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ideas_theme_batch ON ideas(theme_name, batch);

CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  evaluator TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('keep', 'drop', 'maybe')),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evaluations_idea_evaluator_created
  ON evaluations(idea_id, evaluator, created_at DESC, id DESC);
`;
