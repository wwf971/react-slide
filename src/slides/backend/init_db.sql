CREATE TABLE IF NOT EXISTS slide_documents (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slide_resources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data_bytes BYTEA,
  data_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slide_documents_created
  ON slide_documents (created_at, id);

CREATE INDEX IF NOT EXISTS idx_slide_resources_created
  ON slide_resources (created_at, id);
