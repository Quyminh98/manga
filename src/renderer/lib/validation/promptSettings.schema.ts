import { z } from 'zod'

// Settings > Prompts editors (spec.md 26) — each editor just needs non-empty
// text; required-placeholder validation (spec.md 27) is a separate warning,
// not a hard Save-blocking error (users can still save mid-edit).
export const promptEditorSchema = z.object({
  content: z.string().min(1, 'Prompt cannot be empty')
})

export type PromptEditorFormValues = z.infer<typeof promptEditorSchema>
