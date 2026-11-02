import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { appApi } from '@renderer/lib/appApi'

interface DeleteProjectModalProps {
  project: { id: string; name: string }
  // Adjusts the warning copy — deleting a currently-running project stops
  // that run first (PipelineService.stopAndWait(), projects.ipc.ts) before
  // the row is actually removed on the backend. The UI itself doesn't wait
  // on that: it closes immediately (see onClick below) and the caller is
  // expected to optimistically drop the project from whatever list it's
  // showing, rather than re-fetching (a re-fetch would still show it until
  // the in-flight run actually settles).
  isRunning?: boolean
  onClose: () => void
  onDeleted: () => void
}

// Shared by ProjectsListPage (Home row action), TopBar and ProcessingPage
// (the "Delete" action shown in place of Pause/Cancel while a project is
// running) — one confirmation flow/copy for all three.
export function DeleteProjectModal({ project, isRunning, onClose, onDeleted }: DeleteProjectModalProps): JSX.Element {
  return (
    <Modal open onClose={onClose} title="Delete Project">
      <p className="font-body-md text-body-md text-text-secondary mb-6">
        Delete <span className="text-text-primary">{project.name}</span>? This permanently removes the project and
        all its SRT blocks, characters and prompts. This cannot be undone.
        {isRunning && ' It is currently running — deleting it stops the run in the background, including whatever step was still in progress.'}
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            // Fire-and-forget: the backend still waits for an in-flight run
            // to stop before it actually deletes the row (projects.ipc.ts),
            // but the user shouldn't have to stare at a spinner for that —
            // confirming Delete here is immediate from their point of view.
            appApi.projects.delete(project.id).catch((err) => console.error(`Delete failed for project ${project.id}:`, err))
            onDeleted()
          }}
        >
          Delete
        </Button>
      </div>
    </Modal>
  )
}
