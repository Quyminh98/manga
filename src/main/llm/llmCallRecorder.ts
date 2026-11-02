import { IpcChannels } from '@shared/ipc-channels'
import { broadcast } from '../broadcast'
import type { LlmCallService } from '../services/LlmCallService'
import type { LlmCallRecord } from './LlmClient'

// Phase 27 — the `onCall` hook handed to every pipeline LlmClient
// (createPipelineLlmClient): logs the call to `llm_calls`, then tells every
// window which project changed so the API Calls tab can refetch live (also
// covers queue-triggered runs, which have no single event.sender).
export type LlmCallRecorder = (record: LlmCallRecord) => void

export function createLlmCallRecorder(service: LlmCallService): LlmCallRecorder {
  return (record) => {
    service.record(record)
    broadcast(IpcChannels.llmCalls.changedEvent, record.projectId)
  }
}
