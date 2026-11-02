import type { Channel, Character, CharacterPrompt, LlmCall, ModelInfo, PipelineTask, Project, ScenePrompt, SrtBlock } from './entities'
import type { VilaoConnectionStatus } from './enums'
import type { LlmProvider } from './llmProviders'

// Phase 27 — per-project LLM call statistics (API Calls tab).
export interface LlmCallGroup {
  key: string
  calls: number
  failed: number
  durationMs: number
  totalTokens: number
}

export interface LlmCallStats {
  totalCalls: number
  successCalls: number
  failedCalls: number
  totalDurationMs: number
  // Sums of what the provider reported; 0 when it reported nothing.
  promptTokens: number
  completionTokens: number
  totalTokens: number
  byStep: LlmCallGroup[]
  byModel: LlmCallGroup[]
  // Newest first, capped (200).
  recent: LlmCall[]
}

// Typed surface for window.appApi (contextBridge). Renderer never touches the
// Vilao API key or calls Vilao directly — everything here is IPC to Main.
// Phase 1: all methods are stubs (see src/main/ipc/*.ipc.ts) and either
// no-op or reject with NOT_IMPLEMENTED; wired to real logic from Phase 2 on.

export interface AppSettings {
  // "Average", not a hard ceiling (Phase 18, user request) — see
  // splitSrt.ts's gatherBlocks(). Now the default template used when
  // creating a new Channel (Settings > General), not a project directly.
  avgCharacters: number
  variancePercent: number
  fakeSrtDurationSec: number
  selectedModel: string | null
  promptSettings: {
    characterDetection: string
    characterGeneration: string
    sceneGeneration: string
    // Phase 22 — default template seeded into a new channel's
    // sceneGenerationPromptNoCharacters (Channel.hasCharacters=false).
    sceneGenerationNoCharacters: string
  }
  uiPreferences: Record<string, unknown>
  // Doubles as the configured "Default Export Folder" (Settings > General) —
  // export.project() uses it directly with no folder-picker dialog once set;
  // the dialog only appears the first time, to establish it (see spec.md 21).
  lastExportFolder: string | null
}

export interface ProjectSummary extends Project {
  channelName: string
  srtCount: number
  characterCount: number
  characterPromptDone: number
  scenePromptDone: number
  failedTaskCount: number
  progressPercent: number
}

// Run queue (queue.ipc.ts/QueueService) — in-memory only, does not persist
// across an app restart. `running` is always at most one item (queue.list()
// puts it first); everything after it is `queued`, in FIFO run order.
export interface QueueItem {
  projectId: string
  projectName: string
  status: 'queued' | 'running'
}

// Machine-locked activation (Phase 23) — whole-install state, not per-project
// data, so it lives in a flat userData file (ActivationService), not SQLite.
// getStatus() re-verifies the stored code's signature against the CURRENT
// machine's ID every call, so copying the record to another machine doesn't
// help: `corrupt` = the record file is unreadable/malformed, `invalid_for_machine`
// = the record is well-formed but its signature doesn't match this machine.
export type ActivationStatus =
  | { activated: true }
  | { activated: false; reason: 'not_activated' | 'corrupt' | 'invalid_for_machine' }

