import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateKeyPairSync, sign } from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ActivationService imports `app` from 'electron' as a fallback for
// userDataDir — every test here passes userDataDir explicitly, but the
// top-level import still needs 'electron' to resolve to something usable
// under vitest's Node environment (it does not, by default).
vi.mock('electron', () => ({ app: { getPath: vi.fn() } }))

const machineIdSyncMock = vi.fn(() => 'test-machine-id')
vi.mock('node-machine-id', () => ({ machineIdSync: () => machineIdSyncMock() }))

// Test-only Ed25519 keypair, swapped in for the real embedded public key so
// these tests never depend on (or leak) the actual shipped keypair.
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

function codeFor(machineId: string): string {
  const signature = sign(null, Buffer.from(machineId, 'utf8'), privateKey)
  return `SP1-${signature.toString('base64url')}`
}

// Imported after the mocks above so ActivationService picks them up.
const { ActivationService } = await import('../../src/main/services/ActivationService')

describe('ActivationService', () => {
  let userDataDir: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'activation-test-'))
    machineIdSyncMock.mockReturnValue('test-machine-id')
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  function service(): InstanceType<typeof ActivationService> {
    return new ActivationService({ userDataDir, publicKeyPem: publicKey })
  }

  it('reports not_activated when no activation file exists', () => {
    expect(service().getStatus()).toEqual({ activated: false, reason: 'not_activated' })
  })

  it('activates with a code signed for the current machine, and getStatus reflects it', () => {
    const svc = service()
    const result = svc.activate(codeFor('test-machine-id'))

    expect(result).toEqual({ success: true })
    expect(svc.getStatus()).toEqual({ activated: true })
  })

  it('rejects a code signed for a different machine', () => {
    const result = service().activate(codeFor('someone-elses-machine'))
    expect(result).toEqual({ success: false, reason: 'verification_failed' })
  })

  it('rejects a malformed/garbage code without attempting verification', () => {
    expect(service().activate('not-even-a-real-code')).toEqual({ success: false, reason: 'invalid_format' })
    expect(service().activate('SP1-tooshort')).toEqual({ success: false, reason: 'invalid_format' })
  })

  it('treats a previously-valid activation as invalid_for_machine once the machine id changes', () => {
    const svc = service()
    svc.activate(codeFor('test-machine-id'))

    machineIdSyncMock.mockReturnValue('a-different-machine-id')
    expect(svc.getStatus()).toEqual({ activated: false, reason: 'invalid_for_machine' })
  })

  it('treats a corrupt activation file as corrupt, not a crash', () => {
    const svc = service()
    writeFileSync(join(userDataDir, 'activation.json'), 'not json at all')
    expect(svc.getStatus()).toEqual({ activated: false, reason: 'corrupt' })
  })
})
