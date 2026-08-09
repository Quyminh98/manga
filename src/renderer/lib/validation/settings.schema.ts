import { z } from 'zod'

// Settings > General (spec.md 10.1/10.2): Max Characters per SRT (100-2000)
// and Duration per SRT block (1-30s) — schema.md `projects.max_characters` /
// `fake_duration_sec` are integers, so no decimals here.
export const generalSettingsSchema = z.object({
  maxCharacters: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(100, 'Minimum 100')
    .max(2000, 'Maximum 2000'),
  fakeSrtDurationSec: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(30, 'Maximum 30')
})

export type GeneralSettingsFormValues = z.infer<typeof generalSettingsSchema>
