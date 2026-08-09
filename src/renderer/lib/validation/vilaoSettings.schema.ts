import { z } from 'zod'

// Settings > Vilao API — API key form (spec.md 5.1: input password + Save).
export const vilaoApiKeySchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required')
})

export type VilaoApiKeyFormValues = z.infer<typeof vilaoApiKeySchema>
