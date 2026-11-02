import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appApi } from '@renderer/lib/appApi'
import { ChannelForm } from './ChannelForm'
import type { ChannelFormValues } from '@renderer/lib/validation/channel.schema'

// Hard-coded, same as ProjectService's DEFAULT_SCENE_CONCURRENCY/
// DEFAULT_SCENE_BATCH_SIZE — AppSettings has no global field for these
// (only General/Prompts do), so a new channel just starts from the same
// constants a project used to, before channels existed.
const DEFAULT_SCENE_CONCURRENCY = 4
const DEFAULT_SCENE_BATCH_SIZE = 10

// Phase 18 — Settings > General/Prompts now seed the default template for a
// newly created Channel (not a project directly, see GeneralSettingsPage.tsx/
// PromptsSettingsPage.tsx comments). All fields stay editable before saving.
export function NewChannelPage(): JSX.Element {
  const navigate = useNavigate()
  const [defaultValues, setDefaultValues] = useState<ChannelFormValues | null>(null)

  useEffect(() => {
    void (async () => {
      const settings = await appApi.settings.get()
      setDefaultValues({
        name: '',
        avgCharacters: settings.avgCharacters,
        variancePercent: settings.variancePercent,
        fakeDurationSec: settings.fakeSrtDurationSec,
        selectedModel: settings.selectedModel ?? '',
        characterDetectionPrompt: settings.promptSettings.characterDetection,
        characterGenerationPrompt: settings.promptSettings.characterGeneration,
        sceneGenerationPrompt: settings.promptSettings.sceneGeneration,
        sceneGenerationPromptNoCharacters: settings.promptSettings.sceneGenerationNoCharacters,
        sceneConcurrency: DEFAULT_SCENE_CONCURRENCY,
        sceneBatchSize: DEFAULT_SCENE_BATCH_SIZE,
        hasCharacters: true
      })
    })()
  }, [])

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">New Channel</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Prefilled from Settings &gt; General/Prompts — adjust anything before saving. Projects created in this
          channel copy these values once, at creation time.
        </p>
      </div>

      {defaultValues ? (
        <ChannelForm
          defaultValues={defaultValues}
          submitLabel="Create Channel"
          onCancel={() => navigate('/channels')}
          onSubmit={async (values) => {
            await appApi.channels.create({ ...values, selectedModel: values.selectedModel || null })
            navigate('/channels')
          }}
        />
      ) : (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      )}
    </div>
  )
}
