import { z } from 'zod'

// Settings > Advanced > Pipeline Tuning (plan.md Phase 9). Per-project fields
// (schema.md projects.scene_concurrency/scene_batch_size), not AppSettings —
// see ProjectService.updatePipelineSettings. Max Retry is no longer part of
// this form (2026-08-10, user request) — every project is fixed at
// ProjectService's DEFAULT_MAX_RETRY (1), not user-editable.
export const pipelineSettingsSchema = z.object({
  sceneConcurrency: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(10, 'Maximum 10'),
  // How many SRT blocks get grouped into a single Scene/Image Prompt
  // Generation request (2026-08-10, user request). Range 1-30 (raised from
  // 1-20 on 2026-10-21, user request — same ceiling as ChannelService).
  sceneBatchSize: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Minimum 1')
    .max(30, 'Maximum 30')
})

export type PipelineSettingsFormValues = z.infer<typeof pipelineSettingsSchema>
