import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, CheckCircle2, CircleDashed, KeyRound, Loader2, RefreshCw, Trash2, Wifi, XCircle } from 'lucide-react'
import { appApi } from '@renderer/lib/appApi'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { vilaoApiKeySchema, type VilaoApiKeyFormValues } from '@renderer/lib/validation/vilaoSettings.schema'
import { VilaoConnectionStatus } from '@shared/enums'
import type { ModelInfo } from '@shared/entities'

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

// spec.md 5.1/5.2 — Settings > Vilao API: save key (Electron safeStorage via
// vilao:saveApiKey), Test Connection (5-state), model dropdown fed by
// vilao:listModels, Refresh Models. API key itself never round-trips back to
// the renderer — only save/test/list cross IPC (spec.md 4.1).
export function VilaoApiSettingsPage(): JSX.Element {
  const [status, setStatus] = useState<VilaoConnectionStatus>(VilaoConnectionStatus.NOT_CONFIGURED)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  // Whether a key currently exists on disk (independent of `status`, which
  // resets to Not Configured after every Save to force re-verification —
  // see onSave below). While true, the input is locked (disabled, masked
  // placeholder) — a saved key is never read back into the Renderer, so an
  // empty-but-"filled-looking" editable field was confusing. Remove the key
  // first to unlock the field and enter a new one.
  const [hasSavedKey, setHasSavedKey] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<VilaoApiKeyFormValues>({
    resolver: zodResolver(vilaoApiKeySchema),
    defaultValues: { apiKey: '' }
  })

  const fetchModels = useCallback(async (currentSelected: string | null) => {
    try {
      const list = await appApi.vilao.listModels()
      setModels(list)
      setModelsError(null)
      if (currentSelected && !list.some((m) => m.id === currentSelected)) {
        setSelectedModel(null)
        await appApi.settings.save({ selectedModel: null })
      }
    } catch (err) {
      setModels([])
      setModelsError(err instanceof Error ? err.message : 'Failed to load models')
    }
  }, [])

  const testConnection = useCallback(
    async (currentSelected: string | null) => {
      setStatus(VilaoConnectionStatus.CHECKING)
      const result = await appApi.vilao.testConnection()
      setStatus(result)
      if (result === VilaoConnectionStatus.CONNECTED) {
        await fetchModels(currentSelected)
      } else {
        setModels([])
        setModelsError(null)
      }
    },
    [fetchModels]
  )

  useEffect(() => {
    void (async () => {
      const [settings, savedKeyExists] = await Promise.all([appApi.settings.get(), appApi.vilao.hasApiKey()])
      setSelectedModel(settings.selectedModel)
      setHasSavedKey(savedKeyExists)
      await testConnection(settings.selectedModel)
    })()
    // Only on mount — subsequent runs are triggered explicitly by Save/Test Connection/Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSave = handleSubmit(async (values) => {
    setSaveMessage(null)
    await appApi.vilao.saveApiKey(values.apiKey)
    reset({ apiKey: '' })
    setHasSavedKey(true)
    setSaveMessage('API key saved securely.')
    // spec.md 5.1: changing the API key clears the old model list and fetches
    // it again — done automatically right after Save (testConnection() resets
    // status to Checking, clears stale models, and fetchModels() on success)
    // instead of requiring a separate manual "Test Connection" click.
    await testConnection(selectedModel)
  })

  const onRemove = async (): Promise<void> => {
    await appApi.vilao.clearApiKey()
    reset({ apiKey: '' })
    setHasSavedKey(false)
    setModels([])
    setModelsError(null)
    setStatus(VilaoConnectionStatus.NOT_CONFIGURED)
    setSaveMessage('API key removed.')
  }

  const onModelChange = async (modelId: string): Promise<void> => {
    setSelectedModel(modelId)
    await appApi.settings.save({ selectedModel: modelId })
  }

  const meta = STATUS_META[status]

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Vilao Engine Connection</h3>
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
                placeholder={hasSavedKey ? '•••••••••••••••••••• (saved)' : 'sk-vilao-…'}
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
                onClick={() => void testConnection(selectedModel)}
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-label-caps text-label-caps text-text-secondary">MODEL</label>
              <Button
                type="button"
                variant="ghost"
                className="px-2 py-1 text-body-sm"
                disabled={status !== VilaoConnectionStatus.CONNECTED}
                onClick={() => void fetchModels(selectedModel)}
              >
                <RefreshCw size={14} />
                Refresh Models
              </Button>
            </div>
            <select
              disabled={status !== VilaoConnectionStatus.CONNECTED || models.length === 0}
              value={selectedModel ?? ''}
              onChange={(e) => void onModelChange(e.target.value)}
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="" disabled>
                {models.length === 0 ? 'No models loaded' : 'Select a model'}
              </option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            {modelsError ? (
              <p className="mt-1 font-body-sm text-body-sm text-error">{modelsError}</p>
            ) : (
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
                Save a valid API key and Test Connection to fetch available models.
              </p>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
