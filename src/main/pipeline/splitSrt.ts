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
// Priority order for splitting a single sentence that's already longer than
// maxCharacters (spec.md 11.3): ; then : then , then nearest whitespace.
const OVERSIZED_SPLIT_CHARS = [';', ':', ',']

// `maxCharacters` must mean "user-visible characters" consistently across
// scripts (Vietnamese diacritics, Japanese/Korean, emoji), not raw JS
// UTF-16 code units — `.length`/`.slice()` would over-count decomposed
// Vietnamese diacritics (NFD) and can slice through a surrogate pair or a
// combining mark, corrupting a character at the cut point. Intl.Segmenter's
// grapheme granularity gives the actual rendered-character boundaries, so
// every length check / slice below goes through grapheme arrays instead.
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

// spec.md 11.3: a single sentence longer than maxCharacters gets broken into
// chunks, each ≤ maxCharacters, preferring ; then : then , then whitespace
// nearest the limit — hard-cutting mid-word only when nothing else fits.
// Operates on grapheme-cluster arrays throughout so a hard-cut lands between
// characters, never inside one (e.g. a Vietnamese base letter + diacritic,
// or a surrogate-pair kanji/emoji).
function splitOversizedSentence(sentence: string, maxCharacters: number): string[] {
  const chunks: string[] = []
  let remaining = toGraphemes(sentence.trim())

  while (remaining.length > maxCharacters) {
    const window = remaining.slice(0, maxCharacters)
    let cutIndex = -1

    for (const breakChar of OVERSIZED_SPLIT_CHARS) {
      const idx = window.lastIndexOf(breakChar)
      if (idx > 0) {
        cutIndex = idx + 1 // keep the punctuation with the chunk it closes
        break
      }
    }

    if (cutIndex === -1) {
      const idx = window.lastIndexOf(' ')
      if (idx > 0) cutIndex = idx
    }

    if (cutIndex === -1) cutIndex = maxCharacters // hard-cut, last resort

    const chunk = remaining.slice(0, cutIndex).join('').trim()
    if (chunk) chunks.push(chunk)
    remaining = toGraphemes(remaining.slice(cutIndex).join('').trim())
  }

  const tail = remaining.join('').trim()
  if (tail) chunks.push(tail)
  return chunks
}

// spec.md 11.2: greedily gather units (sentences, or oversized-sentence
// chunks) until the next one would push the block past maxCharacters
// (measured in graphemes, matching splitOversizedSentence/maxCharacters).
function gatherBlocks(units: string[], maxCharacters: number): string[] {
  const blocks: string[] = []
  let current = ''
  let currentLength = 0

  for (const unit of units) {
    const unitLength = graphemeLength(unit)
    const candidateLength = current ? currentLength + 1 + unitLength : unitLength // +1 = joining space
    if (candidateLength <= maxCharacters) {
      current = current ? `${current} ${unit}` : unit
      currentLength = candidateLength
    } else {
      if (current) blocks.push(current)
      current = unit
      currentLength = unitLength
    }
  }
  if (current) blocks.push(current)

  return blocks
}

export function splitTranscriptToSrtBlocks(
  transcript: string,
  maxCharacters: number,
  fakeDurationSec: number
): SplitSrtBlock[] {
  // NFC first: text pasted from macOS/PDF sources is often NFD (diacritics
  // as separate combining marks), which would otherwise inflate Vietnamese
  // character counts before grapheme segmentation even runs.
  const sentences = segmentSentences(transcript.normalize('NFC'))
  const units = sentences.flatMap((sentence) =>
    graphemeLength(sentence) <= maxCharacters ? [sentence] : splitOversizedSentence(sentence, maxCharacters)
  )
  const blocks = gatherBlocks(units, maxCharacters)
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
