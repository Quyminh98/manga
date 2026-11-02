import { z } from 'zod'

// Settings > General (spec.md 10.1/10.2): Average Characters per SRT
// (30-2000, min lowered from 100 by user request) + Variance % (0-90, Phase
// 18 — user request) and Duration per SRT block (1-30s) — schema.md
// `channels.avg_characters`/`variance_percent`/`projects.fake_duration_sec`
// are integers, so no decimals here.
export const generalSettingsSchema = z.object({
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
  fakeSrtDurationSec: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(30, 'Maximum 30')
})

export type GeneralSettingsFormValues = z.infer<typeof generalSettingsSchema>
