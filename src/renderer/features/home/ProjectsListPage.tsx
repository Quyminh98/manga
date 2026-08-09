import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowUpRight, Download, FolderClock, FolderOpen, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { appApi } from '@renderer/lib/appApi'
import { formatErrorForDisplay } from '@renderer/lib/errorDisplay'
import type { ProjectSummary } from '@shared/ipc-types'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { renameProjectSchema, type RenameProjectFormValues } from '@renderer/lib/validation/project.schema'

// spec.md 6.2 Project.status → display label + status pill / progress bar colors.
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  ready: 'Ready',
  processing: 'Processing',
  paused: 'Paused',
  completed: 'Completed',
  completed_with_errors: 'Completed with errors',
  failed: 'Failed'
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: 'border-border-subtle text-text-secondary',
  ready: 'border-vilao-blue/30 text-vilao-blue',
  processing: 'border-vilao-blue/30 text-vilao-blue',
  paused: 'border-tertiary/30 text-tertiary',
  completed: 'border-emerald-success/30 text-emerald-success',
  completed_with_errors: 'border-tertiary/30 text-tertiary',
  failed: 'border-error/30 text-error'
}

const PROGRESS_BAR_CLASS: Record<string, string> = {
  draft: 'bg-border-subtle',
  ready: 'bg-vilao-blue',
  processing: 'bg-vilao-blue',
  paused: 'bg-tertiary',
  completed: 'bg-emerald-success',
  completed_with_errors: 'bg-tertiary',
  failed: 'bg-error'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface RowActionButtonProps {
  title: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}

function RowActionButton({ title, onClick, disabled, children }: RowActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      className="w-8 h-8 flex items-center justify-center rounded border border-border-subtle text-text-secondary hover:text-text-primary hover:border-vilao-blue transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-subtle disabled:hover:text-text-secondary"
    >
      {children}
    </button>
  )
}

interface RenameProjectModalProps {
  project: ProjectSummary
  onClose: () => void
  onRenamed: () => void
}

