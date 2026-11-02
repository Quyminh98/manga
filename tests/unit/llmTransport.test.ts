import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmApiError, LlmClient, isTransientError } from '../../src/main/llm/LlmClient'
import { classifyError } from '../../src/main/pipeline/errorClassification'
import { createDatabase } from '../../src/main/db/client'
import { migration0009ReorderDefaultPrompts } from '../../src/main/db/migrations/0009_reorder_default_prompts'
import { ErrorCode, TaskType } from '../../src/shared/enums'
import { withMinimalThinking } from '../../src/shared/llmProviders'
import {
  LEGACY_DEFAULT_SCENE_GENERATION_PROMPT_V1,
  upgradeLegacyDefaultPrompt
} from '../../src/shared/legacyPrompts'
import {
  DEFAULT_CHARACTER_DETECTION_PROMPT,
  DEFAULT_CHARACTER_GENERATION_PROMPT,
  DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT,
  DEFAULT_SCENE_GENERATION_PROMPT,
  getMissingPlaceholders
} from '../../src/shared/prompts'
import { buildBatchRelevantCharacterSelectorMessages } from '../../src/main/pipeline/selectRelevantCharacters'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const OK = { choices: [{ message: { content: '{"ok":true}' } }] }

// SSE body delivered in the given raw pieces (so a line can be split across chunks).
function sseResponse(pieces: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece))
      controller.close()
    }
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const messages = [{ role: 'user' as const, content: 'Return json' }]

describe('transport retry (Phase 28)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const client = (onCall?: (r: unknown) => void): LlmClient =>
    new LlmClient({ apiKey: 'k', maxTransientRetries: 3, retryBaseDelayMs: 1, onCall })

  it('resends after a dropped connection and logs every attempt', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('terminated')).mockImplementation(async () => jsonResponse(OK))
    const onCall = vi.fn()

    const res = await client(onCall).chat({ model: 'gpt-4o', messages, meta: { projectId: 'p', step: TaskType.GENERATE_SCENE_PROMPT } })

    expect(res.content).toBe('{"ok":true}')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onCall.mock.calls.map((c) => c[0].status)).toEqual(['failed', 'success'])
    expect(onCall.mock.calls[0][0].error).toBe('terminated')
  })

  it('treats a failure while reading the body ("terminated") as a network error and retries it', async () => {
    const broken = {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: null,
      json: () => Promise.reject(new TypeError('terminated'))
    } as unknown as Response
    fetchMock.mockResolvedValueOnce(broken).mockImplementation(async () => jsonResponse(OK))

    await expect(client().chat({ model: 'gpt-4o', messages })).resolves.toMatchObject({ content: '{"ok":true}' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a body-read failure classifies as NETWORK_ERROR (not API_ERROR)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
      json: () => Promise.reject(new TypeError('terminated'))
    } as unknown as Response)

    const err = await new LlmClient({ apiKey: 'k' }).chat({ model: 'gpt-4o', messages }).catch((e) => e)
    expect(err).toBeInstanceOf(LlmApiError)
    expect(err.status).toBeNull()
    expect(classifyError(err).code).toBe(ErrorCode.NETWORK_ERROR)
  })

  it('gives up after maxTransientRetries extra attempts', async () => {
    fetchMock.mockRejectedValue(new TypeError('terminated'))
    const err = await client().chat({ model: 'gpt-4o', messages }).catch((e) => e)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(classifyError(err).code).toBe(ErrorCode.NETWORK_ERROR)
  })

  it.each([401, 402, 400, 422, 404])('does not retry HTTP %i', async (status) => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: { message: 'nope' } }, status))
    await expect(client().chat({ model: 'gpt-4o', messages })).rejects.toBeInstanceOf(LlmApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries 429 and 5xx, using Retry-After when given', async () => {
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ error: { message: 'slow down' } }, 429, { 'Retry-After': '0' }))
      .mockImplementationOnce(async () => jsonResponse({ error: { message: 'boom' } }, 503))
      .mockImplementation(async () => jsonResponse(OK))

    await expect(client().chat({ model: 'gpt-4o', messages })).resolves.toMatchObject({ content: '{"ok":true}' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops retrying once shouldContinue() turns false', async () => {
    fetchMock.mockRejectedValue(new TypeError('terminated'))
    await expect(client().chat({ model: 'gpt-4o', messages, shouldContinue: () => false })).rejects.toBeInstanceOf(LlmApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries an empty answer', async () => {
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ choices: [{ message: { content: '' } }] }))
      .mockImplementation(async () => jsonResponse(OK))
    await expect(client().chat({ model: 'gpt-4o', messages })).resolves.toMatchObject({ content: '{"ok":true}' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('isTransientError covers exactly the resend-worthy cases', () => {
    expect(isTransientError(new LlmApiError('x', null))).toBe(true)
    expect(isTransientError(new LlmApiError('x', 429))).toBe(true)
    expect(isTransientError(new LlmApiError('x', 502))).toBe(true)
    expect(isTransientError(new LlmApiError('x', 401))).toBe(false)
    expect(isTransientError(new Error('parse'))).toBe(false)
  })
})

