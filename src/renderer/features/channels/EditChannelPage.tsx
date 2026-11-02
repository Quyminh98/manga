import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { appApi } from '@renderer/lib/appApi'
import { ChannelForm } from './ChannelForm'
import type { ChannelFormValues } from '@renderer/lib/validation/channel.schema'

// Phase 18 — editing a channel never retroactively changes a project that
// already copied its settings (copy-once, see ChannelService/ProjectService).
export function EditChannelPage(): JSX.Element {
  const navigate = useNavigate()
  const { channelId } = useParams<{ channelId: string }>()
  const [defaultValues, setDefaultValues] = useState<ChannelFormValues | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!channelId) return
    void (async () => {
      const channel = await appApi.channels.get(channelId)
      if (!channel) {
        setNotFound(true)
        return
      }
      setDefaultValues({
        name: channel.name,
        avgCharacters: channel.avgCharacters,
        variancePercent: channel.variancePercent,
        fakeDurationSec: channel.fakeDurationSec,
        selectedModel: channel.selectedModel ?? '',
        characterDetectionPrompt: channel.characterDetectionPrompt,
        characterGenerationPrompt: channel.characterGenerationPrompt,
        sceneGenerationPrompt: channel.sceneGenerationPrompt,
        sceneGenerationPromptNoCharacters: channel.sceneGenerationPromptNoCharacters,
        sceneConcurrency: channel.sceneConcurrency,
        sceneBatchSize: channel.sceneBatchSize,
        hasCharacters: channel.hasCharacters
      })
    })()
  }, [channelId])

  if (notFound) {
    return <p className="font-body-md text-body-md text-error">Channel not found.</p>
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Edit Channel</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Changes here only apply to projects created in this channel from now on — existing projects keep whatever
          they already copied.
        </p>
      </div>

      {defaultValues && channelId ? (
        <ChannelForm
          defaultValues={defaultValues}
          submitLabel="Save Changes"
          onCancel={() => navigate('/channels')}
          onSubmit={async (values) => {
            await appApi.channels.update(channelId, { ...values, selectedModel: values.selectedModel || null })
            navigate('/channels')
          }}
        />
      ) : (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      )}
    </div>
  )
}
