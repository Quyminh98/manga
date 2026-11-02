// Real schema change (adds a column to both tables) — confirmed with the user
// before implementing, per CLAUDE.md (see plan.md Phase 21). New per-channel/
// per-project boolean: whether this channel's transcripts have story
// characters at all. false skips Character Detection/Character Prompt
// Generation entirely (PipelineService.runProjectInternal()) — Scene
// Generation already tolerates 0 characters (ScenePromptService.generateBatch,
// characters.length === 0 branch), so no other pipeline code needed to
// change.
//
// No REFERENCES clause on either column, so (unlike 0004_add_channels's
// channel_id) `ADD COLUMN ... NOT NULL DEFAULT 1` in one statement is fine
// even on a non-empty table — same reasoning as 0003/0005's added columns.
// DEFAULT 1 (true) backfills every existing channel/project to the current
// behavior (character pipeline always runs) — "No Characters" is an opt-in
// choice for new channels going forward, never a retroactive change.
export const migration0006AddHasCharacters = {
  name: '0006_add_has_characters',
  sql: `
ALTER TABLE channels ADD COLUMN has_characters INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN has_characters INTEGER NOT NULL DEFAULT 1;
`
}
