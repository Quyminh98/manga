// Shared "thử repair tối thiểu" step (spec.md 14) — every pipeline step that
// parses a JSON response from Vilao (Character Detection, Character Prompt
// Generation, and Scene Generation from Phase 8 on) strips common wrapping
// the model might add (markdown code fences, leading/trailing prose) before
// re-attempting JSON.parse. Anything beyond this counts as unrecoverable and
// the caller retries the whole request.
export function repairJsonText(raw: string): string {
  let text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) text = fenced[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1)
  }
  return text
}
