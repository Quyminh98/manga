import { useCallback, useEffect, useMemo, useState } from 'react'
import { Captions, CheckCircle2, FolderOpen, FolderOutput, Image as ImageIcon, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { Card } from '@renderer/components/ui/Card'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import {
  formatCharacterListFile,
  formatCharacterPromptsFile,
  formatImagePromptsFile,
  formatSrtFile,
  sanitizeFolderName
} from '@shared/exportFormat'
import { ProjectStatus } from '@shared/enums'
import type { Character, CharacterPrompt, ScenePrompt, SrtBlock } from '@shared/entities'

const PREVIEW_ENTRY_LIMIT = 3

interface PreviewFileProps {
  icon: LucideIcon
  filename: string
  content: string
  shownEntries: number
  totalEntries: number
}

function PreviewFile({ icon: Icon, filename, content, shownEntries, totalEntries }: PreviewFileProps): JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-text-secondary" />
          <span className="font-code-sm text-code-sm bg-surface-container-high border border-border-subtle rounded px-2 py-0.5 text-text-primary">
            {filename}
          </span>
        </div>
        <span className="font-body-sm text-body-sm text-text-secondary">
          {totalEntries === 0 ? 'Nothing to export yet' : `${totalEntries} ${totalEntries === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>
      {totalEntries === 0 ? (
        <p className="font-body-sm text-body-sm text-text-secondary italic bg-[#020617] border border-border-subtle rounded p-3">
          No content generated for this file yet.
        </p>
      ) : (
        <pre className="font-code-sm text-code-sm text-text-primary bg-[#020617] border border-border-subtle rounded p-3 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {content}
          {shownEntries < totalEntries && `\n… +${totalEntries - shownEntries} more`}
        </pre>
      )}
    </div>
  )
}

// spec.md 8.7/21-24 — no Stitch screen exists for Export (plan.md Phase 11 —
// "chưa có trong Stitch", generate_screen_from_text timed out twice, same as
// Characters/Image Prompts in Phase 6/8). Built with Tailwind against
// DESIGN.md tokens, reusing the monospace preview-block pattern already used
// for a generated prompt in ImagePromptsPage. Preview content is produced by
// the exact same shared/exportFormat.ts functions ExportService uses to
// write the real files, so what's shown here can never drift from the export.
export function ExportPage(): JSX.Element {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const [srtBlocks, setSrtBlocks] = useState<SrtBlock[] | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [characterPrompts, setCharacterPrompts] = useState<CharacterPrompt[]>([])
  const [scenePrompts, setScenePrompts] = useState<ScenePrompt[]>([])
  const [exportFolderPath, setExportFolderPath] = useState<string | null>(null)
  const [channelName, setChannelName] = useState<string | null>(null)

  const refresh = useCallback(async (id: string, channelId: string) => {
    const [blocks, characterList, promptList, sceneList, folderPath, channel] = await Promise.all([
      appApi.srt.list(id),
      appApi.characters.list(id),
      appApi.characters.listPrompts(id),
      appApi.scenePrompts.list(id),
      appApi.export.getFolderPath(id),
      appApi.channels.get(channelId)
    ])
    setSrtBlocks(blocks)
    setCharacters(characterList)
    setCharacterPrompts(promptList)
    setScenePrompts(sceneList)
    setExportFolderPath(folderPath)
    setChannelName(channel?.name ?? null)
  }, [])

  useEffect(() => {
    setSrtBlocks(null)
    setExportFolderPath(null)
    setChannelName(null)
    if (projectId && currentProject) void refresh(projectId, currentProject.channelId)
  }, [projectId, currentProject, refresh])

  const charactersWithPrompts = useMemo(
    () => characters.filter((c) => !!characterPrompts.find((p) => p.characterId === c.characterId)?.prompt),
    [characters, characterPrompts]
  )
  const scenePromptsWithContent = useMemo(
    () => scenePrompts.filter((sp) => !!sp.prompt).sort((a, b) => a.blockIndex - b.blockIndex),
    [scenePrompts]
  )

  const srtPreview = useMemo(() => formatSrtFile((srtBlocks ?? []).slice(0, PREVIEW_ENTRY_LIMIT)), [srtBlocks])
  const characterPromptsPreview = useMemo(
    () => formatCharacterPromptsFile(charactersWithPrompts.slice(0, PREVIEW_ENTRY_LIMIT), characterPrompts),
    [charactersWithPrompts, characterPrompts]
  )
  const imagePromptsPreview = useMemo(
    () => formatImagePromptsFile(scenePromptsWithContent.slice(0, PREVIEW_ENTRY_LIMIT)),
    [scenePromptsWithContent]
  )
  // Phase 24 — character_list.txt uses every detected character (not just
  // those with a successful prompt), matching ExportService.export(), which
  // also only writes this file at all when characters.length > 0.
  const characterListPreview = useMemo(
    () => formatCharacterListFile(characters.slice(0, PREVIEW_ENTRY_LIMIT)),
    [characters]
  )

  if (!currentProject || !projectId) {
    return <div />
  }

  const channelFolderName = sanitizeFolderName(channelName ?? '', 'Untitled_Channel')
  const folderName = sanitizeFolderName(currentProject.name, 'Untitled_Project')
  const isExported =
    !!exportFolderPath &&
    (currentProject.status === ProjectStatus.COMPLETED || currentProject.status === ProjectStatus.COMPLETED_WITH_ERRORS)

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text-primary mb-2">Export</h2>
        <p className="font-body-md text-body-md text-text-secondary">
          Preview of the .srt + character_prompts.txt + image_prompts.txt bundle (plus character_list.txt for
          projects with characters). Written automatically to your Default Export Folder (Settings &gt; General)
          when Run All completes.
        </p>
      </div>

      {isExported && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-emerald-success/10 border border-emerald-success/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={16} className="text-emerald-success flex-shrink-0" />
            <p className="font-body-sm text-body-sm text-text-primary truncate">
              Exported to <span className="font-code-sm text-code-sm">{exportFolderPath}</span>
            </p>
          </div>
          <Button variant="ghost" type="button" onClick={() => void appApi.export.showInFinder(exportFolderPath)}>
            <FolderOpen size={14} />
            Show in Finder
          </Button>
        </div>
      )}

      {srtBlocks === null ? (
        <p className="font-body-md text-body-md text-text-secondary">Loading…</p>
      ) : srtBlocks.length === 0 ? (
        <EmptyState
          icon={FolderOutput}
          title="Nothing to export yet"
          description="Split the transcript into SRT blocks and run the pipeline to generate exportable content."
        />
      ) : (
        <>
          <Card className="mb-6">
            <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">Output Folder</h3>
            <div className="font-code-sm text-code-sm text-text-secondary space-y-1.5">
              <p className="text-text-primary">{channelFolderName}/</p>
              <p className="pl-4 text-text-primary">{folderName}/</p>
              <p className="pl-8 flex items-center gap-2">
                <Captions size={13} />
                {folderName}.srt
              </p>
              <p className="pl-8 flex items-center gap-2">
                <Users size={13} />
                character_prompts.txt
              </p>
              <p className="pl-8 flex items-center gap-2">
                <ImageIcon size={13} />
                image_prompts.txt
              </p>
              {characters.length > 0 && (
                <p className="pl-8 flex items-center gap-2">
                  <Users size={13} />
                  character_list.txt
                </p>
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <PreviewFile
                icon={Captions}
                filename={`${folderName}.srt`}
                content={srtPreview}
                shownEntries={Math.min(PREVIEW_ENTRY_LIMIT, srtBlocks.length)}
                totalEntries={srtBlocks.length}
              />
            </Card>
            <Card>
              <PreviewFile
                icon={Users}
                filename="character_prompts.txt"
                content={characterPromptsPreview}
                shownEntries={Math.min(PREVIEW_ENTRY_LIMIT, charactersWithPrompts.length)}
                totalEntries={charactersWithPrompts.length}
              />
            </Card>
            <Card>
              <PreviewFile
                icon={ImageIcon}
                filename="image_prompts.txt"
                content={imagePromptsPreview}
                shownEntries={Math.min(PREVIEW_ENTRY_LIMIT, scenePromptsWithContent.length)}
                totalEntries={scenePromptsWithContent.length}
              />
            </Card>
            {characters.length > 0 && (
              <Card>
                <PreviewFile
                  icon={Users}
                  filename="character_list.txt"
                  content={characterListPreview}
                  shownEntries={Math.min(PREVIEW_ENTRY_LIMIT, characters.length)}
                  totalEntries={characters.length}
                />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
