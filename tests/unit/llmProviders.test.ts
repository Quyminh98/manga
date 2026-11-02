import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildThinkingParams,
  formatModelDisplay,
  formatModelRef,
  getThinkingOptions,
  parseModelRef,
  stripThinking
} from '../../src/shared/llmProviders'
import { LlmApiError, LlmClient } from '../../src/main/llm/LlmClient'
import { classifyError } from '../../src/main/pipeline/errorClassification'
import { ErrorCode } from '../../src/shared/enums'
import { validateProjectForRun } from '../../src/shared/validateRun'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('model refs', () => {
  it('treats an un-prefixed id as Vilao (back-compat with pre-Phase 25 data)', () => {
    expect(parseModelRef('gpt-5.5')).toEqual({ provider: 'vilao', modelId: 'gpt-5.5' })
    expect(parseModelRef('')).toEqual({ provider: 'vilao', modelId: '' })
  })

  it('parses provider-prefixed ids', () => {
    expect(parseModelRef('deepseek:deepseek-chat')).toEqual({ provider: 'deepseek', modelId: 'deepseek-chat' })
    expect(parseModelRef('gemini:gemini-2.5-flash')).toEqual({ provider: 'gemini', modelId: 'gemini-2.5-flash' })
  })

  it('does not misread an unknown prefix or a ":" in a Vilao id', () => {
    expect(parseModelRef('foo:bar')).toEqual({ provider: 'vilao', modelId: 'foo:bar' })
    expect(parseModelRef('vilao:x')).toEqual({ provider: 'vilao', modelId: 'vilao:x' })
  })

  it('formatModelRef round-trips and leaves Vilao ids bare', () => {
    expect(formatModelRef('vilao', 'gpt-5.5')).toBe('gpt-5.5')
    expect(parseModelRef(formatModelRef('gemini', 'gemini-2.5-pro'))).toEqual({
      provider: 'gemini',
      modelId: 'gemini-2.5-pro'
    })
    expect(formatModelDisplay('deepseek:deepseek-chat')).toBe('deepseek-chat (DeepSeek)')
    expect(formatModelDisplay('gpt-5.5')).toBe('gpt-5.5')
  })
})

describe('LlmClient with other providers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DeepSeek: uses its base URL and returns channel-format model ids', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ object: 'list', data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }))

    const models = await new LlmClient({ apiKey: 'sk-ds', provider: 'deepseek' }).listModels()

    expect(models).toEqual([
      { id: 'deepseek:deepseek-chat', name: 'deepseek-chat' },
      { id: 'deepseek:deepseek-reasoner', name: 'deepseek-reasoner' }
    ])
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/models')
  })

  it('Gemini: strips "models/" and keeps only chat models', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        object: 'list',
        data: [
          { id: 'models/gemini-2.5-flash' },
          { id: 'models/gemini-embedding-001' },
          { id: 'models/gemini-2.5-flash-image' },
          { id: 'models/imagen-4.0-generate-001' }
        ]
      })
    )

    const models = await new LlmClient({ apiKey: 'k', provider: 'gemini' }).listModels()

    expect(models).toEqual([{ id: 'gemini:gemini-2.5-flash', name: 'gemini-2.5-flash' }])
    expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models')
  })

  it('chat() sends the bare model id even when the channel stores "<provider>:<id>"', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))

    await new LlmClient({ apiKey: 'sk-ds', provider: 'deepseek' }).chat({
      model: 'deepseek:deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }]
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(JSON.parse(init.body).model).toBe('deepseek-chat')
  })

  it('Gemini: a 400 "API key not valid" is normalised to 401 (Invalid)', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }], 400))

    const err = await new LlmClient({ apiKey: 'bad', provider: 'gemini' }).listModels().catch((e) => e)

    expect(err).toBeInstanceOf(LlmApiError)
    expect(err.status).toBe(401)
    expect(err.message).toContain('API key not valid')
    expect(classifyError(err).code).toBe(ErrorCode.INVALID_API_KEY)
  })

  it('Gemini: other 400s are left alone', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Bad request body' } }, 400))

    const err = await new LlmClient({ apiKey: 'k', provider: 'gemini' }).listModels().catch((e) => e)

    expect(err.status).toBe(400)
  })

  it('DeepSeek: 401 stays 401 and 402 surfaces its message as a generic API error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Authentication Fails' } }, 401))
    const invalid = await new LlmClient({ apiKey: 'bad', provider: 'deepseek' }).listModels().catch((e) => e)
    expect(invalid.status).toBe(401)

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Insufficient Balance' } }, 402))
    const noBalance = await new LlmClient({ apiKey: 'k', provider: 'deepseek' }).listModels().catch((e) => e)
    expect(noBalance.status).toBe(402)
    expect(classifyError(noBalance)).toEqual({ code: ErrorCode.API_ERROR, message: 'Insufficient Balance' })
  })

  it('names the right provider in an empty-response error and classifies it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '  ' } }] }))

    const err = await new LlmClient({ apiKey: 'k', provider: 'gemini' })
      .chat({ model: 'gemini:gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] })
      .catch((e) => e)

    expect(err.message).toBe('Gemini returned an empty response')
    expect(classifyError(err).code).toBe(ErrorCode.EMPTY_RESPONSE)
  })
})

