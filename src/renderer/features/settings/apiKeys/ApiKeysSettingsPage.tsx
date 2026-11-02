import { ProviderKeyCard } from './ProviderKeyCard'
import { LLM_PROVIDERS } from '@shared/llmProviders'

// Phase 25 — Settings > API Keys: one ProviderKeyCard per provider.
export function ApiKeysSettingsPage(): JSX.Element {
  return (
    <div className="space-y-6 max-w-3xl">
      {LLM_PROVIDERS.map((provider) => (
        <ProviderKeyCard key={provider} provider={provider} />
      ))}
    </div>
  )
}
