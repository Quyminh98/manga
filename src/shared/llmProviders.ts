// Phase 25 — multi-provider API keys. Shared by Main (which key/base URL a
// run uses) and Renderer (grouping the model dropdown, validation messages),
// same reason validateRun.ts/prompts.ts live in shared/.
//
// A channel's `selected_model` (and a project's `selected_model_snapshot`) stays a
// single string — no schema change. Vilao models are stored bare (exactly as
// before Phase 25, so every existing channel/project keeps working); models of
// other providers are stored as "<provider>:<modelId>", e.g. "deepseek:deepseek-chat".
//
// Thinking level (Phase 26) rides along as an optional "@<level>" suffix on the
// same string, e.g. "deepseek:deepseek-flash@high" — again no schema change; no
// suffix = the model's own default.
export const LlmProvider = {
  VILAO: 'vilao',
  DEEPSEEK: 'deepseek',
  GEMINI: 'gemini'
} as const
export type LlmProvider = (typeof LlmProvider)[keyof typeof LlmProvider]

export const LLM_PROVIDERS: LlmProvider[] = [LlmProvider.VILAO, LlmProvider.DEEPSEEK, LlmProvider.GEMINI]

export interface LlmProviderMeta {
  label: string
  baseUrl: string
  keyPlaceholder: string
  // Phase 28 — only what the provider's own docs confirm: SSE streaming with
  // `stream_options.include_usage`, and `response_format: {type: "json_object"}`.
  supportsStreaming: boolean
  supportsJsonMode: boolean
}

export const LLM_PROVIDER_META: Record<LlmProvider, LlmProviderMeta> = {
  vilao: {
    label: 'Vilao',
    baseUrl: 'https://api.vilao.ai/v1',
    keyPlaceholder: 'sk-vilao-…',
    supportsStreaming: false,
    supportsJsonMode: false
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keyPlaceholder: 'sk-…',
    supportsStreaming: true,
    supportsJsonMode: true
  },
  // Gemini's OpenAI-compatible endpoint (Bearer auth, /models, /chat/completions).
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyPlaceholder: 'AIza…',
    supportsStreaming: true,
    // Gemini's OpenAI-compat docs only show schema-based structured output, not
    // `json_object` — not sent until confirmed.
    supportsJsonMode: false
  }
}

export function isLlmProvider(value: string): value is LlmProvider {
  return (LLM_PROVIDERS as string[]).includes(value)
}

export const ThinkingLevel = {
  OFF: 'off',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  MAX: 'max'
} as const
export type ThinkingLevel = (typeof ThinkingLevel)[keyof typeof ThinkingLevel]

const THINKING_LEVELS = Object.values(ThinkingLevel) as string[]

export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max'
}

export interface ModelRef {
  provider: LlmProvider
  modelId: string
  // undefined = not set (the provider/model default applies).
  thinking?: ThinkingLevel
}

// Only a known non-Vilao provider prefix counts — any other string (including
// Vilao model ids that happen to contain ':') is a bare Vilao model. Likewise
// only a known level after the last '@' counts as a thinking suffix.
export function parseModelRef(value: string): ModelRef {
  let rest = value
  let thinking: ThinkingLevel | undefined
  const at = rest.lastIndexOf('@')
  if (at > 0 && THINKING_LEVELS.includes(rest.slice(at + 1))) {
    thinking = rest.slice(at + 1) as ThinkingLevel
    rest = rest.slice(0, at)
  }

  const sep = rest.indexOf(':')
  if (sep > 0) {
    const prefix = rest.slice(0, sep)
    if (isLlmProvider(prefix) && prefix !== LlmProvider.VILAO) {
      return { provider: prefix, modelId: rest.slice(sep + 1), ...(thinking ? { thinking } : {}) }
    }
  }
  return { provider: LlmProvider.VILAO, modelId: rest, ...(thinking ? { thinking } : {}) }
}

export function formatModelRef(provider: LlmProvider, modelId: string, thinking?: ThinkingLevel): string {
  const base = provider === LlmProvider.VILAO ? modelId : `${provider}:${modelId}`
  return thinking ? `${base}@${thinking}` : base
}

// The same ref without its thinking suffix — what the model dropdown lists.
export function stripThinking(value: string): string {
  const { provider, modelId } = parseModelRef(value)
  return formatModelRef(provider, modelId)
}

// Levels the user may pick for a model (docs: api-docs.deepseek.com thinking_mode,
// ai.google.dev gemini-api openai + thinking). Empty = no thinking control
// (Vilao — its docs don't say, so nothing is sent).
//  - DeepSeek: `thinking` on/off + `reasoning_effort` low/high/max (default: on, high).
//  - Gemini: `reasoning_effort`; "none" (Off) only works on 2.5 models other than Pro;
//    Gemini 3+/4 take levels (3 Pro: low/high only). No "max".
export function getThinkingOptions(provider: LlmProvider, modelId: string): ThinkingLevel[] {
  if (provider === LlmProvider.DEEPSEEK) return ['off', 'low', 'high', 'max']
  if (provider === LlmProvider.GEMINI) {
    const id = modelId.toLowerCase()
    if (/gemini-2\.5/.test(id)) return id.includes('pro') ? ['low', 'medium', 'high'] : ['off', 'low', 'medium', 'high']
    if (/gemini-[34]/.test(id)) return id.includes('pro') ? ['low', 'high'] : ['low', 'medium', 'high']
  }
  return []
}

// Phase 28 — the cheapest thinking setting a model accepts, regardless of the
// channel's own level: for internal classification steps (Relevant Character
// Selection) that gain nothing from deep reasoning. "off" when the model can
// turn thinking off, else "low"; unchanged for models with no thinking control.
export function withMinimalThinking(value: string): string {
  const { provider, modelId } = parseModelRef(value)
  const options = getThinkingOptions(provider, modelId)
  if (options.length === 0) return value
  return formatModelRef(provider, modelId, options.includes('off') ? 'off' : 'low')
}

// Extra top-level request-body fields for the chat/completions call (the
// OpenAI SDK's `extra_body` is merged at the top level too).
export function buildThinkingParams(provider: LlmProvider, modelId: string, thinking?: ThinkingLevel): Record<string, unknown> {
  if (!thinking || !getThinkingOptions(provider, modelId).includes(thinking)) return {}
  if (provider === LlmProvider.DEEPSEEK) {
    return thinking === 'off' ? { thinking: { type: 'disabled' } } : { reasoning_effort: thinking }
  }
  if (provider === LlmProvider.GEMINI) {
    return { reasoning_effort: thinking === 'off' ? 'none' : thinking }
  }
  return {}
}

export function getProviderLabel(provider: LlmProvider): string {
  return LLM_PROVIDER_META[provider].label
}

// "gpt-5.5" for Vilao, "deepseek-flash (DeepSeek · thinking high)" for others — UI display only.
export function formatModelDisplay(value: string): string {
  const { provider, modelId, thinking } = parseModelRef(value)
  const thinkingText = thinking ? `thinking ${thinking}` : ''
  if (provider === LlmProvider.VILAO) return thinkingText ? `${modelId} (${thinkingText})` : modelId
  return `${modelId} (${[getProviderLabel(provider), thinkingText].filter(Boolean).join(' · ')})`
}
