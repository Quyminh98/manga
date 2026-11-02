import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { LlmProvider } from '@shared/llmProviders'

// schema.md `SecureCredential`: { provider: "vilao", encryptedApiKey: Buffer, updatedAt }.
// `encryptedApiKey` is Electron safeStorage ciphertext (OS Keychain-backed on macOS) —
// persisted as raw bytes to its own file, never through electron-store's readable
// JSON settings file and never in SQLite (schema.md 3.5 / "Non-DB data shapes").
// `provider`/`updatedAt` aren't sensitive but are kept out of that file too — no
// value in reifying a JSON envelope around a single-key credential. Phase 25: one
// such file per provider (<provider>.cred) instead of a `provider` field.

// Phase 25 — one file per provider (`vilao.cred` keeps its original name, so
// keys saved before DeepSeek/Gemini existed are still found).
function getCredentialPath(provider: LlmProvider): string {
  return join(app.getPath('userData'), `${provider}.cred`)
}

export class SecureStorageService {
  saveApiKey(apiKey: string, provider: LlmProvider = LlmProvider.VILAO): void {
    if (!apiKey.trim()) throw new Error('API key is required')
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS secure storage (Keychain) is not available on this machine')
    }
    const encrypted = safeStorage.encryptString(apiKey.trim())
    writeFileSync(getCredentialPath(provider), encrypted)
  }

  hasApiKey(provider: LlmProvider = LlmProvider.VILAO): boolean {
    return existsSync(getCredentialPath(provider))
  }

  getApiKey(provider: LlmProvider = LlmProvider.VILAO): string | null {
    const path = getCredentialPath(provider)
    if (!existsSync(path)) return null
    const encrypted = readFileSync(path)
    return safeStorage.decryptString(encrypted)
  }

  clear(provider: LlmProvider = LlmProvider.VILAO): void {
    const path = getCredentialPath(provider)
    if (existsSync(path)) unlinkSync(path)
  }
}
