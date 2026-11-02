import type { ReactNode } from 'react'
import { ArrowUpRight, FolderOpen, Play, Trash2 } from 'lucide-react'
import type { ProjectSummary } from '@shared/ipc-types'
import { appApi } from '@renderer/lib/appApi'

// spec.md 6.2 Project.status → display label + status pill / progress bar colors.
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  ready: 'Ready',
  processing: 'Processing',
  paused: 'Paused',
  completed: 'Completed',
  completed_with_errors: 'Completed with errors',
  failed: 'Failed'
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: 'border-border-subtle text-text-secondary',
  ready: 'border-vilao-blue/30 text-vilao-blue',
  processing: 'border-vilao-blue/30 text-vilao-blue',
  paused: 'border-tertiary/30 text-tertiary',
  completed: 'border-emerald-success/30 text-emerald-success',
  completed_with_errors: 'border-tertiary/30 text-tertiary',
  failed: 'border-error/30 text-error'
}

export const PROGRESS_BAR_CLASS: Record<string, string> = {
  draft: 'bg-border-subtle',
  ready: 'bg-vilao-blue',
  processing: 'bg-vilao-blue',
  paused: 'bg-tertiary',
  completed: 'bg-emerald-success',
  completed_with_errors: 'bg-tertiary',
  failed: 'bg-error'
}

export function formatProjectDate(iso: string | null): string {
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

export function RowActionButton({ title, onClick, disabled, children }: RowActionButtonProps): JSX.Element {
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

interface ProjectRowProps {
  project: ProjectSummary
  onOpen: () => void
  onResume: () => void
  onDelete: () => void
  // Extra content rendered between the status badge and the Open/Resume/
  // Delete actions — e.g. QueuePage's Queued/Running indicator + "remove
  // from queue" button. Wrapped in its own stopPropagation guard so callers
  // don't need to think about row-click bubbling.
  trailing?: ReactNode
}

// Same "getFolderPath then reveal" flow the Export tab's "Show in Finder"
// button already uses (ExportPage.tsx) — folderPath is only non-null once a
// Default Export Folder is configured (spec.md 21, auto-adopted on first
// Run) and the pipeline has actually written the bundle there. Silently
// no-ops if somehow still null despite the enabled check below (e.g. a
// completed project from before a Default Export Folder existed).
async function openProjectFolder(projectId: string): Promise<void> {
  const folderPath = await appApi.export.getFolderPath(projectId)
  if (folderPath) await appApi.export.showInFinder(folderPath)
}

// Shared by ProjectsListPage (Home) and QueuePage — one row layout/status
// styling for "a project, as a list item" everywhere it appears.
export function ProjectRow({ project, onOpen, onResume, onDelete, trailing }: ProjectRowProps): JSX.Element {
  return (
    <div
      onClick={onOpen}
      className="group bg-surface-charcoal border border-border-subtle p-4 rounded-lg hover:border-vilao-blue transition-colors cursor-pointer"
    >
      {/* Below `lg` (DESIGN.md Responsive Behavior) this row has no room for
          fixed-width columns side by side (plan.md Phase 13) — the title
          takes its own full-width line, and progress/model/badge/actions
          wrap together onto a second line via flex-wrap. At `lg`+ both
          groups sit on the original single row unchanged. */}
      <div className="flex flex-wrap items-center justify-between gap-3 lg:gap-6">
        <div className="min-w-0 w-full lg:w-auto lg:flex-1">
          <h4 className="font-body-lg text-body-lg text-text-primary group-hover:text-vilao-blue transition-colors truncate">
            {project.name}
          </h4>
          <p className="font-body-sm text-body-sm text-text-secondary mt-1">
            {project.channelName} · Created {formatProjectDate(project.createdAt)} · Updated{' '}
            {formatProjectDate(project.updatedAt)}
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

          <span
            className={`px-3 py-1 bg-surface-slate border font-label-caps text-label-caps rounded flex-shrink-0 ${STATUS_BADGE_CLASS[project.status]}`}
          >
            {STATUS_LABEL[project.status]}
          </span>

          {trailing && (
            <div className="flex items-center gap-2 flex-shrink-0" onClick={(event) => event.stopPropagation()}>
              {trailing}
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0" onClick={(event) => event.stopPropagation()}>
            <RowActionButton title="Open" onClick={onOpen}>
              <ArrowUpRight size={15} />
            </RowActionButton>
            <RowActionButton
              title="Retry Failed"
              disabled={!['failed', 'completed_with_errors'].includes(project.status)}
              onClick={onResume}
            >
              <Play size={15} />
            </RowActionButton>
            <RowActionButton
              title="Open in Folder"
              disabled={!['completed', 'completed_with_errors'].includes(project.status)}
              onClick={() => void openProjectFolder(project.id)}
            >
              <FolderOpen size={15} />
            </RowActionButton>
            <RowActionButton title="Delete" onClick={onDelete}>
              <Trash2 size={15} />
            </RowActionButton>
          </div>
        </div>
      </div>
    </div>
  )
}
