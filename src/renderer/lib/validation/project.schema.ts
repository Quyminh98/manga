import { z } from 'zod'

// New Project form (spec.md 6.1: nhập Project Name + Transcript). channelId
// (Phase 18) is required — every project belongs to exactly one channel,
// chosen once here and never changed afterward.
export const newProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  transcript: z.string().trim().min(1, 'Transcript is required'),
  channelId: z.string().min(1, 'Select a channel')
})

export type NewProjectFormValues = z.infer<typeof newProjectSchema>
