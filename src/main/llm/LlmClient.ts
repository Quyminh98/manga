import type { ModelInfo } from '@shared/entities'
import type { TaskType } from '@shared/enums'
import {
  LLM_PROVIDER_META,
  LlmProvider,
  buildThinkingParams,
  formatModelRef,
  getProviderLabel,
  parseModelRef
} from '@shared/llmProviders'

// Vilao AI docs (api.vilao.ai/docs — API Reference): base URL + OpenAI-compatible
// endpoint shapes. GET /models -> { object: "list", data: [{ id, object, created,
// owned_by }] }. Bearer auth. Errors -> { error: { message, type, code } }.
export const VILAO_BASE_URL = 'https://api.vilao.ai/v1'

// Phase 28 — chat/completions timeouts. Streaming (DeepSeek/Gemini): abort when
// no bytes at all arrive for CHAT_IDLE_TIMEOUT_MS (covers waiting for headers
// too — a thinking model may take a while before its first chunk, and DeepSeek
// sends `: keep-alive` comments meanwhile), with an overall cap. Non-streaming
// (Vilao): one overall timeout for headers + body, since nothing arrives until
// the whole answer is ready.
export const CHAT_IDLE_TIMEOUT_MS = 180_000
export const CHAT_STREAM_TOTAL_TIMEOUT_MS = 600_000
export const CHAT_NON_STREAM_TIMEOUT_MS = 300_000
const RETRY_MAX_DELAY_MS = 30_000

// Both timeout messages start with this — errorClassification.ts maps it to TIMEOUT.
export const TIMEOUT_MESSAGE = 'Request timed out'

// `status` is the HTTP status code (null for network/timeout failures with no
// response) — callers use it to tell "invalid API key" (401) apart from
// everything else, per spec.md 5.1's Invalid/Error distinction. `apiErrorType`/
// `apiErrorCode` are the provider's own `error.type`/`error.code` fields
// (OpenAI-compatible shape) when the response body had them — used by
// pipeline/errorClassification.ts (Phase 12, spec.md 34) to tell
// MODEL_NOT_AVAILABLE/CONTEXT_TOO_LARGE apart from a generic API_ERROR beyond
// what the HTTP status code alone can distinguish. `retryAfterMs` comes from a
// 429's `Retry-After` header when present.
export class LlmApiError extends Error {
  readonly status: number | null
  readonly apiErrorType: string | null
  readonly apiErrorCode: string | null
  readonly retryAfterMs: number | null

  constructor(
    message: string,
    status: number | null,
    apiErrorType: string | null = null,
    apiErrorCode: string | null = null,
    retryAfterMs: number | null = null
  ) {
    super(message)
    this.name = 'LlmApiError'
    this.status = status
    this.apiErrorType = apiErrorType
    this.apiErrorCode = apiErrorCode
    this.retryAfterMs = retryAfterMs
  }
}

// Phase 28 — failures worth simply sending the same request again: no response
// at all (network drop, "terminated" mid-body, timeout, empty answer), rate
// limit, request timeout and server errors. Never 400/401/402/404/413/422 —
// those won't change on a resend (and context-too-large is handled by the
// pipeline services by trimming/splitting instead).
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof LlmApiError)) return false
  const { status } = err
  return status === null || status === 408 || status === 429 || status >= 500
}

export interface LlmClientOptions {
  apiKey: string
  // Phase 25 — the shared OpenAI-compatible client for every provider
  // (Vilao/DeepSeek/Gemini); defaults to Vilao.
  provider?: LlmProvider
  onCall?: (record: LlmCallRecord) => void
  baseUrl?: string
  // GET /models (Settings > API Keys) only.
  timeoutMs?: number
  // Phase 28 — extra attempts chat() makes on a transient failure (see
  // isTransientError). 0 = single attempt (default, so unit tests see exactly
  // one request); the app builds its clients with createPipelineLlmClient()
  // (src/main/llm/pipelineLlmClient.ts), which turns this on.
  maxTransientRetries?: number
  retryBaseDelayMs?: number
  chatIdleTimeoutMs?: number
  chatTotalTimeoutMs?: number
}

