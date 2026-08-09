import { z } from 'zod'

// Settings > Advanced > Pipeline Tuning (plan.md Phase 9). Per-project
// fields (schema.md projects.max_retry/scene_concurrency), not AppSettings —
// see ProjectService.updatePipelineSettings.
export const pipelineSettingsSchema = z.object({
  maxRetry: z.coerce.number({ invalid_type_error: 'Must be a number' }).int('Must be a whole number').min(1, 'Minimum 1'),
  sceneConcurrency: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(5, 'Maximum 5')
})

export type PipelineSettingsFormValues = z.infer<typeof pipelineSettingsSchema>