export type ActivationResult =
  | { success: true }
  | { success: false; reason: 'invalid_format' | 'verification_failed' }

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
    // channelId is required (Phase 18) — every project belongs to exactly
    // one channel, chosen once at creation and never changed afterward. The
    // channel's current settings (avgCharacters/variancePercent/
    // fakeDurationSec/model/3 prompts/sceneConcurrency/sceneBatchSize) are copied into this
    // project's own columns at this moment, same copy-once pattern
    // AppSettings → project used before channels existed (see
    // ProjectService.create).
    create(input: { name: string; transcript: string; channelId: string }): Promise<Project>
    open(id: string): Promise<Project | null>
    // Plain read, no side effects (unlike open(), which bumps last_opened_at
    // and downgrades a stuck `processing` status back to `paused` — correct
    // only for a fresh navigation/app start, not for polling the status of a
    // project that's genuinely running right now). usePipelineStore's
    // per-task refresh uses this instead of open() so a live queue-triggered
    // run doesn't get its own `processing` status clobbered back to `paused`
    // mid-run just because its Processing tab happens to be open.
    get(id: string): Promise<Project | null>
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
    // currently open project (maxRetry/sceneConcurrency/sceneBatchSize are
    // per-project schema.md fields, not AppSettings; see plan.md Phase 4/9
    // notes). sceneBatchSize added 2026-08-10 (user request).
    updatePipelineSettings(
      id: string,
      settings: { maxRetry: number; sceneConcurrency: number; sceneBatchSize: number }
    ): Promise<Project>
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
    // Opens a native folder picker and persists the pick as
    // AppSettings.lastExportFolder. Returns null if the user cancels.
    chooseExportFolder(): Promise<string | null>
  }
  // Phase 27 — per-project LLM call counts for the "API Calls" tab.
  llmCalls: {
    stats(projectId: string): Promise<LlmCallStats>
    // Fires (with the project id) after every logged call; returns an unsubscribe function.
    onChanged(callback: (projectId: string) => void): () => void
  }
  // Phase 25 — replaces the Vilao-only `vilao` domain: every method takes the
  // provider (Vilao/DeepSeek/Gemini). listModels returns ids already in
  // channel format ("deepseek:deepseek-chat"; bare for Vilao).
  providers: {
    saveApiKey(provider: LlmProvider, apiKey: string): Promise<void>
    testConnection(provider: LlmProvider): Promise<VilaoConnectionStatus>
    listModels(provider: LlmProvider): Promise<ModelInfo[]>
    // Cheap local existence check (no decrypt, no network) — lets the UI show
    // "a key is already saved" without ever reading the key itself back into
    // the Renderer. Added after Phase 3 shipped: clearing the API key input
    // after Save (so the plaintext never lingers in form state) looked like
    // the key had been lost, since the input fell back to its generic
    // "sk-vilao-…" example placeholder with no way to tell configured apart
    // from empty.
    hasApiKey(provider: LlmProvider): Promise<boolean>
    // Deletes the stored credential file outright (SecureStorageService.clear(),
    // already used internally since Phase 3, just not exposed over IPC until
    // now) — the explicit "Remove" action for the disabled/saved input state.
    clearApiKey(provider: LlmProvider): Promise<void>
  }
  export: {
    // Where Project_Name/{Project_Name.srt, character_prompts.txt,
    // image_prompts.txt} was (or will be) written — join of
    // AppSettings.lastExportFolder ("Default Export Folder", Settings >
    // General) and the sanitized project name. Null if that folder hasn't
    // been configured yet. The actual write now happens automatically in
    // Main (PipelineService) when Run All completes, not from the Renderer.
    getFolderPath(projectId: string): Promise<string | null>
    // Reveals that folder in Finder. Not in spec.md 4.2's original list,
    // added in Phase 11 for the Export tab's "Show in Finder" button —
    // projects.showInFinder always points at the SQLite DB file (see its own
    // comment), not a per-project folder.
    showInFinder(folderPath: string): Promise<void>
  }
  // Run queue — adds projects one at a time via a per-project "Add to Queue"
  // action; QueueService (Main) runs them strictly in FIFO order, one at a
  // time, starting the next the instant the previous settles (success or
  // failure never stops the queue). In-memory only.
  queue: {
    add(projectId: string): Promise<void>
    // No-op (returns normally) if projectId isn't currently a *queued* item
    // — the running one can't be removed this way.
    remove(projectId: string): Promise<void>
    list(): Promise<QueueItem[]>
    // Fires with the full current list on every add/remove/start/finish.
    onUpdate(callback: (items: QueueItem[]) => void): () => void
  }
  // Phase 18 — Channels: shared, editable settings template a project copies
  // from once at creation time (see projects.create above). Settings >
  // General/Prompts (settings.get/save) now serve as the *default* template
  // for a newly created channel, not for a newly created project directly.
  channels: {
    list(): Promise<Array<Channel & { projectCount: number }>>
    get(id: string): Promise<Channel | null>
    create(input: Omit<Channel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Channel>
    update(id: string, input: Omit<Channel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Channel>
    // Rejects if the channel still has projects, or if it's the last
    // remaining channel (New Project always needs at least one to pick
    // from) — see ChannelService.delete.
    delete(id: string): Promise<void>
  }
  // Phase 23 — machine-locked activation gate, checked once by App.tsx before
  // it renders RouterProvider. Offline: codes are Ed25519 signatures over
  // this machine's ID, produced out-of-band by the developer's own CLI
  // (scripts/generate-activation-code.cjs) and verified locally against a
  // hardcoded public key — no server, no network call.
  activation: {
    getMachineId(): Promise<string>
    getStatus(): Promise<ActivationStatus>
    activate(code: string): Promise<ActivationResult>
  }
}

declare global {
  interface Window {
    appApi: AppApi
  }
}