interface ModelsResponse {
  object: string
  data: Array<{ id: string }>
}

interface ApiErrorResponse {
  error?: { message?: string; type?: string; code?: string }
}

// Gemini's /models also lists embedding/image/audio models that can't serve
// chat/completions — keep only text-generation Gemini models.
const GEMINI_NON_CHAT = ['embedding', 'imagen', 'image', 'tts', 'audio', 'live', 'aqa', 'veo']

function isChatModel(provider: LlmProvider, id: string): boolean {
  if (provider !== LlmProvider.GEMINI) return true
  return id.startsWith('gemini') && !GEMINI_NON_CHAT.some((word) => id.includes(word))
}

// spec.md 5.2/5.3 — one chat message per request for Phase 6's DETECT_CHARACTERS
// (the default prompt in spec.md 28 is a single self-contained instruction
// block with {{TRANSCRIPT}} inlined, not a system+user split).
export interface LlmChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface LlmRequest {
  model: string
  messages: LlmChatMessage[]
  temperature?: number
  // Phase 27 — which project/pipeline step is making this call. When present
  // (and the service was built with `onCall`), the request is logged.
  meta?: { projectId: string; step: TaskType }
  // Phase 28 — the caller expects a JSON object back; sends
  // `response_format: json_object` to providers whose docs support it.
  jsonMode?: boolean
  // Phase 28 — polled before each transient retry; false (Pause/Cancel/delete)
  // stops retrying and rethrows the last error.
  shouldContinue?: () => boolean
}

export interface LlmUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface LlmResponse {
  content: string
  usage?: LlmUsage
}

// What `onCall` receives after every request that carried `meta` — success or
// failure (a response that later fails JSON parsing is still a successful call).
// Each transient retry is its own record.
export interface LlmCallRecord {
  projectId: string
  step: TaskType
  model: string
  status: 'success' | 'failed'
  error: string | null
  durationMs: number
  usage: LlmUsage | null
}

interface RawUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: RawUsage | null
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>
  usage?: RawUsage | null
  error?: { message?: string; type?: string; code?: string }
}

