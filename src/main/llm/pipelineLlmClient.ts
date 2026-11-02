import type { LlmProvider } from '@shared/llmProviders'
import type { LlmCallRecorder } from './llmCallRecorder'
import { LlmClient } from './LlmClient'

// Phase 28 — transient failures (connection dropped, timeout, 429, 5xx, empty
// answer) are resent this many extra times before a pipeline step sees the error.
const PIPELINE_TRANSIENT_RETRIES = 3

// The one place the app builds an LLM client for pipeline work (Run All/Queue
// and manual triggers, both via pipeline/runtime.ts): logs every call to
// `llm_calls` (Phase 27) and retries transient failures (Phase 28).
export function createPipelineLlmClient(apiKey: string, provider: LlmProvider, onCall: LlmCallRecorder): LlmClient {
  return new LlmClient({
    apiKey,
    provider,
    onCall,
    maxTransientRetries: PIPELINE_TRANSIENT_RETRIES
  })
}
