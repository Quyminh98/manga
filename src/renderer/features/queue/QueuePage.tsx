import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Loader2 } from 'lucide-react'
import type { ProjectSummary } from '@shared/ipc-types'
import { ProjectStatus } from '@shared/enums'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { DeleteProjectModal } from '@renderer/components/DeleteProjectModal'
import { ProjectRow } from '@renderer/components/ProjectRow'
import { useQueueStore } from '@renderer/stores/useQueueStore'
import { useProjectsListStore } from '@renderer/stores/useProjectsListStore'

// Run queue — projects added via each Home row's "Add to Queue" action run
// strictly one at a time, in the order added; a failure moves on to the next
// project instead of stopping the queue. Rows reuse ProjectRow (same
// progress bar/status badge/Open/Resume/Delete as the Home list) — the
// queue only adds its own Queued/Running indicator on top, via ProjectRow's
// `trailing` slot.
//
// A standalone "Remove from queue" (X) button used to sit here too, right
// next to ProjectRow's own Delete (trash) action — both read as "remove
// this row" at a glance despite doing different things (dequeue-but-keep
// vs. hard-delete), which was confusing (user report). Dropped in favor of
// Delete alone — projects.ipc.ts's delete handler already dequeues before
// deleting, so Delete still fully covers "get this out of the queue".
// `queue.remove` (IPC/useQueueStore action) is left wired, just unused here
// now — same convention as every other "drop the button, keep the IPC"
// change in this app's history (see spec.md's Phase 14/15 notes).
export function QueuePage(): JSX.Element {
  const navigate = useNavigate()
  const { items, subscribe } = useQueueStore()
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null)
  // Shared with ProjectsListPage (useProjectsListStore) — a Delete
  // triggered here or on Home is reflected on both immediately.
  const { projects, deletedIds, refresh, markDeleted } = useProjectsListStore()

  useEffect(() => {
    subscribe()
  }, [subscribe])

  // Queue items only carry projectId/name/status — pull the full
  // ProjectSummary list (progress/status) whenever the queue changes so
  // rows stay in sync with the same data Home uses.
  useEffect(() => {
    void refresh()
  }, [items, refresh])

  // PipelineService.runProject() sets the project's DB status to PROCESSING
  // synchronously before the queue's "running" broadcast even goes out, so
  // it's always true the instant item.status is 'running' — force it here
  // rather than trust the separately-fetched `projects` snapshot, which
  // lags one IPC round trip behind the (already-live) queue store and would
  // otherwise flash a stale status badge (e.g. "Paused") next to "Running".
  const rows = items
    .map((item) => {
      const project = projects?.find((p) => p.id === item.projectId)
      if (!project || deletedIds.has(project.id)) return null
      const resolved = item.status === 'running' && project.status !== ProjectStatus.PROCESSING
        ? { ...project, status: ProjectStatus.PROCESSING }
        : project
      return { item, project: resolved }
    })
    .filter((row): row is { item: (typeof items)[number]; project: ProjectSummary } => row !== null)

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Queue</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Projects run one at a time, in order — a failed project doesn&apos;t block the rest.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="Queue is empty"
          description="Add a project to the queue from Home to run it automatically after whatever's currently running finishes."
        />
      ) : (
        <div className="space-y-4">
          {rows.map(({ item, project }) => (
            <ProjectRow
              key={project.id}
              project={project}
              onOpen={() => navigate(`/projects/${project.id}`)}
              onResume={() => navigate(`/projects/${project.id}/processing`)}
              onDelete={() => setDeleteTarget(project)}
              trailing={
                item.status === 'running' ? (
                  <span className="flex items-center gap-1.5 font-code-sm text-code-sm text-vilao-blue">
                    <Loader2 size={14} className="animate-spin" />
                    Running
                  </span>
                ) : (
                  <span className="font-code-sm text-code-sm text-text-secondary">Queued</span>
                )
              }
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          isRunning={deleteTarget.status === 'processing'}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            markDeleted(deleteTarget.id)
            setDeleteTarget(null)
          }}
        />
      )}
    </div>
  )
}
