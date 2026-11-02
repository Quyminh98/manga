import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, CheckCircle2, CircleDashed, KeyRound, Loader2, RefreshCw, Trash2, Wifi, XCircle } from 'lucide-react'
import { appApi } from '@renderer/lib/appApi'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { providerApiKeySchema, type ProviderApiKeyFormValues } from '@renderer/lib/validation/providerKey.schema'
import { VilaoConnectionStatus } from '@shared/enums'
import { LLM_PROVIDER_META, type LlmProvider } from '@shared/llmProviders'

const STATUS_META: Record<VilaoConnectionStatus, { label: string; className: string; Icon: typeof Wifi }> = {
  [VilaoConnectionStatus.NOT_CONFIGURED]: {
    label: 'Not configured',
    className: 'text-text-secondary',
    Icon: CircleDashed
  },
  [VilaoConnectionStatus.CHECKING]: { label: 'Checking…', className: 'text-vilao-blue', Icon: Loader2 },
  [VilaoConnectionStatus.CONNECTED]: {
    label: 'Connected',
    className: 'text-emerald-success',
    Icon: CheckCircle2
  },
  [VilaoConnectionStatus.INVALID]: { label: 'Invalid API key', className: 'text-error', Icon: XCircle },
  [VilaoConnectionStatus.ERROR]: { label: 'Connection error', className: 'text-error', Icon: AlertTriangle }
}

// spec.md 5.1/5.2 — one card per provider (Phase 25: Vilao/DeepSeek/Gemini):
// save key (Electron safeStorage via providers:saveApiKey), Test Connection
// (5-state), Refresh Models. The model itself is picked per channel
// (ChannelForm), not here. API key never round-trips back to the renderer —
// only save/test/list cross IPC (spec.md 4.1).
export function ProviderKeyCard({ provider }: { provider: LlmProvider }): JSX.Element {
  const { label, keyPlaceholder } = LLM_PROVIDER_META[provider]
  const [status, setStatus] = useState<VilaoConnectionStatus>(VilaoConnectionStatus.NOT_CONFIGURED)
  const [modelCount, setModelCount] = useState<number | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  // Whether a key currently exists on disk (independent of `status`, which
  // resets to Not Configured after every Save to force re-verification —
  // see onSave below). While true, the input is locked (disabled, masked
  // placeholder) — a saved key is never read back into the Renderer. Remove
  // the key first to unlock the field and enter a new one.
  const [hasSavedKey, setHasSavedKey] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ProviderApiKeyFormValues>({
    resolver: zodResolver(providerApiKeySchema),
    defaultValues: { apiKey: '' }
  })

  const fetchModels = useCallback(async () => {
    try {
      const list = await appApi.providers.listModels(provider)
      setModelCount(list.length)
      setModelsError(null)
    } catch (err) {
      setModelCount(null)
      setModelsError(err instanceof Error ? err.message : 'Failed to load models')
    }
  }, [provider])

  const testConnection = useCallback(async () => {
    setStatus(VilaoConnectionStatus.CHECKING)
    const result = await appApi.providers.testConnection(provider)
    setStatus(result)
    if (result === VilaoConnectionStatus.CONNECTED) {
      await fetchModels()
    } else {
      setModelCount(null)
      setModelsError(null)
    }
  }, [provider, fetchModels])

  useEffect(() => {
    void (async () => {
      setHasSavedKey(await appApi.providers.hasApiKey(provider))
      await testConnection()
    })()
    // Only on mount — subsequent runs are triggered explicitly by Save/Test Connection/Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSave = handleSubmit(async (values) => {
    setSaveMessage(null)
    await appApi.providers.saveApiKey(provider, values.apiKey)
    reset({ apiKey: '' })
    setHasSavedKey(true)
    setSaveMessage('API key saved securely.')
    // spec.md 5.1: changing the API key re-fetches the model list — done
    // automatically right after Save instead of a separate manual click.
    await testConnection()
  })

  const onRemove = async (): Promise<void> => {
    await appApi.providers.clearApiKey(provider)
    reset({ apiKey: '' })
    setHasSavedKey(false)
    setModelCount(null)
    setModelsError(null)
    setStatus(VilaoConnectionStatus.NOT_CONFIGURED)
    setSaveMessage('API key removed.')
  }

  const meta = STATUS_META[status]

  return (
    <Card>
      <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">{label} Connection</h3>
      <form onSubmit={onSave} className="space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block font-label-caps text-label-caps text-text-secondary">API KEY</label>
            {hasSavedKey && (
              <span className="flex items-center gap-1 font-label-caps text-label-caps text-emerald-success">
                <KeyRound size={11} />
                SAVED
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <input
              {...register('apiKey')}
              type="password"
              disabled={hasSavedKey}
              placeholder={hasSavedKey ? '•••••••••••••••••••• (saved)' : keyPlaceholder}
              autoComplete="off"
              className="flex-1 bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-code-sm text-code-sm focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {hasSavedKey ? (
              <Button type="button" variant="danger" onClick={() => void onRemove()}>
                <Trash2 size={14} />
                Remove
              </Button>
            ) : (
              <Button type="submit" variant="ghost" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={status === VilaoConnectionStatus.CHECKING}
              onClick={() => void testConnection()}
            >
              <Wifi size={16} />
              Test Connection
            </Button>
          </div>
          {errors.apiKey && <p className="mt-2 font-body-sm text-body-sm text-error">{errors.apiKey.message}</p>}
          <p className={`mt-2 font-body-sm text-body-sm flex items-center gap-1.5 ${meta.className}`}>
            <meta.Icon size={14} className={status === VilaoConnectionStatus.CHECKING ? 'animate-spin' : ''} />
            Status: {meta.label}
          </p>
          {saveMessage && <p className="mt-1 font-body-sm text-body-sm text-text-secondary">{saveMessage}</p>}
        </div>

        <div className="flex items-center justify-between">
          {modelsError ? (
            <p className="font-body-sm text-body-sm text-error">{modelsError}</p>
          ) : (
            <p className="font-body-sm text-body-sm text-text-secondary">
              {modelCount !== null
                ? `${modelCount} models available — pick one per channel.`
                : 'Save a valid API key to load available models.'}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-body-sm"
            disabled={status !== VilaoConnectionStatus.CONNECTED}
            onClick={() => void fetchModels()}
          >
            <RefreshCw size={14} />
            Refresh Models
          </Button>
        </div>
      </form>
    </Card>
  )
}
