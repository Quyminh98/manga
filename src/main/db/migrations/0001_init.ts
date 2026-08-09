// Field-for-field mirror of context/schema.md's 6 SQLite tables — do not
// add/remove/rename columns without updating schema.md first.
//
// TS module (not a .sql file) so electron-vite's esbuild bundler inlines the
// string into out/main directly — no runtime asset-copy step to get wrong
// when the app is packaged with electron-builder.
export const migration0001Init = {
  name: '0001_init',
  sql: `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transcript TEXT NOT NULL,
  status TEXT NOT NULL,
  selected_model TEXT,
  max_characters INTEGER NOT NULL,
  fake_duration_sec INTEGER NOT NULL,
  max_retry INTEGER NOT NULL,
  scene_concurrency INTEGER NOT NULL,
  character_detection_prompt_snapshot TEXT,
  character_generation_prompt_snapshot TEXT,
  scene_generation_prompt_snapshot TEXT,
  selected_model_snapshot TEXT,
  max_characters_snapshot INTEGER,
  fake_duration_snapshot INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE TABLE srt_blocks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  block_index INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  character_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, block_index)
);
CREATE INDEX idx_srt_blocks_project_id ON srt_blocks (project_id);

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  age_range TEXT NOT NULL,
  appearance TEXT NOT NULL,
  hair TEXT NOT NULL,
  clothing TEXT NOT NULL,
  personality TEXT NOT NULL,
  role TEXT NOT NULL,
  unique_features TEXT NOT NULL,
  visual_dna TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, character_id)
);
CREATE INDEX idx_characters_project_id ON characters (project_id);

CREATE TABLE character_prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, character_id)
);
CREATE INDEX idx_character_prompts_project_id ON character_prompts (project_id);

CREATE TABLE scene_prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  srt_block_id TEXT NOT NULL REFERENCES srt_blocks (id) ON DELETE CASCADE,
  block_index INTEGER NOT NULL,
  relevant_character_ids TEXT NOT NULL DEFAULT '[]',
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, srt_block_id)
);
CREATE INDEX idx_scene_prompts_project_id ON scene_prompts (project_id);

CREATE TABLE pipeline_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_pipeline_tasks_project_id ON pipeline_tasks (project_id);
`
}
