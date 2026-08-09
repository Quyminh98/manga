import type { Character, CharacterPrompt, ModelInfo, PipelineTask, Project, ScenePrompt, SrtBlock } from './entities'
import type { VilaoConnectionStatus } from './enums'

// Typed surface for window.appApi (contextBridge). Renderer never touches the
// Vilao API key or calls Vilao directly — everything here is IPC to Main.
// Phase 1: all methods are stubs (see src/main/ipc/*.ipc.ts) and either
// no-op or reject with NOT_IMPLEMENTED; wired to real logic from Phase 2 on.

export interface AppSettings {
  maxCharacters: number
  fakeSrtDurationSec: number
  selectedModel: string | null
  promptSettings: {
    characterDetection: string
    characterGeneration: string
    sceneGeneration: string
  }
  uiPreferences: Record<string, unknown>
  lastExportFolder: string | null
}

export interface ProjectSummary extends Project {
  srtCount: number
  characterCount: number
  characterPromptDone: number
  scenePromptDone: number
  failedTaskCount: number
  progressPercent: number
}

// Emitted by scenePrompts.generate() after each batch (spec.md 17 — batches
// of SCENE_PROMPT_BATCH_SIZE, default 10) finishes, success or failed, so the
// Image Prompts tab can show live "batch X / Y" progress and incrementally
// merge results instead of waiting for the whole generate() call to resolve.
// Batches run concurrently (up to project.sceneConcurrency, spec.md 33), so
// they can finish out of order — `batchesCompleted` is a monotonically
// increasing count of finished batches (not "which batch index just
// finished"), safe to render directly as a progress fraction.
export interface ScenePromptGenerationProgress {
  batchesCompleted: number
  totalBatches: number
  completedBlocks: number
  totalBlocks: number
  batchResults: ScenePrompt[]
}