describe('streaming + request shape (Phase 28)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('DeepSeek: streams, skips keep-alive + reasoning, joins content (even split mid-line), reads usage', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        ': keep-alive\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}],"usage":null}\n\n',
        'data: {"choices":[{"delta":{"content":"{\\"a\\":"}}],"usage":null}\n\nda',
        'ta: {"choices":[{"delta":{"content":"1}"}}],"usage":null}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n'
      ])
    )

    const res = await new LlmClient({ apiKey: 'k', provider: 'deepseek' }).chat({
      model: 'deepseek:deepseek-flash@high',
      messages,
      jsonMode: true
    })

    expect(res.content).toBe('{"a":1}')
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      stream: true,
      stream_options: { include_usage: true },
      response_format: { type: 'json_object' },
      reasoning_effort: 'high'
    })
  })

  it('an error event mid-stream becomes a retryable server error', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: {"error":{"message":"overloaded"}}\n\n']))
    const err = await new LlmClient({ apiKey: 'k', provider: 'deepseek' }).chat({ model: 'deepseek:x', messages }).catch((e) => e)
    expect(err).toBeInstanceOf(LlmApiError)
    expect(err.status).toBe(500)
    expect(isTransientError(err)).toBe(true)
  })

  it('aborts a stalled stream with a TIMEOUT error', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
        }
      })
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    })

    const err = await new LlmClient({ apiKey: 'k', provider: 'gemini', chatIdleTimeoutMs: 30 })
      .chat({ model: 'gemini:gemini-2.5-flash', messages })
      .catch((e) => e)

    expect(err).toBeInstanceOf(LlmApiError)
    expect(err.message).toMatch(/^Request timed out \(no data/)
    expect(classifyError(err).code).toBe(ErrorCode.TIMEOUT)
  })

  it('Vilao stays non-streaming and gets no response_format', async () => {
    fetchMock.mockResolvedValue(jsonResponse(OK))
    await new LlmClient({ apiKey: 'k' }).chat({ model: 'gpt-4o', messages, jsonMode: true })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.stream).toBeUndefined()
    expect(body.response_format).toBeUndefined()
  })

  it('Gemini streams but gets no response_format (json_object not confirmed in its docs)', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"{}"}}]}\n\n', 'data: [DONE]\n\n']))
    await new LlmClient({ apiKey: 'k', provider: 'gemini' }).chat({ model: 'gemini:gemini-2.5-flash', messages, jsonMode: true })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.stream).toBe(true)
    expect(body.response_format).toBeUndefined()
  })

  it('falls back to a plain JSON body when a streaming provider does not stream', async () => {
    fetchMock.mockResolvedValue(jsonResponse(OK))
    const res = await new LlmClient({ apiKey: 'k', provider: 'deepseek' }).chat({ model: 'deepseek:x', messages })
    expect(res.content).toBe('{"ok":true}')
  })
})