function mapUsage(usage: RawUsage | null | undefined): LlmUsage | undefined {
  if (!usage) return undefined
  return {
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null
  }
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// No electron import — constructed with an already-decrypted API key so it's
// usable both from the real app (main/ipc/providers.ipc.ts, main/pipeline/runtime.ts
// read the key via SecureStorageService first) and directly in unit tests
// (mocked global fetch).
export class LlmClient {
  private readonly apiKey: string
  private readonly provider: LlmProvider
  private readonly onCall?: (record: LlmCallRecord) => void
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxTransientRetries: number
  private readonly retryBaseDelayMs: number
  private readonly chatIdleTimeoutMs: number
  private readonly chatTotalTimeoutMs: number | undefined

  constructor(options: LlmClientOptions) {
    this.apiKey = options.apiKey
    this.provider = options.provider ?? LlmProvider.VILAO
    this.onCall = options.onCall
    this.baseUrl = (options.baseUrl ?? LLM_PROVIDER_META[this.provider].baseUrl).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 15000
    this.maxTransientRetries = options.maxTransientRetries ?? 0
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 2000
    this.chatIdleTimeoutMs = options.chatIdleTimeoutMs ?? CHAT_IDLE_TIMEOUT_MS
    this.chatTotalTimeoutMs = options.chatTotalTimeoutMs
  }

  // Thin boolean wrapper matching spec.md 5.2's `testConnection(): Promise<boolean>`.
  // The IPC layer calls listModels() directly instead, since it needs the
  // LlmApiError status code to distinguish Invalid (401) from Error (everything else).
  async testConnection(): Promise<boolean> {
    try {
      await this.listModels()
      return true
    } catch {
      return false
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const body = await this.request<ModelsResponse>('/models', { method: 'GET' })
    // Gemini returns ids as "models/gemini-…"; chat/completions wants the bare id.
    return body.data
      .map((model) => model.id.replace(/^models\//, ''))
      .filter((id) => isChatModel(this.provider, id))
      .map((id) => ({ id: formatModelRef(this.provider, id), name: id }))
  }

  // POST /chat/completions (OpenAI-compatible, spec.md 5.2). Used from Phase 6
  // on by pipeline steps that call the LLM (DETECT_CHARACTERS/
  // GENERATE_CHARACTER_PROMPTS/GENERATE_SCENE_PROMPT) — callers own content
  // retry/repair logic (see src/main/pipeline/*); this layer only resends on
  // transient transport failures (Phase 28, up to maxTransientRetries).
  async chat(request: LlmRequest): Promise<LlmResponse> {
    for (let retry = 0; ; retry++) {
      const startedAt = Date.now()
      try {
        const response = await this.chatOnce(request)
        this.report(request, startedAt, 'success', null, response.usage ?? null)
        return response
      } catch (err) {
        // (errorClassification.ts imports this file, so don't import it back here.)
        const message = err instanceof Error ? err.message : 'Unknown error'
        const error = err instanceof LlmApiError && err.status !== null ? `HTTP ${err.status}: ${message}` : message
        this.report(request, startedAt, 'failed', error, null)

        const stopped = (): boolean => !!request.shouldContinue && !request.shouldContinue()
        if (retry >= this.maxTransientRetries || !isTransientError(err) || stopped()) throw err
        await sleep(this.retryDelayMs(retry + 1, err as LlmApiError))
        if (stopped()) throw err
      }
    }
  }

  // Exponential backoff with ±20% jitter (so concurrent batches don't resend in
  // lockstep), or the server's own Retry-After when it gave one.
  private retryDelayMs(retryNumber: number, err: LlmApiError): number {
    if (err.retryAfterMs !== null) return Math.min(err.retryAfterMs, RETRY_MAX_DELAY_MS)
    const base = Math.min(this.retryBaseDelayMs * 2 ** (retryNumber - 1), RETRY_MAX_DELAY_MS)
    return Math.round(base * (0.8 + Math.random() * 0.4))
  }

  private report(
    request: LlmRequest,
    startedAt: number,
    status: 'success' | 'failed',
    error: string | null,
    usage: LlmUsage | null
  ): void {
    if (!this.onCall || !request.meta) return
    try {
      this.onCall({
        projectId: request.meta.projectId,
        step: request.meta.step,
        model: request.model,
        status,
        error,
        durationMs: Date.now() - startedAt,
        usage
      })
    } catch {
      // logging must never break the pipeline
    }
  }

  private async chatOnce(request: LlmRequest): Promise<LlmResponse> {
    // Channel models are stored as "[<provider>:]<id>[@<thinking>]" — send the
    // bare id plus whatever thinking params the provider's docs define.
    const { modelId, thinking } = parseModelRef(request.model)
    const meta = LLM_PROVIDER_META[this.provider]
    const stream = meta.supportsStreaming
    const body = {
      model: modelId,
      messages: request.messages,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...buildThinkingParams(this.provider, modelId, thinking),
      ...(request.jsonMode && meta.supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {})
    }

    const { content, usage } = await this.postChat(body, stream)
    if (!content || !content.trim()) {
      throw new LlmApiError(`${getProviderLabel(this.provider)} returned an empty response`, null)
    }
    return { content, ...(usage ? { usage } : {}) }
  }

  // Sends one chat/completions request and reads the whole answer — SSE when
  // `stream` (falls back to a plain JSON body if the server didn't stream).
  // Every failure, including one while reading the body ("terminated", a
  // stalled stream), comes out as a LlmApiError.
  private async postChat(
    body: Record<string, unknown>,
    stream: boolean
  ): Promise<{ content: string | null; usage: LlmUsage | undefined }> {
    const controller = new AbortController()
    let abortReason: string | null = null
    const abortWith = (reason: string): void => {
      abortReason = reason
      controller.abort()
    }

    const totalMs = this.chatTotalTimeoutMs ?? (stream ? CHAT_STREAM_TOTAL_TIMEOUT_MS : CHAT_NON_STREAM_TIMEOUT_MS)
    const totalTimer = setTimeout(() => abortWith(`${TIMEOUT_MESSAGE} (exceeded ${Math.round(totalMs / 1000)}s)`), totalMs)
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const touch = (): void => {
      if (!stream) return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(
        () => abortWith(`${TIMEOUT_MESSAGE} (no data for ${Math.round(this.chatIdleTimeoutMs / 1000)}s)`),
        this.chatIdleTimeoutMs
      )
    }

    try {
      touch()
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      if (!response.ok) throw await this.httpError(response)

      if (stream && response.body && (response.headers.get('content-type') ?? '').includes('text/event-stream')) {
        return await this.readEventStream(response.body, touch)
      }
      const json = (await response.json()) as ChatCompletionsResponse
      return { content: json.choices?.[0]?.message?.content ?? null, usage: mapUsage(json.usage) }
    } catch (err) {
      throw this.transportError(err, abortReason)
    } finally {
      clearTimeout(totalTimer)
      clearTimeout(idleTimer)
    }
  }

  // OpenAI-compatible SSE: `data: {chunk}` lines, `data: [DONE]` at the end,
  // `: keep-alive` comments (DeepSeek) and blank lines in between. Only
  // `delta.content` is the answer — `delta.reasoning_content` (thinking) is
  // ignored. Usage arrives on the last chunk (stream_options.include_usage).
  private async readEventStream(
    body: ReadableStream<Uint8Array>,
    onData: () => void
  ): Promise<{ content: string | null; usage: LlmUsage | undefined }> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let usage: LlmUsage | undefined

    const handleLine = (rawLine: string): void => {
      const line = rawLine.replace(/\r$/, '')
      if (!line.startsWith('data:')) return
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return
      let chunk: StreamChunk
      try {
        chunk = JSON.parse(data) as StreamChunk
      } catch {
        return
      }
      if (chunk.error) {
        // An error reported mid-stream — treated as a server error (retryable).
        throw new LlmApiError(
          chunk.error.message ?? `${getProviderLabel(this.provider)} stream error`,
          500,
          chunk.error.type ?? null,
          chunk.error.code ?? null
        )
      }
      const delta = chunk.choices?.[0]?.delta?.content
      if (typeof delta === 'string') content += delta
      if (chunk.usage) usage = mapUsage(chunk.usage)
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      onData()
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
      }
    }
    buffer += decoder.decode()
    if (buffer) handleLine(buffer)
    return { content, usage }
  }

  private transportError(err: unknown, abortReason: string | null): LlmApiError {
    if (err instanceof LlmApiError) return err
    if (abortReason) return new LlmApiError(abortReason, null)
    if (err instanceof Error && err.name === 'AbortError') return new LlmApiError(TIMEOUT_MESSAGE, null)
    // e.g. undici's "terminated" when the server drops the connection mid-body.
    return new LlmApiError(err instanceof Error ? err.message : 'Network error', null)
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...init.headers
        },
        signal: controller.signal
      })
      if (!response.ok) throw await this.httpError(response)
      return (await response.json()) as T
    } catch (err) {
      throw this.transportError(err, timedOut ? TIMEOUT_MESSAGE : null)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async httpError(response: Response): Promise<LlmApiError> {
    const { message, type, code } = await this.extractErrorInfo(response)
    // Gemini answers a bad key with 400 "API key not valid" rather than 401 —
    // normalise so Invalid vs Error and INVALID_API_KEY classification work.
    const status =
      this.provider === LlmProvider.GEMINI && response.status === 400 && /api key/i.test(message) ? 401 : response.status
    return new LlmApiError(message, status, type, code, response.status === 429 ? parseRetryAfterMs(response) : null)
  }

  private async extractErrorInfo(response: Response): Promise<{ message: string; type: string | null; code: string | null }> {
    try {
      const raw = (await response.json()) as ApiErrorResponse | ApiErrorResponse[]
      // Gemini sometimes wraps the error object in an array.
      const body = Array.isArray(raw) ? (raw[0] ?? {}) : raw
      return {
        message: body.error?.message ?? `${getProviderLabel(this.provider)} API error (${response.status})`,
        type: body.error?.type ?? null,
        code: body.error?.code ?? null
      }
    } catch {
      return { message: `${getProviderLabel(this.provider)} API error (${response.status})`, type: null, code: null }
    }
  }
}
