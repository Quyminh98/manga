import { FolderX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Button } from '@renderer/components/ui/Button'

// errorElement for the /projects/:projectId route tree — hit when the
// loader can't find the project (deleted elsewhere, bad/stale link, etc.).
export function ProjectNotFound(): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center px-gutter">
      <EmptyState
        icon={FolderX}
        title="Project not found"
        description="This project may have been deleted or the link is out of date."
        action={
          <Link to="/">
            <Button variant="primary">Back to Projects</Button>
          </Link>
        }
      />
    </div>
  )
}
