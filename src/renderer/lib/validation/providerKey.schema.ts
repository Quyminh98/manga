import { z } from 'zod'

// Settings > API Keys — API key form for any provider (spec.md 5.1: input password + Save).
export const providerApiKeySchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required')
})

export type ProviderApiKeyFormValues = z.infer<typeof providerApiKeySchema>
