import { z } from 'zod'

// New Project form (spec.md 6.1: nhập Project Name + Transcript).
export const newProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  transcript: z.string().trim().min(1, 'Transcript is required')
})

export type NewProjectFormValues = z.infer<typeof newProjectSchema>

export const renameProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required')
})

export type RenameProjectFormValues = z.infer<typeof renameProjectSchema>
