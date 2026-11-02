import { LEGACY_DEFAULT_PROMPT_UPGRADES } from '@shared/legacyPrompts'

// Phase 28 — data-only migration (no schema change): the default prompts were
// reordered so their fixed instructions come first and per-request data last
// (prompt-cache friendly, see src/shared/legacyPrompts.ts). Any channel column
// still holding an untouched old default gets the new one; user-edited prompts
// and every project *_prompt_snapshot are left exactly as they are.
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

const COLUMNS = [
  'character_detection_prompt',
  'character_generation_prompt',
  'scene_generation_prompt',
  'scene_generation_prompt_no_characters'
]

export const migration0009ReorderDefaultPrompts = {
  name: '0009_reorder_default_prompts',
  sql: COLUMNS.flatMap((column) =>
    LEGACY_DEFAULT_PROMPT_UPGRADES.map(
      ([legacy, current]) =>
        `UPDATE channels SET ${column} = '${escapeSqlString(current)}' WHERE ${column} = '${escapeSqlString(legacy)}';`
    )
  ).join('\n')
}
