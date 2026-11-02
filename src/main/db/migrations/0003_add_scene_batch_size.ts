// Real schema change (adds a column) — confirmed with the user before
// implementing, per CLAUDE.md. New per-project field, same convention as
// max_retry/scene_concurrency (Advanced Settings > Pipeline Tuning): how
// many SRT blocks get grouped into a single Scene/Image Prompt Generation
// request (src/main/pipeline/generateScenePrompt.ts's SCENE_PROMPT_BATCH_SIZE
// constant, previously fixed at 10 for every project, not user-tunable).
//
// `DEFAULT 10` backfills existing rows to match the exact behavior they had
// before this column existed (the old fixed constant) — new rows always get
// an explicit value from ProjectService.create(), same as every other
// per-project pipeline-tuning field; the SQL default here is only a
// safety net for this one-time ALTER TABLE backfill.
export const migration0003AddSceneBatchSize = {
  name: '0003_add_scene_batch_size',
  sql: `
ALTER TABLE projects ADD COLUMN scene_batch_size INTEGER NOT NULL DEFAULT 10;
`
}
