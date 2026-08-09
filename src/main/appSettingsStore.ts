import Store from 'electron-store'
import type { AppSettings } from '@shared/ipc-types'
import {
  DEFAULT_CHARACTER_DETECTION_PROMPT,
  DEFAULT_CHARACTER_GENERATION_PROMPT,
  DEFAULT_SCENE_GENERATION_PROMPT
} from '@shared/prompts'

// electron-store persists this outside SQLite (context/schema.md: "Dữ liệu
// không nhạy cảm nhưng không cần quan hệ ... đi qua electron-store, không
// vào SQLite"). Pinned to electron-store@8 (CommonJS) — v9+ is ESM-only and
// breaks under the main process's externalized CJS require() (same class of
// issue noted in plan.md Phase 1 for main/preload).
//
// promptSettings default to spec.md 28-30's default prompts (Phase 6) rather
// than empty strings — same field/type as before, only the default *value*
// changed, so this isn't a schema change.
const DEFAULT_SETTINGS: AppSettings = {
  maxCharacters: 300,
  fakeSrtDurationSec: 3,
  selectedModel: null,
  promptSettings: {
    characterDetection: DEFAULT_CHARACTER_DETECTION_PROMPT,
    characterGeneration: DEFAULT_CHARACTER_GENERATION_PROMPT,
    sceneGeneration: DEFAULT_SCENE_GENERATION_PROMPT
  },
  uiPreferences: {},
  lastExportFolder: null
}

let store: Store<AppSettings> | null = null

function getStore(): Store<AppSettings> {
  if (!store) store = new Store<AppSettings>({ name: 'app-settings', defaults: DEFAULT_SETTINGS })
  return store
}

export function getAppSettings(): AppSettings {
  const s = getStore()
  return {
    maxCharacters: s.get('maxCharacters'),
    fakeSrtDurationSec: s.get('fakeSrtDurationSec'),
    selectedModel: s.get('selectedModel'),
    promptSettings: s.get('promptSettings'),
    uiPreferences: s.get('uiPreferences'),
    lastExportFolder: s.get('lastExportFolder')
  }
}

export function saveAppSettings(partial: Partial<AppSettings>): AppSettings {
  const s = getStore()
  s.set(partial)
  return getAppSettings()
}
