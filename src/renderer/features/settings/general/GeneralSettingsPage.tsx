import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { appApi } from '@renderer/lib/appApi'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { generalSettingsSchema, type GeneralSettingsFormValues } from '@renderer/lib/validation/settings.schema'

// spec.md 10.1/10.2 — applies to new projects only; existing projects keep
// their own projects.max_characters/fake_duration_sec (schema.md), set once
// at creation time (see ProjectService.create's `defaults` param).
export function GeneralSettingsPage(): JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<GeneralSettingsFormValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: { maxCharacters: 300, fakeSrtDurationSec: 3 }
  })

  useEffect(() => {
    void (async () => {
      const settings = await appApi.settings.get()
      reset({ maxCharacters: settings.maxCharacters, fakeSrtDurationSec: settings.fakeSrtDurationSec })
      setLoaded(true)
    })()
  }, [reset])

  const onSubmit = handleSubmit(async (values) => {
    setSaveMessage(null)
    await appApi.settings.save({
      maxCharacters: values.maxCharacters,
      fakeSrtDurationSec: values.fakeSrtDurationSec
    })
    setSaveMessage('Saved — applies to new projects. Existing projects keep their own settings.')
  })

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Subtitle Generation</h3>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">
              MAXIMUM CHARACTERS PER SRT
            </label>
            <input
              {...register('maxCharacters')}
              disabled={!loaded}
              type="number"
              className="w-full bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-body-md text-body-md focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">Range 100–2000. Default is 300.</p>
            {errors.maxCharacters && (
              <p className="mt-1 font-body-sm text-body-sm text-error">{errors.maxCharacters.message}</p>
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
