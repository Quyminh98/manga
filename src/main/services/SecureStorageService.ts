import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'

// schema.md `SecureCredential`: { provider: "vilao", encryptedApiKey: Buffer, updatedAt }.
// `encryptedApiKey` is Electron safeStorage ciphertext (OS Keychain-backed on macOS) —
// persisted as raw bytes to its own file, never through electron-store's readable
// JSON settings file and never in SQLite (schema.md 3.5 / "Non-DB data shapes").
// `provider`/`updatedAt` aren't sensitive but are kept out of that file too — no
// value in reifying a JSON envelope around a single-provider, single-key credential.

let credentialPath: string | null = null

function getCredentialPath(): string {
  if (!credentialPath) credentialPath = join(app.getPath('userData'), 'vilao.cred')
  return credentialPath
}

export class SecureStorageService {
  saveApiKey(apiKey: string): void {
    if (!apiKey.trim()) throw new Error('API key is required')
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS secure storage (Keychain) is not available on this machine')
    }
    const encrypted = safeStorage.encryptString(apiKey.trim())
    writeFileSync(getCredentialPath(), encrypted)
  }

  hasApiKey(): boolean {
    return existsSync(getCredentialPath())
  }

  getApiKey(): string | null {
    const path = getCredentialPath()
    if (!existsSync(path)) return null
    const encrypted = readFileSync(path)
    return safeStorage.decryptString(encrypted)
  }

  clear(): void {
    const path = getCredentialPath()
    if (existsSync(path)) unlinkSync(path)
  }
}