describe('withMinimalThinking (Phase 28)', () => {
  it('picks off when available, else low; leaves models without thinking control alone', () => {
    expect(withMinimalThinking('deepseek:deepseek-v4-pro@max')).toBe('deepseek:deepseek-v4-pro@off')
    expect(withMinimalThinking('deepseek:deepseek-flash')).toBe('deepseek:deepseek-flash@off')
    expect(withMinimalThinking('gemini:gemini-2.5-flash@high')).toBe('gemini:gemini-2.5-flash@off')
    expect(withMinimalThinking('gemini:gemini-2.5-pro')).toBe('gemini:gemini-2.5-pro@low')
    expect(withMinimalThinking('gemini:gemini-3-pro-preview@high')).toBe('gemini:gemini-3-pro-preview@low')
    expect(withMinimalThinking('gpt-5.5')).toBe('gpt-5.5')
  })
})

describe('prompt ordering for prefix caching (Phase 28)', () => {
  it('default prompts keep every required placeholder and put the per-request data last', () => {
    expect(getMissingPlaceholders('characterDetection', DEFAULT_CHARACTER_DETECTION_PROMPT)).toEqual([])
    expect(getMissingPlaceholders('characterGeneration', DEFAULT_CHARACTER_GENERATION_PROMPT)).toEqual([])
    expect(getMissingPlaceholders('sceneGeneration', DEFAULT_SCENE_GENERATION_PROMPT)).toEqual([])
    expect(getMissingPlaceholders('sceneGenerationNoCharacters', DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT)).toEqual([])

    expect(DEFAULT_CHARACTER_DETECTION_PROMPT.endsWith('{{TRANSCRIPT}}')).toBe(true)
    expect(DEFAULT_CHARACTER_GENERATION_PROMPT.endsWith('{{CHARACTERS}}')).toBe(true)
    expect(DEFAULT_SCENE_GENERATION_PROMPT.endsWith('{{SRT_TEXT}}')).toBe(true)
    expect(DEFAULT_SCENE_GENERATION_NO_CHARACTERS_PROMPT.endsWith('{{SRT_TEXT}}')).toBe(true)
    // the fixed rules (incl. OUTPUT) now come before any placeholder
    expect(DEFAULT_SCENE_GENERATION_PROMPT.indexOf('OUTPUT:')).toBeLessThan(DEFAULT_SCENE_GENERATION_PROMPT.indexOf('{{'))
  })

  it('selector prompt puts the Character Index before the blocks', () => {
    const [message] = buildBatchRelevantCharacterSelectorMessages(
      [{ blockNumber: 1, srtWithNeighborContext: 'Current SRT: hello' }],
      '@A | hero | tall'
    )
    expect(message.content.indexOf('@A | hero')).toBeLessThan(message.content.indexOf('Current SRT: hello'))
    expect(message.content.trimEnd().endsWith('Current SRT: hello')).toBe(true)
  })

  it('upgradeLegacyDefaultPrompt swaps only an untouched old default', () => {
    expect(upgradeLegacyDefaultPrompt(LEGACY_DEFAULT_SCENE_GENERATION_PROMPT_V1)).toBe(DEFAULT_SCENE_GENERATION_PROMPT)
    expect(upgradeLegacyDefaultPrompt('my custom prompt')).toBe('my custom prompt')
  })

  it('migration 0009 upgrades channels still on the old default and leaves edited ones alone', () => {
    const db = createDatabase(':memory:')
    const now = new Date().toISOString()
    const insert = db.prepare(
      `INSERT INTO channels (
         id, name, avg_characters, variance_percent, fake_duration_sec, selected_model,
         character_detection_prompt, character_generation_prompt, scene_generation_prompt,
         scene_generation_prompt_no_characters, scene_concurrency, scene_batch_size, has_characters,
         created_at, updated_at
       ) VALUES (?, ?, 300, 30, 3, NULL, 'd {{TRANSCRIPT}}', 'g {{CHARACTERS}}', ?, 'n', 4, 10, 1, ?, ?)`
    )
    insert.run('old', 'Old default', LEGACY_DEFAULT_SCENE_GENERATION_PROMPT_V1, now, now)
    insert.run('custom', 'Custom', 'custom scene prompt', now, now)

    db.exec(migration0009ReorderDefaultPrompts.sql)

    const get = (id: string): string =>
      (db.prepare('SELECT scene_generation_prompt AS p FROM channels WHERE id = ?').get(id) as { p: string }).p
    expect(get('old')).toBe(DEFAULT_SCENE_GENERATION_PROMPT)
    expect(get('custom')).toBe('custom scene prompt')
  })
})
