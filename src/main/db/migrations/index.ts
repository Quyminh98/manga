import { migration0001Init } from './0001_init'
import { migration0002NormalizeScenePromptNewlines } from './0002_normalize_scene_prompt_newlines'
import { migration0003AddSceneBatchSize } from './0003_add_scene_batch_size'
import { migration0004AddChannels } from './0004_add_channels'
import { migration0005RenameAvgCharactersAndAddVariance } from './0005_rename_avg_characters_and_add_variance'
import { migration0006AddHasCharacters } from './0006_add_has_characters'
import { migration0007AddSceneGenerationPromptNoCharacters } from './0007_add_scene_generation_prompt_no_characters'
import { migration0008AddLlmCalls } from './0008_add_llm_calls'
import { migration0009ReorderDefaultPrompts } from './0009_reorder_default_prompts'

export interface Migration {
  name: string
  sql: string
}

// Applied in order, tracked in the `_migrations` table (see ../migrate.ts).
export const MIGRATIONS: Migration[] = [
  migration0001Init,
  migration0002NormalizeScenePromptNewlines,
  migration0003AddSceneBatchSize,
  migration0004AddChannels,
  migration0005RenameAvgCharactersAndAddVariance,
  migration0006AddHasCharacters,
  migration0007AddSceneGenerationPromptNoCharacters,
  migration0008AddLlmCalls,
  migration0009ReorderDefaultPrompts
]
