import { DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT } from '@shared/prompts'

// Real schema change (adds a column) — confirmed with the user before
// implementing, per CLAUDE.md (see plan.md Phase 22). A second, separate
// Scene/Image Generation template used instead of channels.scene_generation_prompt
// for a channel with has_characters=false (Phase 21) — no
// {{RELEVANT_CHARACTERS}}/{{RELEVANT_CHARACTER_PROMPTS}} placeholders, since
// there's never any character data to inject for that kind of channel.
//
// No REFERENCES clause, so (same as 0003/0005/0006) `ADD COLUMN ... NOT NULL
// DEFAULT '...'` in one statement is fine even on a non-empty table. Backfills
// every existing channel with the real default prompt text (not an empty
// string) so a pre-existing channel switched to hasCharacters=false later
// still has a genuinely usable prompt, not just a non-null placeholder —
// same reasoning 0004_add_channels used to seed its "Default" channel's 3
// prompt columns from the JS default constants instead of leaving them blank.
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

export const migration0007AddSceneGenerationPromptNoCharacters = {
  name: '0007_add_scene_generation_prompt_no_characters',
  sql: `
ALTER TABLE channels ADD COLUMN scene_generation_prompt_no_characters TEXT NOT NULL DEFAULT '${escapeSqlString(DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT)}';
`
}
