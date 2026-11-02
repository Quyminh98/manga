import { Brush, ImageOff, UserSearch, Wand } from 'lucide-react'
import { PromptEditorCard } from '@renderer/features/settings/prompts/PromptEditorCard'
import {
  DEFAULT_CHARACTER_DETECTION_PROMPT,
  DEFAULT_CHARACTER_GENERATION_PROMPT,
  DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT,
  DEFAULT_SCENE_GENERATION_PROMPT
} from '@shared/prompts'

// spec.md 26 — Settings > Prompts. All 3 editors are real as of Phase 8:
// Character Detection (Phase 6), Character Generation (Phase 7), Scene /
// Image Generation (Phase 8). Phase 18: these are now the default template a
// newly created *channel* starts from (NewChannelPage.tsx), not a project
// directly — editing them here never touches an existing channel/project.
// Phase 22: a 4th editor, Scene / Image Generation (No Characters), seeds
// Channel.sceneGenerationPromptNoCharacters — the template actually used for
// a channel with Has Story Characters off (Phase 21). Shown here
// unconditionally (this page has no notion of a single channel's
// hasCharacters) — ChannelForm.tsx is where only the relevant one of the two
// scene prompts is shown per channel.
export function PromptsSettingsPage(): JSX.Element {
  return (
    <div>
      <p className="font-body-md text-body-md text-text-secondary max-w-3xl mb-6">
        These prompts drive each AI pipeline stage — and seed the default template for newly created Channels.
      </p>
      <div className="grid grid-cols-1 gap-6">
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
        <PromptEditorCard
          icon={ImageOff}
          title="Scene / Image Generation (No Characters)"
          filename="scene_generation_no_characters.txt"
          promptKey="sceneGenerationNoCharacters"
          defaultPrompt={DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT}
        />
      </div>
    </div>
  )
}
