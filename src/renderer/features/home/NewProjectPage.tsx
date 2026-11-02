import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ListPlus } from 'lucide-react'
import type { Channel } from '@shared/entities'
import { appApi } from '@renderer/lib/appApi'
import { Button } from '@renderer/components/ui/Button'
import { Card } from '@renderer/components/ui/Card'
import { newProjectSchema, type NewProjectFormValues } from '@renderer/lib/validation/project.schema'
import { useQueueStore } from '@renderer/stores/useQueueStore'

// spec.md 6.1: New Project — nhập Project Name + Transcript. Phase 18 adds a
// required Channel picker — the project copies that channel's current
// settings (Max Characters/Duration/Model/3 prompts/Scene Concurrency/Batch
// Size) once, right now, and never changes channel afterward.
export function NewProjectPage(): JSX.Element {
  const navigate = useNavigate()
  const addToQueue = useQueueStore((state) => state.add)
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<NewProjectFormValues>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: { name: '', transcript: '', channelId: '' }
  })

  useEffect(() => {
    void (async () => {
      const list = await appApi.channels.list()
      setChannels(list)
      // Preselect the first channel (always at least one — every install
      // gets a "Default" channel via migration, and the last channel can
      // never be deleted) so the form is submittable without an extra click.
      if (list.length > 0) reset({ name: '', transcript: '', channelId: list[0].id })
    })()
  }, [reset])

  // QueueService.add() already does exactly "run now if the queue is idle,
  // otherwise queue behind whatever's running" (QueueService.ts's drain()) —
  // no separate "is anything running?" branch needed here.
  const onSubmit = handleSubmit(async (values) => {
    const project = await appApi.projects.create(values)
    await addToQueue(project.id)
    navigate('/queue')
  })

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">New Project</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Name your project and paste the plain-text transcript to start with.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">Project Name</label>
            <input
              {...register('name')}
              autoFocus
              className="w-full bg-surface-charcoal border border-border-subtle rounded px-3 py-2 font-body-md text-body-md text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
              placeholder="e.g. Qin Hong — Chapter 1"
            />
            {errors.name && <p className="font-body-sm text-body-sm text-error mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">Channel</label>
            <select
              {...register('channelId')}
              disabled={!channels || channels.length === 0}
              className="w-full bg-surface-charcoal border border-border-subtle rounded px-3 py-2 font-body-md text-body-md text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {!channels || channels.length === 0 ? (
                <option value="">Loading channels…</option>
              ) : (
                channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))
              )}
            </select>
            <p className="mt-1 font-body-sm text-body-sm text-text-secondary">
              Determines Max Characters/Duration/Model/Prompts/Pipeline settings for this project — copied in now,
              fixed afterward.
            </p>
            {errors.channelId && <p className="font-body-sm text-body-sm text-error mt-1">{errors.channelId.message}</p>}
          </div>
          <div>
            <label className="block font-label-caps text-label-caps text-text-secondary mb-2">Transcript</label>
            <textarea
              {...register('transcript')}
              rows={12}
              className="w-full bg-surface-charcoal border border-border-subtle rounded px-3 py-2 font-body-md text-body-md text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue resize-none"
              placeholder="Paste plain transcript text — no timestamps required."
            />
            {errors.transcript && (
              <p className="font-body-sm text-body-sm text-error mt-1">{errors.transcript.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              <ListPlus size={14} />
              {isSubmitting ? 'Creating…' : 'Add to Queue'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
