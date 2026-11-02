import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from '@renderer/router'
import { appApi } from '@renderer/lib/appApi'
import { ActivationGate } from '@renderer/components/layout/ActivationGate'
import type { ActivationStatus } from '@shared/ipc-types'

export function App(): JSX.Element | null {
  const [status, setStatus] = useState<ActivationStatus | 'loading'>('loading')

  useEffect(() => {
    void appApi.activation.getStatus().then(setStatus)
  }, [])

  // Window is only shown on 'ready-to-show' (src/main/index.ts), so a blank
  // first frame here is never visible to the user.
  if (status === 'loading') return null

  if (!status.activated) {
    return <ActivationGate reason={status.reason} onActivated={() => setStatus({ activated: true })} />
  }

  return <RouterProvider router={router} />
}
