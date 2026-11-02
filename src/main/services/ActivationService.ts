import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { createPublicKey, verify } from 'crypto'
import { machineIdSync } from 'node-machine-id'
import type { ActivationResult, ActivationStatus } from '@shared/ipc-types'
import { ACTIVATION_PUBLIC_KEY_PEM } from '@shared/activationPublicKey'

// Machine-locked activation (context/plan.md Phase 23). Unlike SecureStorageService
// (vilao.cred), this record isn't a secret to hide — it needs tamper-resistance,
// not encryption. That's exactly what the Ed25519 signature already provides
// (a code only verifies against the machine ID it was signed for), so this
// writes a plain JSON file to userData rather than going through safeStorage.
//
// Codes are produced entirely offline by the developer (scripts/generate-
// activation-code.cjs, holding the private key) and verified here against the
// public key baked into the app — no server, no network call, ever.

export interface ActivationServiceOptions {
  userDataDir?: string
  publicKeyPem?: string
}

interface ActivationRecord {
  machineId: string
  code: string
  activatedAt: string
}

const CODE_PREFIX = 'SP1-'
const SIGNATURE_BYTE_LENGTH = 64
// Loose length bound around base64url(64 raw bytes) (~86 chars, no padding) —
// exact enough to reject obvious garbage before ever touching the crypto call.
const CODE_PATTERN = /^SP1-[A-Za-z0-9_-]{80,90}$/

export class ActivationService {
  private readonly userDataDir: string
  private readonly publicKeyPem: string

  constructor(options: ActivationServiceOptions = {}) {
    this.userDataDir = options.userDataDir ?? app.getPath('userData')
    this.publicKeyPem = options.publicKeyPem ?? ACTIVATION_PUBLIC_KEY_PEM
  }

  private getActivationPath(): string {
    return join(this.userDataDir, 'activation.json')
  }

  getMachineId(): string {
    return machineIdSync()
  }

  // status is recomputed from the CURRENT machine's ID every call, never
  // trusting the machineId field stored in the file — that's what makes
  // copying activation.json to a different machine harmless: the signature
  // simply stops verifying once the machine ID it's checked against changes.
  getStatus(): ActivationStatus {
    const path = this.getActivationPath()
    if (!existsSync(path)) return { activated: false, reason: 'not_activated' }

    const record = this.readRecord(path)
    if (!record) return { activated: false, reason: 'corrupt' }

    const signature = this.parseCode(record.code)
    if (!signature) return { activated: false, reason: 'corrupt' }

    if (!this.verifySignature(signature, this.getMachineId())) {
      return { activated: false, reason: 'invalid_for_machine' }
    }
    return { activated: true }
  }

  activate(code: string): ActivationResult {
    const trimmed = code.trim()
    const signature = this.parseCode(trimmed)
    if (!signature) return { success: false, reason: 'invalid_format' }

    const machineId = this.getMachineId()
    if (!this.verifySignature(signature, machineId)) {
      return { success: false, reason: 'verification_failed' }
    }

    const record: ActivationRecord = { machineId, code: trimmed, activatedAt: new Date().toISOString() }
    writeFileSync(this.getActivationPath(), JSON.stringify(record))
    return { success: true }
  }

  private readRecord(path: string): ActivationRecord | null {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      if (typeof parsed.machineId !== 'string' || typeof parsed.code !== 'string') return null
      return parsed as ActivationRecord
    } catch {
      return null
    }
  }

  private parseCode(code: string): Buffer | null {
    if (!CODE_PATTERN.test(code)) return null
    const signature = Buffer.from(code.slice(CODE_PREFIX.length), 'base64url')
    return signature.length === SIGNATURE_BYTE_LENGTH ? signature : null
  }

  private verifySignature(signature: Buffer, machineId: string): boolean {
    try {
      const publicKey = createPublicKey(this.publicKeyPem)
      return verify(null, Buffer.from(machineId, 'utf8'), publicKey, signature)
    } catch {
      return false
    }
  }
}
