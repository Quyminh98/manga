import { useEffect, useState } from 'react'
import { Check, Copy, Lock } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { appApi } from '@renderer/lib/appApi'
import type { ActivationResult, ActivationStatus } from '@shared/ipc-types'

type NotActivatedReason = Extract<ActivationStatus, { activated: false }>['reason']

// Copy shown before the user has attempted to submit a code — keyed off why
// App.tsx's initial getStatus() call came back not-activated, so a returning
// user whose saved activation went stale gets a more specific explanation
// than a first-time installer.
const INITIAL_REASON_COPY: Record<NotActivatedReason, string> = {
  not_activated: 'This installation needs to be activated before you can use StoryPrompt Desktop.',
  corrupt: 'Your saved activation data could not be read. Please enter your activation code again.',
  invalid_for_machine: "Your saved activation code isn't valid for this machine. Please enter a new activation code."
}

const SUBMIT_ERROR_COPY: Record<Extract<ActivationResult, { success: false }>['reason'], string> = {
  invalid_format: "That doesn't look like a valid activation code — check for missing or extra characters.",
  verification_failed: "This code isn't valid for this machine. Double-check the Machine ID below matches what you sent."
}

interface ActivationGateProps {
  reason: NotActivatedReason
  onActivated: () => void
}

export function ActivationGate({ reason, onActivated }: ActivationGateProps): JSX.Element {
  const [machineId, setMachineId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void appApi.activation.getMachineId().then(setMachineId)
  }, [])

  const onCopy = async (): Promise<void> => {
    if (!machineId) return
    await navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!code.trim() || submitting) return

    setSubmitting(true)
    setError(null)
    const result = await appApi.activation.activate(code)
    setSubmitting(false)

    if (result.success) {
      onActivated()
      return
    }
    setError(SUBMIT_ERROR_COPY[result.reason])
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-gutter bg-surface-charcoal">
      <Card className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-surface-container-lowest border border-border-subtle flex items-center justify-center text-text-secondary">
            <Lock size={18} />
          </div>
          <h1 className="font-headline-sm text-headline-sm text-text-primary">Activation Required</h1>
        </div>

        <p className="font-body-md text-body-md text-text-secondary mb-6">{INITIAL_REASON_COPY[reason]}</p>

        <div className="mb-6">
          <label className="block font-label-caps text-label-caps text-text-secondary mb-2">MACHINE ID</label>
          <div className="flex gap-3">
            <input
              readOnly
              value={machineId ?? 'Loading…'}
              className="flex-1 bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-code-sm text-code-sm focus:outline-none"
            />
            <Button type="button" variant="ghost" disabled={!machineId} onClick={() => void onCopy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="font-body-sm text-body-sm text-text-secondary mt-2">
            Send this ID to your StoryPrompt provider to receive an activation code for this machine.
          </p>
        </div>

        <form onSubmit={(event) => void onSubmit(event)} className="space-y-2">
          <label className="block font-label-caps text-label-caps text-text-secondary mb-2">ACTIVATION CODE</label>
          <div className="flex gap-3">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              type="password"
              placeholder="SP1-…"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-surface-container-lowest border border-border-subtle rounded px-3 py-2 text-text-primary font-code-sm text-code-sm focus:outline-none focus:border-l-2 focus:border-l-vilao-blue"
            />
            <Button type="submit" variant="primary" disabled={!code.trim() || submitting}>
              {submitting ? 'Activating…' : 'Activate'}
            </Button>
          </div>
          {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
        </form>
      </Card>
    </div>
  )
}
