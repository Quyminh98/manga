import Store from 'electron-store'
import type { AppSettings } from '@shared/ipc-types'
import {
  DEFAULT_CHARACTER_DETECTION_PROMPT,
  DEFAULT_CHARACTER_GENERATION_PROMPT,
  DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT,
  DEFAULT_SCENE_GENERATION_PROMPT
} from '@shared/prompts'
import { upgradeLegacyDefaultPrompt } from '@shared/legacyPrompts'

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
  avgCharacters: 300,
  variancePercent: 30,
  fakeSrtDurationSec: 3,
  selectedModel: null,
  promptSettings: {
    characterDetection: DEFAULT_CHARACTER_DETECTION_PROMPT,
    characterGeneration: DEFAULT_CHARACTER_GENERATION_PROMPT,
    sceneGeneration: DEFAULT_SCENE_GENERATION_PROMPT,
    sceneGenerationNoCharacters: DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT
  },
  uiPreferences: {},
  lastExportFolder: null
}

let store: Store<AppSettings> | null = null

function getStore(): Store<AppSettings> {
  if (!store) store = new Store<AppSettings>({ name: 'app-settings', defaults: DEFAULT_SETTINGS })
  return store
}

function upgradePromptSettings(settings: AppSettings['promptSettings']): AppSettings['promptSettings'] {
  return {
    characterDetection: upgradeLegacyDefaultPrompt(settings.characterDetection),
    characterGeneration: upgradeLegacyDefaultPrompt(settings.characterGeneration),
    sceneGeneration: upgradeLegacyDefaultPrompt(settings.sceneGeneration),
    sceneGenerationNoCharacters: upgradeLegacyDefaultPrompt(settings.sceneGenerationNoCharacters)
  }
}

export function getAppSettings(): AppSettings {
  const s = getStore()
  return {
    avgCharacters: s.get('avgCharacters'),
    variancePercent: s.get('variancePercent'),
    fakeSrtDurationSec: s.get('fakeSrtDurationSec'),
    selectedModel: s.get('selectedModel'),
    // electron-store/conf only shallow-merges `defaults` into an existing
    // store file (Object.assign, not deep) — an app-settings.json written
    // before `promptSettings.sceneGenerationNoCharacters` existed (Phase 22)
    // keeps that nested object exactly as last saved, missing the new key
    // entirely. Spread DEFAULT_SETTINGS.promptSettings first so a field
    // that's new-to-disk still falls back to a real default instead of
    // `undefined`, without touching any field the user actually saved.
    // Phase 28 — a setting still holding an untouched pre-Phase 28 default is
    // read as the reordered default (same as migration 0009 does for channels).
    promptSettings: upgradePromptSettings({ ...DEFAULT_SETTINGS.promptSettings, ...s.get('promptSettings') }),
    uiPreferences: s.get('uiPreferences'),
    lastExportFolder: s.get('lastExportFolder')
  }
}

export function saveAppSettings(partial: Partial<AppSettings>): AppSettings {
  const s = getStore()
  s.set(partial)
  return getAppSettings()
}
