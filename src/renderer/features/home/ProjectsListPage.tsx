import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderClock, ListOrdered, Plus, Trash2 } from 'lucide-react'
import type { ProjectSummary } from '@shared/ipc-types'
import { appApi } from '@renderer/lib/appApi'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Modal } from '@renderer/components/ui/Modal'
import { DeleteProjectModal } from '@renderer/components/DeleteProjectModal'
import { ProjectRow } from '@renderer/components/ProjectRow'
import { useQueueStore } from '@renderer/stores/useQueueStore'
import { useProjectsListStore } from '@renderer/stores/useProjectsListStore'

export function ProjectsListPage(): JSX.Element {
  const navigate = useNavigate()
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const { projects, deletedIds, refresh, markDeleted } = useProjectsListStore()
  const { items: queueItems, subscribe: subscribeQueue } = useQueueStore()
  const undeletedProjects = projects?.filter((project) => !deletedIds.has(project.id)) ?? null
  // A project sitting in the Run Queue (queued or running) is tracked on the
  // Queue tab instead — Dashboard only shows projects not currently in it,
  // per user request, so the same project never shows in two places at once.
  const visibleProjects =
    undeletedProjects?.filter((project) => !queueItems.some((item) => item.projectId === project.id)) ?? null
  // Distinguishes "no projects at all" from "every project is in the queue
  // right now" — the latter shouldn't tell the user to go create one.
  const allInQueue = undeletedProjects !== null && undeletedProjects.length > 0 && visibleProjects?.length === 0

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    subscribeQueue()
  }, [subscribeQueue])

  // The queue can advance projects through the pipeline entirely in the
  // background — re-pull the list (progress bars/status badges) on every
  // add/remove/start/finish, since this page otherwise only fetches once on
  // mount. Runs once more on the initial empty→[] state too; harmless.
  useEffect(() => {
    void refresh()
  }, [queueItems, refresh])

  return (
    <div>
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Dashboard</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            Create a project and run the Vilao pipeline to generate prompts.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {visibleProjects && visibleProjects.length > 0 && (
            <Button variant="danger" onClick={() => setShowDeleteAll(true)}>
              <Trash2 size={16} />
              Delete All
            </Button>
          )}
          <Button variant="primary" onClick={() => navigate('/new')}>
            <Plus size={16} />
            Create New Project
          </Button>
        </div>
      </div>

      <h3 className="font-headline-sm text-headline-sm text-text-primary mb-6">Recent Projects</h3>

      {visibleProjects === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading projects…</p>
      ) : visibleProjects.length === 0 ? (
        allInQueue ? (
          <EmptyState
            icon={ListOrdered}
            title="Everything's in the queue"
            description="Every project is currently queued or running — check the Queue tab to see them."
            action={
              <Button variant="primary" onClick={() => navigate('/queue')}>
                <ListOrdered size={16} />
                Go to Queue
              </Button>
            }
          />
        ) : (
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
        )
      ) : (
        <div className="space-y-4">
          {visibleProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onOpen={() => navigate(`/projects/${project.id}`)}
              onResume={() => navigate(`/projects/${project.id}/processing`)}
              onDelete={() => setDeleteTarget(project)}
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

      {showDeleteAll && visibleProjects && (
        <Modal open onClose={() => setShowDeleteAll(false)} title="Delete All Projects">
          <p className="font-body-md text-body-md text-text-secondary mb-6">
            Delete all <span className="text-text-primary">{visibleProjects.length}</span>{' '}
            {visibleProjects.length === 1 ? 'project' : 'projects'} shown here? This permanently removes them and all
            their SRT blocks, characters and prompts. This cannot be undone. Projects currently in the Run Queue are
            not affected.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowDeleteAll(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                // Same fire-and-forget pattern as the single-project Delete
                // (DeleteProjectModal) — the backend still waits for an
                // in-flight run to stop before actually removing each row,
                // but the UI doesn't block on that; each project is hidden
                // optimistically right away via markDeleted().
                for (const project of visibleProjects) {
                  appApi.projects
                    .delete(project.id)
                    .catch((err) => console.error(`Delete failed for project ${project.id}:`, err))
                  markDeleted(project.id)
                }
                setShowDeleteAll(false)
              }}
            >
              Delete All
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
