// Real schema change (new table) — confirmed with the user before implementing,
// per CLAUDE.md (see plan.md Phase 27). One row per LLM request a project made
// (including every retry), so the per-project "API Calls" tab can show exact
// counts. `step` holds a TaskType value (DETECT_CHARACTERS /
// GENERATE_CHARACTER_PROMPTS / SELECT_RELEVANT_CHARACTERS / GENERATE_SCENE_PROMPT).
// Token columns are NULL when the provider's response had no `usage`.
// Cascade delete with the project, like every other project-owned table.
export const migration0008AddLlmCalls = {
  name: '0008_add_llm_calls',
  sql: `
CREATE TABLE llm_calls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  duration_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_llm_calls_project_id ON llm_calls (project_id);
`
}
