import { Brush, UserSearch, Wand } from 'lucide-react'
import { PromptEditorCard } from '@renderer/features/settings/prompts/PromptEditorCard'
import {
  DEFAULT_CHARACTER_DETECTION_PROMPT,
  DEFAULT_CHARACTER_GENERATION_PROMPT,
  DEFAULT_SCENE_GENERATION_PROMPT
} from '@shared/prompts'

// spec.md 26 — Settings > Prompts. All 3 editors are real as of Phase 8:
// Character Detection (Phase 6), Character Generation (Phase 7), Scene /
// Image Generation (Phase 8).
export function PromptsSettingsPage(): JSX.Element {
  return (
    <div>
      <p className="font-body-md text-body-md text-text-secondary max-w-3xl mb-6">
        These prompts drive each AI pipeline stage. Editors unlock as their phase ships.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PromptEditorCard
          icon={UserSearch}
          title="Character Detection"
          filename="character_detection.txt"
          promptKey="characterDetection"
          defaultPrompt={DEFAULT_CHARACTER_DETECTION_PROMPT}
        />
        <PromptEditorCard
          icon={Brush}
          title="Character Generation"
          filename="character_generation.txt"
          promptKey="characterGeneration"
          defaultPrompt={DEFAULT_CHARACTER_GENERATION_PROMPT}
        />
        <PromptEditorCard
          icon={Wand}
          title="Scene / Image Generation"
          filename="scene_generation.txt"
          promptKey="sceneGeneration"
          defaultPrompt={DEFAULT_SCENE_GENERATION_PROMPT}
        />
      </div>
    </div>
  )
}
