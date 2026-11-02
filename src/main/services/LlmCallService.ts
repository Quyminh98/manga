import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { LlmCallStats } from '@shared/ipc-types'
import { aggregateLlmCalls, insertLlmCall, listLlmCallsByProjectId, sumLlmCallTokens } from '../db/queries/llmCalls.queries'
import type { LlmCallRecord } from '../llm/LlmClient'

const RECENT_LIMIT = 200

// Phase 27 — persists one row per LLM request (LlmClient's `onCall` hook)
// and serves the per-project "API Calls" tab. No electron import, so it's
// testable with createDatabase(':memory:') like the other services.
export class LlmCallService {
  constructor(private readonly db: Database.Database) {}

  // Never throws — a failure to log must not fail the pipeline step that
  // made the call.
  record(call: LlmCallRecord): void {
    try {
      const now = new Date().toISOString()
      insertLlmCall(this.db, {
        id: randomUUID(),
        projectId: call.projectId,
        step: call.step,
        model: call.model,
        status: call.status,
        error: call.error,
        durationMs: call.durationMs,
        promptTokens: call.usage?.promptTokens ?? null,
        completionTokens: call.usage?.completionTokens ?? null,
        totalTokens: call.usage?.totalTokens ?? null,
        createdAt: now,
        updatedAt: now
      })
    } catch {
      // swallowed on purpose (e.g. the project was deleted mid-run → FK failure)
    }
  }

  getStats(projectId: string): LlmCallStats {
    const byStep = aggregateLlmCalls(this.db, projectId, 'step')
    const byModel = aggregateLlmCalls(this.db, projectId, 'model')
    const tokens = sumLlmCallTokens(this.db, projectId)

    const totalCalls = byStep.reduce((sum, g) => sum + g.calls, 0)
    const failedCalls = byStep.reduce((sum, g) => sum + g.failed, 0)
    return {
      totalCalls,
      successCalls: totalCalls - failedCalls,
      failedCalls,
      totalDurationMs: byStep.reduce((sum, g) => sum + g.durationMs, 0),
      ...tokens,
      byStep,
      byModel,
      recent: listLlmCallsByProjectId(this.db, projectId, RECENT_LIMIT)
    }
  }
}
