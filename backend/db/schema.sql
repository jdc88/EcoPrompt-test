CREATE TABLE IF NOT EXISTS prompt_examples (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  avg_rating REAL,
  agreement_ratio REAL,
  kind TEXT,
  topic TEXT,
  cluster_description TEXT,
  source_dataset TEXT NOT NULL DEFAULT 'manual_seed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompt_runs (
  id BIGSERIAL PRIMARY KEY,
  raw_prompt TEXT NOT NULL,
  task_type TEXT,
  target_model TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompt_retrievals (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES prompt_runs(id) ON DELETE CASCADE,
  example_id BIGINT REFERENCES prompt_examples(id) ON DELETE SET NULL,
  retrieved_text TEXT NOT NULL,
  similarity REAL,
  rank_position INTEGER,
  retrieval_source TEXT NOT NULL DEFAULT 'human_delta',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompt_rewrites (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES prompt_runs(id) ON DELETE CASCADE,
  optimized_prompt TEXT NOT NULL,
  changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_name TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompt_examples_topic
  ON prompt_examples(topic);

CREATE INDEX IF NOT EXISTS idx_prompt_examples_kind
  ON prompt_examples(kind);

CREATE INDEX IF NOT EXISTS idx_prompt_runs_created_at
  ON prompt_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prompt_retrievals_run_id
  ON prompt_retrievals(run_id);

CREATE INDEX IF NOT EXISTS idx_prompt_retrievals_example_id
  ON prompt_retrievals(example_id);

CREATE INDEX IF NOT EXISTS idx_prompt_rewrites_run_id
  ON prompt_rewrites(run_id);