describe('validateProjectForRun with providers', () => {
  const project = { transcript: 'text', avgCharacters: 300, hasCharacters: false }
  const prompts = { characterDetection: '', characterGeneration: '', sceneGeneration: '' }

  it('names the provider of the selected model when its key is missing', () => {
    expect(validateProjectForRun(project, prompts, false, 'deepseek:deepseek-chat')).toBe(
      'Configure and save a DeepSeek API key in Settings > API Keys first.'
    )
    expect(validateProjectForRun(project, prompts, false, 'gemini:gemini-2.5-flash')).toContain('Gemini')
    expect(validateProjectForRun(project, prompts, false, 'gpt-5.5')).toContain('Vilao')
    expect(validateProjectForRun(project, prompts, false, null)).toContain('Vilao')
  })
})

describe('thinking level', () => {
  it('parses and formats the @level suffix without touching the model id', () => {
    expect(parseModelRef('deepseek:deepseek-flash@high')).toEqual({ provider: 'deepseek', modelId: 'deepseek-flash', thinking: 'high' })
    expect(parseModelRef('gemini:gemini-2.5-flash@off')).toEqual({ provider: 'gemini', modelId: 'gemini-2.5-flash', thinking: 'off' })
    expect(formatModelRef('deepseek', 'deepseek-flash', 'max')).toBe('deepseek:deepseek-flash@max')
    expect(stripThinking('deepseek:deepseek-flash@max')).toBe('deepseek:deepseek-flash')
    expect(formatModelDisplay('deepseek:deepseek-flash@high')).toBe('deepseek-flash (DeepSeek · thinking high)')
  })

  it('ignores an unknown suffix', () => {
    expect(parseModelRef('gpt-5@beta')).toEqual({ provider: 'vilao', modelId: 'gpt-5@beta' })
  })

  it('offers levels per provider/model; Vilao has none', () => {
    expect(getThinkingOptions('vilao', 'gpt-5.5')).toEqual([])
    expect(getThinkingOptions('deepseek', 'deepseek-v4-pro')).toEqual(['off', 'low', 'high', 'max'])
    expect(getThinkingOptions('gemini', 'gemini-2.5-flash')).toContain('off')
    expect(getThinkingOptions('gemini', 'gemini-2.5-pro')).not.toContain('off')
    expect(getThinkingOptions('gemini', 'gemini-3-pro-preview')).toEqual(['low', 'high'])
    expect(getThinkingOptions('gemini', 'gemma-3')).toEqual([])
  })

  it('builds the provider-specific request params', () => {
    expect(buildThinkingParams('deepseek', 'deepseek-flash', 'off')).toEqual({ thinking: { type: 'disabled' } })
    expect(buildThinkingParams('deepseek', 'deepseek-flash', 'max')).toEqual({ reasoning_effort: 'max' })
    expect(buildThinkingParams('gemini', 'gemini-2.5-flash', 'off')).toEqual({ reasoning_effort: 'none' })
    expect(buildThinkingParams('gemini', 'gemini-2.5-pro', 'off')).toEqual({})
    expect(buildThinkingParams('gemini', 'gemini-2.5-flash', 'medium')).toEqual({ reasoning_effort: 'medium' })
    expect(buildThinkingParams('vilao', 'gpt-5.5', 'high')).toEqual({})
    expect(buildThinkingParams('deepseek', 'deepseek-flash', undefined)).toEqual({})
  })

  describe('chat() request', () => {
    const fetchMock = vi.fn()
    beforeEach(() => {
      fetchMock.mockReset()
      // fresh Response per call — a body can only be read once
      fetchMock.mockImplementation(async () => jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
      vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => vi.unstubAllGlobals())

    it('sends bare model id + thinking params, and nothing extra without a level', async () => {
      const ds = new LlmClient({ apiKey: 'k', provider: 'deepseek' })
      await ds.chat({ model: 'deepseek:deepseek-flash@high', messages: [{ role: 'user', content: 'x' }] })
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'deepseek-flash', reasoning_effort: 'high' })

      await ds.chat({ model: 'deepseek:deepseek-flash', messages: [{ role: 'user', content: 'x' }] })
      const body = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body.model).toBe('deepseek-flash')
      expect(body.reasoning_effort).toBeUndefined()
      expect(body.thinking).toBeUndefined()
    })
  })
})
