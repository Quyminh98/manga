import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmApiError, LlmClient } from '../../src/main/llm/LlmClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('LlmClient', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listModels() hits GET /models with Bearer auth and maps the response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        object: 'list',
        data: [
          { id: 'gpt-4o', object: 'model', created: 1700000000, owned_by: 'vilao' },
          { id: 'claude-sonnet-4', object: 'model', created: 1700000000, owned_by: 'vilao' }
        ]
      })
    )

    const service = new LlmClient({ apiKey: 'sk-test' })
    const models = await service.listModels()

    expect(models).toEqual([
      { id: 'gpt-4o', name: 'gpt-4o' },
      { id: 'claude-sonnet-4', name: 'claude-sonnet-4' }
    ])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.vilao.ai/v1/models')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
  })

  it('throws LlmApiError with status 401 on an invalid API key', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } }, 401)
    )

    const service = new LlmClient({ apiKey: 'sk-bad' })

    await expect(service.listModels()).rejects.toMatchObject({
      name: 'LlmApiError',
      status: 401,
      message: 'Invalid API key'
    })
  })

  it('throws LlmApiError with status null on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const service = new LlmClient({ apiKey: 'sk-test' })

    await expect(service.listModels()).rejects.toMatchObject({
      name: 'LlmApiError',
      status: null
    })
  })

  it('testConnection() resolves true on success and false on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ object: 'list', data: [] }))
    const ok = await new LlmClient({ apiKey: 'sk-test' }).testConnection()
    expect(ok).toBe(true)

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'nope' } }, 401))
    const bad = await new LlmClient({ apiKey: 'sk-bad' }).testConnection()
    expect(bad).toBe(false)
  })

  it('honors a custom baseUrl and strips trailing slashes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ object: 'list', data: [] }))
    await new LlmClient({ apiKey: 'sk-test', baseUrl: 'https://example.test/v1/' }).listModels()

    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/v1/models')
  })

  it('chat() posts to /chat/completions and extracts the message content', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '{"characters":[]}' } }] })
    )

    const service = new LlmClient({ apiKey: 'sk-test' })
    const response = await service.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })

    expect(response).toEqual({ content: '{"characters":[]}' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.vilao.ai/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })
  })

  it('chat() throws a LlmApiError when the response has no content', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '' } }] }))

    const service = new LlmClient({ apiKey: 'sk-test' })
    await expect(service.chat({ model: 'gpt-4o', messages: [] })).rejects.toMatchObject({
      name: 'LlmApiError',
      message: 'Vilao returned an empty response'
    })
  })
})

describe('LlmApiError', () => {
  it('carries the HTTP status', () => {
    const err = new LlmApiError('boom', 500)
    expect(err.message).toBe('boom')
    expect(err.status).toBe(500)
    expect(err.name).toBe('LlmApiError')
  })
})
