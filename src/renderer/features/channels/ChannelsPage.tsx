import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Radio, Trash2 } from 'lucide-react'
import type { Channel } from '@shared/entities'
import { appApi } from '@renderer/lib/appApi'
import { Button } from '@renderer/components/ui/Button'
import { Card } from '@renderer/components/ui/Card'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Modal } from '@renderer/components/ui/Modal'
import { formatModelDisplay } from '@shared/llmProviders'

type ChannelListItem = Channel & { projectCount: number }

// Phase 18 — Channels group projects under a shared, editable settings
// template (Max Characters/Duration/Model/3 prompt templates/Scene
// Concurrency/Scene Batch Size). No Stitch mockup exists for this screen
// (same situation Overview/Characters/Image Prompts/Export were in) — built
// from the existing Card/Button/EmptyState/Modal primitives and
// ProjectsListPage.tsx's layout conventions instead.
export function ChannelsPage(): JSX.Element {
  const navigate = useNavigate()
  const [channels, setChannels] = useState<ChannelListItem[] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChannelListItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setChannels(await appApi.channels.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const canDelete = (channel: ChannelListItem): boolean => channel.projectCount === 0 && (channels?.length ?? 0) > 1

  return (
    <div>
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Channels</h2>
         
        </div>
        <Button variant="primary" onClick={() => navigate('/channels/new')}>
          <Plus size={16} />
          New Channel
        </Button>
      </div>

      {channels === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading channels…</p>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No channels yet"
          description="Create a channel to define a reusable settings template for new projects."
          action={
            <Button variant="primary" onClick={() => navigate('/channels/new')}>
              <Plus size={16} />
              New Channel
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {channels.map((channel) => (
            <Card key={channel.id} className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-body-lg text-body-lg text-text-primary truncate">{channel.name}</h4>
                  {!channel.hasCharacters && (
                    <span className="shrink-0 bg-surface-dim border border-border-subtle text-text-secondary font-label-caps text-label-caps uppercase px-2 py-0.5 rounded">
                      No Characters
                    </span>
                  )}
                </div>
                <p className="font-body-sm text-body-sm text-text-secondary mt-1">
                  {channel.projectCount} {channel.projectCount === 1 ? 'project' : 'projects'} · Avg{' '}
                  {channel.avgCharacters} chars ±{channel.variancePercent}% · {channel.fakeDurationSec}s/block ·
                  Concurrency {channel.sceneConcurrency} · Batch {channel.sceneBatchSize}
                </p>
                <p className="font-code-sm text-code-sm text-text-secondary mt-1">
                  {channel.selectedModel ? formatModelDisplay(channel.selectedModel) : 'No model selected'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="ghost" onClick={() => navigate(`/channels/${channel.id}/edit`)}>
                  <Pencil size={14} />
                  Edit
                </Button>
                <Button
                  variant="danger"
                  disabled={!canDelete(channel)}
                  title={
                    channel.projectCount > 0
                      ? 'Cannot delete a channel that still has projects.'
                      : (channels?.length ?? 0) <= 1
                        ? 'Cannot delete the last remaining channel.'
                        : undefined
                  }
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteTarget(channel)
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Delete Channel">
          <p className="font-body-md text-body-md text-text-secondary mb-6">
            Delete <span className="text-text-primary">{deleteTarget.name}</span>? This cannot be undone.
          </p>
          {deleteError && <p className="font-body-sm text-body-sm text-error mb-4">{deleteError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void (async () => {
                  try {
                    await appApi.channels.delete(deleteTarget.id)
                    setDeleteTarget(null)
                    await refresh()
                  } catch (err) {
                    setDeleteError(err instanceof Error ? err.message : 'Failed to delete channel.')
                  }
                })()
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
