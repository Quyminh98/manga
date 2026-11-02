import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { appApi } from '@renderer/lib/appApi'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { channelSchema, type ChannelFormValues } from '@renderer/lib/validation/channel.schema'
import type { ModelInfo } from '@shared/entities'
import {
  LLM_PROVIDERS,
  THINKING_LABELS,
  formatModelDisplay,
  formatModelRef,
  getProviderLabel,
  getThinkingOptions,
  parseModelRef,
  stripThinking,
  type LlmProvider
} from '@shared/llmProviders'

interface ChannelFormProps {
  defaultValues: ChannelFormValues
  submitLabel: string
  onCancel: () => void
  onSubmit: (values: ChannelFormValues) => Promise<void>
}

// Shared by NewChannelPage/EditChannelPage — same fields either way (name +
// the settings a project copies once at creation: Average Characters/
// Variance/Duration/Model/3 prompt templates/Scene Concurrency/Scene Batch
// Size). Model list fetched best-effort — a channel can be created/edited
// even before any API key is configured (selectedModel just stays null until
// then).
export function ChannelForm({ defaultValues, submitLabel, onCancel, onSubmit }: ChannelFormProps): JSX.Element {
  // Phase 25 — models of every provider that has a saved key, keyed by provider.
  const [models, setModels] = useState<Partial<Record<LlmProvider, ModelInfo[]>>>({})
  const [modelsError, setModelsError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<ChannelFormValues>({ resolver: zodResolver(channelSchema), defaultValues })

  // Phase 21 — hides (not disables) the 2 character-prompt cards below when
  // off. React Hook Form keeps a field's last value in its internal state
  // even while it's unmounted/not registered (default shouldUnregister:
  // false), so characterDetectionPrompt/characterGenerationPrompt still
  // submit whatever was in defaultValues — no separate "make them optional"
  // logic needed on the backend (ChannelService.validate() still requires
  // both, unconditionally).
  const hasCharacters = watch('hasCharacters')

  useEffect(() => {
    void (async () => {
      const errors: string[] = []
      const loaded: Partial<Record<LlmProvider, ModelInfo[]>> = {}
      await Promise.all(
        LLM_PROVIDERS.map(async (provider) => {
          if (!(await appApi.providers.hasApiKey(provider))) return
          try {
            loaded[provider] = await appApi.providers.listModels(provider)
          } catch (err) {
            errors.push(`${getProviderLabel(provider)}: ${err instanceof Error ? err.message : 'Failed to load models'}`)
          }
        })
      )
      setModels(loaded)
      if (errors.length > 0) setModelsError(errors.join(' · '))
    })()
  }, [])

  const providersWithModels = LLM_PROVIDERS.filter((provider) => (models[provider]?.length ?? 0) > 0)
  const hasAnyModel = providersWithModels.length > 0
  // A channel can still point at a model whose provider key was removed (or
  // whose list failed to load) — keep it selectable instead of silently
  // blanking the field, with a hint that the key is missing.
  const currentModel = watch('selectedModel')
  // Phase 26 — the stored value is "[<provider>:]<id>[@<thinking>]"; the model
  // dropdown works on the part without the thinking suffix, the Thinking
  // dropdown on the suffix.
  const currentRef = parseModelRef(currentModel)
  const baseModel = stripThinking(currentModel)
  const thinkingOptions = currentModel ? getThinkingOptions(currentRef.provider, currentRef.modelId) : []
  const currentModelListed = providersWithModels.some((provider) => models[provider]?.some((m) => m.id === baseModel))
  const currentModelMissing = !!currentModel && !currentModelListed

  const onModelChange = (value: string): void => {
    const next = parseModelRef(value)
    // Keep the chosen thinking level only if the new model supports it.
    const keep = currentRef.thinking && getThinkingOptions(next.provider, next.modelId).includes(currentRef.thinking)
    setValue('selectedModel', formatModelRef(next.provider, next.modelId, keep ? currentRef.thinking : undefined), {
      shouldDirty: true
    })
  }

  const onThinkingChange = (value: string): void => {
    setValue(
      'selectedModel',
      formatModelRef(currentRef.provider, currentRef.modelId, value ? (value as typeof currentRef.thinking) : undefined),
      { shouldDirty: true }
    )
  }

  const submit = handleSubmit(async (values) => {
    await onSubmit(values)
  })

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Channel</h3>
        <div className="space-y-5">
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">Channel Name</label>
            <input
              {...register('name')}
              autoFocus
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 font-body-md text-body-md text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              placeholder="e.g. Historical Manhua"
            />
            {errors.name && <p className="mt-1 font-body-sm text-body-sm text-error">{errors.name.message}</p>}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              {...register('hasCharacters')}
              type="checkbox"
              className="w-4 h-4 rounded border-border-subtle bg-surface-container-lowest accent-vilao-blue"
            />
            <span className="font-body-md text-body-md text-text-primary">Has Story Characters</span>
          </label>
          <p className="-mt-3 font-body-sm text-body-sm text-text-secondary">
            Off for transcripts with no story characters (e.g. scenery/narration-only) — projects in this channel
            skip Character Detection and Character Prompt Generation entirely.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
                AVERAGE CHARACTERS PER SRT
              </label>
              <input
                {...register('avgCharacters')}
                type="number"
                className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 30–2000.</p>
              {errors.avgCharacters && <p className="mt-1 font-body-sm text-body-sm text-error">{errors.avgCharacters.message}</p>}
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-text-secondary mb-2">VARIANCE (±%)</label>
              <input
                {...register('variancePercent')}
                type="number"
                className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 0–90.</p>
              {errors.variancePercent && (
                <p className="mt-1 font-body-sm text-body-sm text-error">{errors.variancePercent.message}</p>
              )}
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
                DURATION PER SRT BLOCK (SECONDS)
              </label>
              <input
                {...register('fakeDurationSec')}
                type="number"
                className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 1–30.</p>
              {errors.fakeDurationSec && <p className="mt-1 font-body-sm text-body-sm text-error">{errors.fakeDurationSec.message}</p>}
            </div>
          </div>

          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">MODEL</label>
            <select
              value={baseModel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={!hasAnyModel && !currentModelMissing}
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">{hasAnyModel ? 'Select a model' : 'No models loaded'}</option>
              {currentModelMissing && (
                <option value={baseModel}>
                  {formatModelDisplay(baseModel)} — API key not available
                </option>
              )}
              {providersWithModels.map((provider) => (
                <optgroup key={provider} label={getProviderLabel(provider)}>
                  {models[provider]?.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {modelsError ? (
              <p className="mt-1 font-body-sm text-body-sm text-error">{modelsError}</p>
            ) : currentModelMissing ? (
              <p className="mt-1 font-body-sm text-body-sm text-error">
                The API key for {getProviderLabel(parseModelRef(currentModel).provider)} is missing or not connected —
                add it in Settings &gt; API Keys or pick another model.
              </p>
            ) : !hasAnyModel ? (
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
                Configure and connect an API key (Vilao, DeepSeek or Gemini) in Settings &gt; API Keys first to pick a model here.
              </p>
            ) : null}
          </div>

          {thinkingOptions.length > 0 && (
            <div>
              <label className="block font-label-caps text-label-caps text-text-secondary mb-2">THINKING</label>
              <select
                value={currentRef.thinking ?? ''}
                onChange={(e) => onThinkingChange(e.target.value)}
                className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              >
                <option value="">Default (model&apos;s own setting)</option>
                {thinkingOptions.map((level) => (
                  <option key={level} value={level}>
                    {THINKING_LABELS[level]}
                  </option>
                ))}
              </select>
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
                Higher thinking can improve quality but makes every request slower and uses more tokens.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
                SCENE GENERATION CONCURRENCY
              </label>
              <input
                {...register('sceneConcurrency')}
                type="number"
                className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 1–10.</p>
              {errors.sceneConcurrency && <p className="mt-1 font-body-sm text-body-sm text-error">{errors.sceneConcurrency.message}</p>}
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
                SCENE GENERATION BATCH SIZE
              </label>
              <input
                {...register('sceneBatchSize')}
                type="number"
                className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              />
              <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 1–30.</p>
              {errors.sceneBatchSize && <p className="mt-1 font-body-sm text-body-sm text-error">{errors.sceneBatchSize.message}</p>}
            </div>
          </div>
        </div>
      </Card>

      {hasCharacters && (
        <>
          <Card>
            <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Character Detection Prompt</h3>
            <textarea
              {...register('characterDetectionPrompt')}
              rows={10}
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 font-code-sm text-code-sm text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue resize-y"
            />
            {errors.characterDetectionPrompt && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.characterDetectionPrompt.message}</p>
            )}
          </Card>

          <Card>
            <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Character Generation Prompt</h3>
            <textarea
              {...register('characterGenerationPrompt')}
              rows={10}
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 font-code-sm text-code-sm text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue resize-y"
            />
            {errors.characterGenerationPrompt && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.characterGenerationPrompt.message}</p>
            )}
          </Card>
        </>
      )}

      {hasCharacters ? (
        <Card>
          <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Scene / Image Generation Prompt</h3>
          <textarea
            {...register('sceneGenerationPrompt')}
            rows={10}
            className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 font-code-sm text-code-sm text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue resize-y"
          />
          {errors.sceneGenerationPrompt && (
            <p className="mt-1 font-body-sm text-body-sm text-error">{errors.sceneGenerationPrompt.message}</p>
          )}
        </Card>
      ) : (
        <Card>
          <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">
            Scene / Image Generation Prompt (No Characters)
          </h3>
          <textarea
            {...register('sceneGenerationPromptNoCharacters')}
            rows={10}
            className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 font-code-sm text-code-sm text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue resize-y"
          />
          {errors.sceneGenerationPromptNoCharacters && (
            <p className="mt-1 font-body-sm text-body-sm text-error">{errors.sceneGenerationPromptNoCharacters.message}</p>
          )}
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
