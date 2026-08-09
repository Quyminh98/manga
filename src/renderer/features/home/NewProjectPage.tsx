import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { appApi } from '@renderer/lib/appApi'
import { Button } from '@renderer/components/ui/Button'
import { Card } from '@renderer/components/ui/Card'
import { newProjectSchema, type NewProjectFormValues } from '@renderer/lib/validation/project.schema'

// spec.md 6.1: New Project — nhập Project Name + Transcript.
export function NewProjectPage(): JSX.Element {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<NewProjectFormValues>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: { name: '', transcript: '' }
  })

  const onSubmit = handleSubmit(async (values) => {
    const project = await appApi.projects.create(values)
    navigate(`/projects/${project.id}`)
  })

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">New Project</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Name your project and paste the plain-text transcript to start with.
        </p>
      </div>

      <Card className="max-w-2xl">
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
              {isSubmitting ? 'Creating…' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
