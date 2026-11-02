import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FolderOpen } from 'lucide-react'
import { appApi } from '@renderer/lib/appApi'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { generalSettingsSchema, type GeneralSettingsFormValues } from '@renderer/lib/validation/settings.schema'

// spec.md 10.1/10.2 — applies to new *channels* only (Phase 18: a project no
// longer copies these directly; it copies its chosen channel's values, and a
// channel's own values are what this page seeds NewChannelPage.tsx with).
// Existing channels/projects keep whatever they already copied, set once at
// creation time (see ChannelService.create / ProjectService.create's
// `defaults` param).
export function GeneralSettingsPage(): JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [exportFolder, setExportFolder] = useState<string | null>(null)
  const [isChoosingFolder, setIsChoosingFolder] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<GeneralSettingsFormValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: { avgCharacters: 300, variancePercent: 30, fakeSrtDurationSec: 3 }
  })

  useEffect(() => {
    void (async () => {
      const settings = await appApi.settings.get()
      reset({
        avgCharacters: settings.avgCharacters,
        variancePercent: settings.variancePercent,
        fakeSrtDurationSec: settings.fakeSrtDurationSec
      })
      setExportFolder(settings.lastExportFolder)
      setLoaded(true)
    })()
  }, [reset])

  const onSubmit = handleSubmit(async (values) => {
    setSaveMessage(null)
    await appApi.settings.save({
      avgCharacters: values.avgCharacters,
      variancePercent: values.variancePercent,
      fakeSrtDurationSec: values.fakeSrtDurationSec
    })
    setSaveMessage('Saved — applies to new channels. Existing channels/projects keep their own settings.')
  })

  const onBrowseExportFolder = async (): Promise<void> => {
    setIsChoosingFolder(true)
    try {
      const folder = await appApi.settings.chooseExportFolder()
      if (folder) setExportFolder(folder)
    } finally {
      setIsChoosingFolder(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Export</h3>
        <div>
          <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
            DEFAULT EXPORT FOLDER
          </label>
          <div className="flex items-center gap-3">
            <p className="flex-1 min-w-0 truncate bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 font-code-sm text-code-sm text-text-primary">
              {exportFolder ?? 'Not set — chosen on your first export'}
            </p>
            <Button variant="ghost" type="button" onClick={() => void onBrowseExportFolder()} disabled={isChoosingFolder}>
              <FolderOpen size={14} />
              {isChoosingFolder ? 'Choosing…' : 'Browse…'}
            </Button>
          </div>
          <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
            Export writes straight here as{' '}
            <span className="font-code-sm text-code-sm">Channel_Name/Project_Name/</span> — no folder prompt each
            time.
          </p>
        </div>
      </Card>
      <Card>
        <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Subtitle Generation</h3>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
              AVERAGE CHARACTERS PER SRT
            </label>
            <input
              {...register('avgCharacters')}
              disabled={!loaded}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 30–2000. Default is 300.</p>
            {errors.avgCharacters && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.avgCharacters.message}</p>
            )}
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
              VARIANCE (±%)
            </label>
            <input
              {...register('variancePercent')}
              disabled={!loaded}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
              Range 0–90. Default is 30. SRT blocks may range from Average − Variance% to Average + Variance% instead
              of a hard ceiling — avoids sentences getting cut into too-short blocks.
            </p>
            {errors.variancePercent && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.variancePercent.message}</p>
            )}
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
              DURATION PER SRT BLOCK (SECONDS)
            </label>
            <input
              {...register('fakeSrtDurationSec')}
              disabled={!loaded}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
              Range 1–30. Used for the fake SRT timeline (no real timing data). Default is 3.
            </p>
            {errors.fakeSrtDurationSec && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.fakeSrtDurationSec.message}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            {saveMessage && <p className="font-body-sm text-body-sm text-emerald-success">{saveMessage}</p>}
            <Button type="submit" variant="primary" disabled={!loaded || isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
