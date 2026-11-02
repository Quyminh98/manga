// Pure, non-LLM SRT splitter — spec.md 11.1-11.4. No Electron/DB imports so
// it's directly unit-testable (tests/unit/srtSplitter.test.ts).

export interface SplitSrtBlock {
  blockIndex: number
  startMs: number
  endMs: number
  text: string
  characterCount: number
}

const SENTENCE_DELIMITERS = /[^.?!…]+[.?!…]+|[^.?!…]+$/g

// `avgCharacters`/bounds below must mean "user-visible characters"
// consistently across scripts (Vietnamese diacritics, Japanese/Korean,
// emoji), not raw JS UTF-16 code units — `.length`/`.slice()` would
// over-count decomposed Vietnamese diacritics (NFD) and can slice through a
// surrogate pair or a combining mark, corrupting a character at the cut
// point. Intl.Segmenter's grapheme granularity gives the actual
// rendered-character boundaries, so every length check / slice below goes
// through grapheme arrays instead.
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function toGraphemes(text: string): string[] {
  return Array.from(GRAPHEME_SEGMENTER.segment(text), (s) => s.segment)
}

function graphemeLength(text: string): number {
  return toGraphemes(text).length
}

// spec.md 11.1: split on . ? ! … and line breaks first, keeping sentences
// whole wherever possible. Delimiters are plain ASCII code points that never
// appear as part of a combining-mark grapheme cluster, so matching on raw
// code units here can't split a character in half — only the length/slice
// operations below need grapheme awareness.
function segmentSentences(transcript: string): string[] {
  const sentences: string[] = []
  for (const line of transcript.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue
    const matches = trimmedLine.match(SENTENCE_DELIMITERS) ?? []
    for (const match of matches) {
      const sentence = match.trim()
      if (sentence) sentences.push(sentence)
    }
  }
  return sentences
}

// spec.md 11.2: greedily gather sentences into a block. Normally stops as
// soon as the next sentence would push the block past `max` — but if the
// block hasn't reached `min` yet, the next sentence is added anyway even if
// that overshoots `max`, rather than flushing a too-short block (user
// request, Phase 18: "average ± variance%" instead of a hard ceiling — a
// block only overshoots when the alternative is ending up well under the
// target average). `min < max` guards the override — at `min === max`
// (variancePercent = 0) there's no real range to "reach", so this degrades
// to the old hard-ceiling behavior exactly. Without that guard, `currentLength
// < min` would be true on almost every step (since `min` then equals the
// single point `avgCharacters`, which a growing block only ever equals
// exactly by coincidence), forcing every unit to merge into one giant block
// regardless of `max` — a real bug caught by tests/unit/srtSplitter.test.ts's
// variance-0 cases.
//
// A single sentence longer than `max` on its own (2026-08-11, user request —
// mandatory rule: never cut before a sentence actually ends) is never split
// mid-sentence — it becomes its own oversized block instead. That's what the
// `!current` branch guarantees below: a brand-new block always accepts its
// first sentence regardless of length, and the very next sentence then can't
// fit either (candidateLength > max, currentLength already >= max >= min so
// the "reach min" override can't fire), so it gets flushed as a standalone
// block before starting the next one.
function gatherBlocks(units: string[], min: number, max: number): string[] {
  const blocks: string[] = []
  let current = ''
  let currentLength = 0

  for (const unit of units) {
    const unitLength = graphemeLength(unit)
    const candidateLength = current ? currentLength + 1 + unitLength : unitLength // +1 = joining space
    if (!current || candidateLength <= max || (currentLength < min && min < max)) {
      current = current ? `${current} ${unit}` : unit
      currentLength = candidateLength
    } else {
      blocks.push(current)
      current = unit
      currentLength = unitLength
    }
  }
  if (current) blocks.push(current)

  return blocks
}

export function splitTranscriptToSrtBlocks(
  transcript: string,
  avgCharacters: number,
  variancePercent: number,
  fakeDurationSec: number
): SplitSrtBlock[] {
  const min = Math.max(1, Math.round(avgCharacters * (1 - variancePercent / 100)))
  const max = Math.round(avgCharacters * (1 + variancePercent / 100))

  // NFC first: text pasted from macOS/PDF sources is often NFD (diacritics
  // as separate combining marks), which would otherwise inflate Vietnamese
  // character counts before grapheme segmentation even runs.
  const sentences = segmentSentences(transcript.normalize('NFC'))
  const blocks = gatherBlocks(sentences, min, max)
  const durationMs = fakeDurationSec * 1000

  return blocks.map((text, i) => {
    const blockIndex = i + 1
    return {
      blockIndex,
      startMs: (blockIndex - 1) * durationMs,
      endMs: blockIndex * durationMs,
      text,
      characterCount: graphemeLength(text)
    }
  })
}