function RenameProjectModal({ project, onClose, onRenamed }: RenameProjectModalProps): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RenameProjectFormValues>({
    resolver: zodResolver(renameProjectSchema),
    defaultValues: { name: project.name }
  })

  const onSubmit = handleSubmit(async (values) => {
    await appApi.projects.rename(project.id, values.name)
    onRenamed()
  })

  return (
    <Modal open onClose={onClose} title="Rename Project">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block font-label-caps text-label-caps text-text-secondary mb-2">Project Name</label>
          <input
            {...register('name')}
            autoFocus
            className="w-full bg-surface-charcoal border border-border-subtle rounded px-3 py-2 font-body-md text-body-md text-text-primary focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
          />
          {errors.name && <p className="font-body-sm text-body-sm text-error mt-1">{errors.name.message}</p>}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface DeleteProjectModalProps {
  project: ProjectSummary
  onClose: () => void
  onDeleted: () => void
}

function DeleteProjectModal({ project, onClose, onDeleted }: DeleteProjectModalProps): JSX.Element {
  const [isDeleting, setIsDeleting] = useState(false)

  return (
    <Modal open onClose={onClose} title="Delete Project">
      <p className="font-body-md text-body-md text-text-secondary mb-6">
        Delete <span className="text-text-primary">{project.name}</span>? This permanently removes the project and
        all its SRT blocks, characters and prompts. This cannot be undone.
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={isDeleting}
          onClick={async () => {
            setIsDeleting(true)
            await appApi.projects.delete(project.id)
            onDeleted()
          }}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Modal>
  )
}

export function ProjectsListPage(): JSX.Element {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<{ id: string; message: string } | null>(null)

  const refresh = useCallback(async () => {
    const list = await appApi.projects.list()
    setProjects(list)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Phase 11 — Export row action: pick a destination folder in Main (same
  // dialog as the Export tab's "Export Project" button), then reveal the
  // written folder in Finder. Cancelling the folder picker is a silent no-op
  // (see ExportPage's onExport), not an error.
  const onExport = async (project: ProjectSummary): Promise<void> => {
    setExportError(null)
    setExportingId(project.id)
    try {
      const { folderPath } = await appApi.export.project(project.id)
      await appApi.export.showInFinder(folderPath)
    } catch (err) {
      // See ExportPage's onExport — ipcRenderer wraps the thrown Main-process
      // error, so this must check .includes(), not equality.
      if (!(err instanceof Error) || !err.message.includes('EXPORT_CANCELED')) {
        setExportError({ id: project.id, message: err instanceof Error ? err.message : 'Export failed.' })
      }
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div>
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Dashboard</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            Create a project and run the Vilao pipeline to generate prompts.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/new')}>
          <Plus size={16} />
          Create New Project
        </Button>
      </div>

      <h3 className="font-headline-sm text-headline-sm text-text-primary mb-6">Recent Projects</h3>

      {projects === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading projects…</p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderClock}
          title="No projects yet"
          description="Create your first project to paste a transcript and start the pipeline."
          action={
            <Button variant="primary" onClick={() => navigate('/new')}>
              <Plus size={16} />
              Create New Project
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="group bg-surface-charcoal border border-border-subtle p-4 rounded-lg hover:border-vilao-blue transition-colors cursor-pointer"
            >
              {/* Below `lg` (DESIGN.md Responsive Behavior) this row has no room for
                  6 fixed-width columns side by side (plan.md Phase 13) — the title
                  takes its own full-width line, and progress/model/badge/actions
                  wrap together onto a second line via flex-wrap. At `lg`+ both
                  groups sit on the original single row unchanged. */}
              <div className="flex flex-wrap items-center justify-between gap-3 lg:gap-6">
                <div className="min-w-0 w-full lg:w-auto lg:flex-1">
                  <h4 className="font-body-lg text-body-lg text-text-primary group-hover:text-vilao-blue transition-colors truncate">
                    {project.name}
                  </h4>
                  <p className="font-body-sm text-body-sm text-text-secondary mt-1">
                    Created {formatDate(project.createdAt)} · Updated {formatDate(project.updatedAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:gap-6">
                  <div className="w-40 lg:w-56 flex-shrink-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-code-sm text-code-sm text-text-secondary">Progress</span>
                      <span className="font-code-sm text-code-sm text-text-primary">{project.progressPercent}%</span>
                    </div>
                    <div className="h-1 w-full bg-surface-slate rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${PROGRESS_BAR_CLASS[project.status]}`}
                        style={{ width: `${project.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <span className="hidden lg:inline-block font-code-sm text-code-sm text-text-secondary flex-shrink-0 w-32 truncate">
                    {project.selectedModel ?? 'No model'}
                  </span>

                  <span
                    className={`px-3 py-1 bg-surface-slate border font-label-caps text-label-caps rounded flex-shrink-0 ${STATUS_BADGE_CLASS[project.status]}`}
                  >
                    {STATUS_LABEL[project.status]}
                  </span>

                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(event) => event.stopPropagation()}>
                    <RowActionButton title="Open" onClick={() => navigate(`/projects/${project.id}`)}>
                      <ArrowUpRight size={15} />
                    </RowActionButton>
                    <RowActionButton
                      title="Resume"
                      disabled={!['paused', 'failed', 'completed_with_errors'].includes(project.status)}
                      onClick={() => navigate(`/projects/${project.id}/processing`)}
                    >
                      <Play size={15} />
                    </RowActionButton>
                    <RowActionButton title="Rename" onClick={() => setRenameTarget(project)}>
                      <Pencil size={15} />
                    </RowActionButton>
                    <RowActionButton title="Delete" onClick={() => setDeleteTarget(project)}>
                      <Trash2 size={15} />
                    </RowActionButton>
                    <RowActionButton title="Show in Finder" onClick={() => appApi.projects.showInFinder(project.id)}>
                      <FolderOpen size={15} />
                    </RowActionButton>
                    <RowActionButton
                      title="Export"
                      disabled={project.srtCount === 0 || exportingId === project.id}
                      onClick={() => void onExport(project)}
                    >
                      <Download size={15} />
                    </RowActionButton>
                  </div>
                </div>
              </div>
              {exportError?.id === project.id && (
                <p
                  className="mt-2 font-body-sm text-body-sm text-error"
                  onClick={(event) => event.stopPropagation()}
                >
                  {formatErrorForDisplay(exportError.message)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {renameTarget && (
        <RenameProjectModal
          project={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={() => {
            setRenameTarget(null)
            refresh()
          }}
        />
      )}

      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