export interface AppApi {
  projects: {
    create(input: { name: string; transcript: string }): Promise<Project>
    open(id: string): Promise<Project | null>
    list(): Promise<ProjectSummary[]>
    rename(id: string, name: string): Promise<void>
    delete(id: string): Promise<void>
    showInFinder(id: string): Promise<void>
    updateTranscript(id: string, transcript: string): Promise<void>
    // Opens a native "open file" dialog filtered to .txt and returns its
    // contents, or null if the user cancels. Main process reads the file —
    // Renderer never gets filesystem access (spec.md 4.1).
    loadTranscriptFile(): Promise<string | null>
    // Phase 9 — Settings > Advanced > Pipeline Tuning writes directly to the
    // currently open project (maxRetry/sceneConcurrency are per-project
    // schema.md fields, not AppSettings; see plan.md Phase 4/9 notes).
    updatePipelineSettings(id: string, settings: { maxRetry: number; sceneConcurrency: number }): Promise<Project>
  }
  srt: {
    list(projectId: string): Promise<SrtBlock[]>
    split(projectId: string): Promise<SrtBlock[]>
  }
  characters: {
    list(projectId: string): Promise<Character[]>
    listPrompts(projectId: string): Promise<CharacterPrompt[]>
    // Not in spec.md 4.2's original interface — added in Phase 6 as the
    // manual trigger for DETECT_CHARACTERS, same pattern as srt.split()
    // standing in for Run All (arrives in Phase 9). Runs the LLM call(s),
    // persists `characters`, and returns the resulting list. Always replaces
    // character_prompts wholesale too (Phase 12 fix — no more orphaned rows
    // from a renamed/dropped Character ID). `options.clearScenePrompts`
    // (spec.md 20 — Regenerate) additionally wipes every Scene Prompt so
    // none of them keep referencing the Character Database that just got
    // replaced; omitted/false leaves existing Scene Prompts untouched
    // ("Regenerate characters only", with the same staleness risk spec.md 20
    // warns about).
    detect(projectId: string, options?: { clearScenePrompts?: boolean }): Promise<Character[]>
    // Phase 7 — manual trigger for GENERATE_CHARACTER_PROMPTS, same "stand-in
    // for Run All" pattern as detect() above. Batches every character
    // (10/request, spec.md 15) and returns the full character_prompts list,
    // including any batch that ended up `failed` after exhausting retries.
    generatePrompts(projectId: string): Promise<CharacterPrompt[]>
    // Regenerates exactly one character's prompt without touching any other
    // row — the independent Retry action on a single failed card.
    retryPrompt(projectId: string, characterId: string): Promise<CharacterPrompt>
  }
  scenePrompts: {
    list(projectId: string): Promise<ScenePrompt[]>
    // Phase 8 — manual trigger for SELECT_RELEVANT_CHARACTERS +
    // GENERATE_SCENE_PROMPT, same "stand-in for Run All" pattern as
    // characters.detect()/generatePrompts(). Generates exactly one Scene
    // Prompt per SRT block (1:1) and returns the full list, including any
    // block that ended up `failed` after exhausting retries.
    generate(projectId: string): Promise<ScenePrompt[]>
    // Regenerates exactly one SRT block's Scene Prompt without touching any
    // other row — the independent Retry action on a single failed card.
    retry(projectId: string, blockIndex: number): Promise<ScenePrompt>
    // Live progress during generate() — fires once per batch. Returns an
    // unsubscribe function, same shape as pipeline.onProgress.
    onProgress(callback: (progress: ScenePromptGenerationProgress) => void): () => void
  }
  pipeline: {
    run(projectId: string): Promise<void>
    pause(projectId: string): Promise<void>
    resume(projectId: string): Promise<void>
    cancel(projectId: string): Promise<void>
    retryTask(projectId: string, taskId: string): Promise<void>
    listTasks(projectId: string): Promise<PipelineTask[]>
    onProgress(callback: (task: PipelineTask) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    save(settings: Partial<AppSettings>): Promise<AppSettings>
  }
  vilao: {
    saveApiKey(apiKey: string): Promise<void>
    testConnection(): Promise<VilaoConnectionStatus>
    listModels(): Promise<ModelInfo[]>
    // Cheap local existence check (no decrypt, no network) — lets the UI show
    // "a key is already saved" without ever reading the key itself back into
    // the Renderer. Added after Phase 3 shipped: clearing the API key input
    // after Save (so the plaintext never lingers in form state) looked like
    // the key had been lost, since the input fell back to its generic
    // "sk-vilao-…" example placeholder with no way to tell configured apart
    // from empty.
    hasApiKey(): Promise<boolean>
    // Deletes the stored credential file outright (SecureStorageService.clear(),
    // already used internally since Phase 3, just not exposed over IPC until
    // now) — the explicit "Remove" action for the disabled/saved input state.
    clearApiKey(): Promise<void>
  }
  export: {
    // Opens a native "choose folder" dialog in Main (same pattern as
    // projects.loadTranscriptFile), writes Project_Name/{Project_Name.srt,
    // character_prompts.txt, image_prompts.txt} into the chosen directory
    // (ExportService, spec.md 21-24), and remembers the chosen parent folder
    // as AppSettings.lastExportFolder for next time. Rejects with the
    // literal message "EXPORT_CANCELED" if the user dismisses the dialog —
    // the Renderer treats that as a silent no-op, not an error toast.
    project(projectId: string): Promise<{ folderPath: string }>
    // Reveals an already-exported folder in Finder — takes the exact
    // `folderPath` this same session got back from project() above, not an
    // arbitrary Renderer-supplied path. Not in spec.md 4.2's original list,
    // added in Phase 11 for the "Show in Finder" button that appears after a
    // successful export (spec.md 8.7) — projects.showInFinder always points
    // at the SQLite DB file (see its own comment), not a per-project folder.
    showInFinder(folderPath: string): Promise<void>
  }
}

declare global {
  interface Window {
    appApi: AppApi
  }
}
