// Pure formatting for the 3 exported files (spec.md 21-24). Lives in shared/
// (not src/main/services/ExportService.ts alone) so the Export tab preview
// (Renderer, spec.md 8.7 "Hiển thị preview file sẽ export") renders the exact
// same bytes ExportService writes to disk — same reasoning as prompts.ts:
// duplicating this logic in the Renderer would risk preview/export drift.

import type { Character, CharacterPrompt, ScenePrompt, SrtBlock } from './entities'

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// spec.md 22 — "00:00:00,000" (HH:MM:SS,mmm), same shape SrtPage already
// renders per-block, reimplemented here since that formatter lives in a
// Renderer-only file.
export function formatSrtTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${String(millis).padStart(3, '0')}`
}

// spec.md 22 — numbered blocks, "start --> end" arrow line, text, blank line
// between entries.
export function formatSrtFile(blocks: SrtBlock[]): string {
  const entries = blocks.map(
    (block) => `${block.blockIndex}\n${formatSrtTimestamp(block.startMs)} --> ${formatSrtTimestamp(block.endMs)}\n${block.text}`
  )
  return entries.length > 0 ? `${entries.join('\n\n')}\n` : ''
}

// spec.md 23 — "@CharacterId: <prompt>" all on one line/paragraph, single
// blank line between entries. Only characters with a successful (non-empty)
// prompt are included — a character whose prompt hasn't been
// generated/failed has nothing to export. List order follows `characters`
// list order (created_at ASC — detection order), not character_prompts
// order. normalizePromptText() guards against any pre-existing multi-line
// prompt content in the DB (character prompts were never guaranteed
// single-line before this format changed) the same way
// generateScenePrompt.ts's own normalizePromptText() already does for scene
// prompts.
export function formatCharacterPromptsFile(characters: Character[], prompts: CharacterPrompt[]): string {
  const promptByCharacterId = new Map(prompts.map((p) => [p.characterId, p]))
  const entries: string[] = []
  characters.forEach((character) => {
    const prompt = promptByCharacterId.get(character.characterId)?.prompt
    if (!prompt) return
    entries.push(`${character.characterId}: ${normalizePromptText(prompt)}`)
  })
  return entries.length > 0 ? `${entries.join('\n\n')}\n` : ''
}

// Collapses any line breaks to a single space (same rule generateScenePrompt.ts's
// normalizePromptText() enforces at generation time) so exported prompt text is
// always one line/paragraph, regardless of how it was stored.
function normalizePromptText(text: string): string {
  return text.replace(/\r?\n+/g, ' ').replace(/ {2,}/g, ' ').trim()
}

// spec.md 24 — "PROMPT 00N: " header inline with the prompt (same
// line/paragraph), single blank line between entries, numbered by
// `blockIndex` so PROMPT 00N always maps 1:1 to SRT 00N (a block whose scene
// prompt failed/is pending is simply skipped, not renumbered — the *next*
// successful block keeps its own blockIndex).
export function formatImagePromptsFile(scenePrompts: ScenePrompt[]): string {
  const entries = scenePrompts
    .filter((sp) => !!sp.prompt)
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .map((sp) => `PROMPT ${pad3(sp.blockIndex)}: ${sp.prompt}`)
  return entries.length > 0 ? `${entries.join('\n\n')}\n` : ''
}

// spec.md 21 (Phase 24 addendum) — one Character ID per line, "@" prefix
// stripped, no blank lines between entries. Lists every detected character
// (Character Database order, created_at ASC) regardless of whether its
// Character Prompt succeeded — unlike formatCharacterPromptsFile, this is a
// plain name index, not a usable-output file, so an unprompted character
// still belongs on it. ExportService only writes this file at all when the
// project has at least one character (see its own comment) — this function
// itself just returns '' for an empty list, same convention as the others.
export function formatCharacterListFile(characters: Character[]): string {
  const entries = characters.map((character) => character.characterId.replace(/^@/, ''))
  return entries.length > 0 ? `${entries.join('\n')}\n` : ''
}

// spec.md 21 — output folder "Channel_Name/Project_Name/" (Phase 20, channel
// subfolder added) — strip characters that are invalid in a macOS/Windows
// path component; keep spaces/unicode as-is since the actual display name is
// the intended folder/file base name. Shared by both the channel and project
// path segments, and by the .srt file's base name.
export function sanitizeFolderName(name: string, fallback: string): string {
  const cleaned = name.trim().replace(/[/\\:*?"<>|]+/g, '_')
  return cleaned.length > 0 ? cleaned : fallback
}
