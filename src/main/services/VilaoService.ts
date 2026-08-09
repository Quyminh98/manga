import type { ModelInfo } from '@shared/entities'

// Vilao AI docs (api.vilao.ai/docs — API Reference): base URL + OpenAI-compatible
// endpoint shapes. GET /models -> { object: "list", data: [{ id, object, created,
// owned_by }] }. Bearer auth. Errors -> { error: { message, type, code } }.
export const VILAO_BASE_URL = 'https://api.vilao.ai/v1'

// `status` is the HTTP status code (null for network/timeout failures with no
// response) — callers use it to tell "invalid API key" (401) apart from
// everything else, per spec.md 5.1's Invalid/Error distinction. `apiErrorType`/
// `apiErrorCode` are Vilao's own `error.type`/`error.code` fields (OpenAI-
// compatible shape) when the response body had them — used by
// pipeline/errorClassification.ts (Phase 12, spec.md 34) to tell
// MODEL_NOT_AVAILABLE/CONTEXT_TOO_LARGE apart from a generic API_ERROR beyond
// what the HTTP status code alone can distinguish.
export class VilaoApiError extends Error {
  readonly status: number | null
  readonly apiErrorType: string | null
  readonly apiErrorCode: string | null

  constructor(message: string, status: number | null, apiErrorType: string | null = null, apiErrorCode: string | null = null) {
    super(message)
    this.name = 'VilaoApiError'
    this.status = status
    this.apiErrorType = apiErrorType
    this.apiErrorCode = apiErrorCode
  }
}

export interface VilaoServiceOptions {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
}

interface VilaoModelsResponse {
  object: string
  data: Array<{ id: string }>
}

interface VilaoErrorResponse {
  error?: { message?: string; type?: string; code?: string }
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
}

export interface LlmResponse {
  content: string
}

interface VilaoChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}

// No electron import — constructed with an already-decrypted API key so it's
// usable both from the real app (main/ipc/vilao.ipc.ts, main/ipc/projects.ipc.ts
// read the key via SecureStorageService first) and directly in unit tests
// (mocked global fetch).
export class VilaoService {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(options: VilaoServiceOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? VILAO_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 15000
  }

  // Thin boolean wrapper matching spec.md 5.2's `testConnection(): Promise<boolean>`.
  // The IPC layer calls listModels() directly instead, since it needs the
  // VilaoApiError status code to distinguish Invalid (401) from Error (everything else).
  async testConnection(): Promise<boolean> {
    try {
      await this.listModels()
      return true
    } catch {
      return false
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const body = await this.request<VilaoModelsResponse>('/models', { method: 'GET' })
    return body.data.map((model) => ({ id: model.id, name: model.id }))
  }

  // POST /chat/completions (OpenAI-compatible, spec.md 5.2). Used from Phase 6
  // on by pipeline steps that call the LLM (DETECT_CHARACTERS/
  // GENERATE_CHARACTER_PROMPTS/GENERATE_SCENE_PROMPT) — callers own retry/
  // repair logic (see src/main/pipeline/*), this just makes the request and
  // extracts the text.
  async chat(request: LlmRequest): Promise<LlmResponse> {
    const body = await this.request<VilaoChatCompletionsResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {})
      })
    })

    const content = body.choices?.[0]?.message?.content
    if (!content || !content.trim()) {
      throw new VilaoApiError('Vilao returned an empty response', null)
    }
    return { content }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...init.headers
        },
        signal: controller.signal
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new VilaoApiError('Request timed out', null)
      }
      throw new VilaoApiError(err instanceof Error ? err.message : 'Network error', null)
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const { message, type, code } = await this.extractErrorInfo(response)
      throw new VilaoApiError(message, response.status, type, code)
    }

    return (await response.json()) as T
  }

  private async extractErrorInfo(response: Response): Promise<{ message: string; type: string | null; code: string | null }> {
    try {
      const body = (await response.json()) as VilaoErrorResponse
      return {
        message: body.error?.message ?? `Vilao API error (${response.status})`,
        type: body.error?.type ?? null,
        code: body.error?.code ?? null
      }
    } catch {
      return { message: `Vilao API error (${response.status})`, type: null, code: null }
    }
  }
}
