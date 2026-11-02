import { z } from 'zod'

// Settings > General/Prompts (see ChannelService/schema.md channels table)
// mirrored here for the New/Edit Channel form — same ranges ChannelService
// validates server-side, kept in sync deliberately.
export const channelSchema = z.object({
  name: z.string().trim().min(1, 'Channel name is required'),
  avgCharacters: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(30, 'Minimum 30')
    .max(2000, 'Maximum 2000'),
  variancePercent: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(0, 'Minimum 0')
    .max(90, 'Maximum 90'),
  fakeDurationSec: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(30, 'Maximum 30'),
  // Plain string, not nullable — bound to a <select>, which can only ever
  // submit a string. Empty string means "no model selected"; callers convert
  // to `null` right before sending it over IPC (Channel.selectedModel is
  // `string | null`).
  selectedModel: z.string(),
  characterDetectionPrompt: z.string().trim().min(1, 'Character Detection prompt is required'),
  characterGenerationPrompt: z.string().trim().min(1, 'Character Generation prompt is required'),
  sceneGenerationPrompt: z.string().trim().min(1, 'Scene / Image Generation prompt is required'),
  // Phase 22 — used instead of sceneGenerationPrompt when Has Story
  // Characters is off; ChannelForm.tsx shows only whichever one applies.
  sceneGenerationPromptNoCharacters: z
    .string()
    .trim()
    .min(1, 'Scene / Image Generation prompt (No Characters) is required'),
  sceneConcurrency: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(10, 'Maximum 10'),
  sceneBatchSize: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(30, 'Maximum 30'),
  // Phase 21 — false skips Character Detection/Character Prompt Generation
  // for every project created in this channel (transcript with no story
  // characters). characterDetectionPrompt/characterGenerationPrompt stay
  // required by this schema either way — ChannelForm.tsx only hides those 2
  // fields from view when this is off, it doesn't unregister them.
  hasCharacters: z.boolean()
})

export type ChannelFormValues = z.infer<typeof channelSchema>
