import { describe, expect, it } from 'vitest'
import { splitTranscriptToSrtBlocks } from '../../src/main/pipeline/splitSrt'

describe('splitTranscriptToSrtBlocks', () => {
  it('returns nothing for an empty transcript', () => {
    expect(splitTranscriptToSrtBlocks('', 300, 30, 3)).toEqual([])
    expect(splitTranscriptToSrtBlocks('   \n\n  ', 300, 30, 3)).toEqual([])
  })

  // variancePercent = 0 collapses min === max === avgCharacters — the old
  // hard-ceiling behavior, exercised throughout this file for cases that
  // want an absolute cap on block length.
  it('gathers sentences up to avgCharacters (variance 0) and assigns sequential fake timeline', () => {
    const transcript =
      'The old lighthouse stood on the cliff. Waves crashed below it every night. ' +
      'A young keeper watched the horizon. He dreamed of the sea beyond the fog.'

    const blocks = splitTranscriptToSrtBlocks(transcript, 60, 0, 3)

    expect(blocks.length).toBeGreaterThan(1)

    // block_index continuous from 1, fake timeline per spec.md 11.4:
    // start = (index-1)*duration, end = index*duration.
    blocks.forEach((block, i) => {
      expect(block.blockIndex).toBe(i + 1)
      expect(block.startMs).toBe(i * 3000)
      expect(block.endMs).toBe((i + 1) * 3000)
      expect(block.characterCount).toBe(block.text.length)
      expect(block.text.length).toBeLessThanOrEqual(60)
    })

    // Sentences stay intact and in order — joining all block text should
    // reproduce every sentence fragment of the source transcript.
    const joined = blocks.map((b) => b.text).join(' ')
    expect(joined).toContain('The old lighthouse stood on the cliff.')
    expect(joined).toContain('He dreamed of the sea beyond the fog.')
  })

  it('does not split a block whose next sentence would push it over the limit (variance 0) — the oversized sentence becomes its own block instead', () => {
    // "Short one." + " Also short." fit together under max=30. The third
    // sentence alone is 44 chars, already over max — kept whole as its own
    // oversized block (2026-08-11 rule: never split mid-sentence) rather
    // than merged in or chopped up to fit.
    const transcript = 'Short one. Also short. This third sentence is much too long to fit.'
    const blocks = splitTranscriptToSrtBlocks(transcript, 30, 0, 3)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe('Short one. Also short.')
    expect(blocks[1].text).toBe('This third sentence is much too long to fit.')
  })

  // 2026-08-11 — mandatory rule per user request: never cut before a
  // sentence actually ends (via . ? ! …). Used to prefer breaking an
  // over-long single sentence at ; then : then , then whitespace — now it's
  // kept whole as one standalone oversized block instead, however long it is.
  it('never cuts a single sentence at ; : , — keeps it as one oversized block until it actually ends', () => {
    const sentence =
      'First clause here is long; second clause continues further: and a third, shorter part, wraps it up now.'
    const blocks = splitTranscriptToSrtBlocks(sentence, 40, 0, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe(sentence)
    expect(blocks[0].characterCount).toBeGreaterThan(40)
  })

  it('never hard-cuts mid-word either — an unbreakable run with no whitespace still stays one block until its sentence ends', () => {
    const unbreakable = 'x'.repeat(50)
    const blocks = splitTranscriptToSrtBlocks(`${unbreakable}.`, 20, 0, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe(`${unbreakable}.`)
    expect(blocks[0].characterCount).toBe(51)
  })

  it('treats line breaks as sentence boundaries alongside . ? ! …', () => {
    const transcript = 'First line here\nSecond line follows?\nThird line ends the thought…'
    const blocks = splitTranscriptToSrtBlocks(transcript, 200, 0, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('First line here Second line follows? Third line ends the thought…')
  })

  // Phase 18 (user request) — "average ± variance%" instead of a hard
  // ceiling, so a block doesn't get flushed too short just because the next
  // sentence doesn't fit under a strict max.
  describe('average ± variance% (Phase 18)', () => {
    it('keeps blocks within [avg-variance%, avg+variance%] in the normal case', () => {
      const transcript =
        'Alpha sentence here now. Beta sentence follows soon. Gamma sentence arrives next. ' +
        'Delta sentence closes it. Epsilon sentence starts fresh. Zeta sentence wraps this up nicely today.'
      const avg = 50
      const variance = 30
      const min = Math.round(avg * 0.7)
      const max = Math.round(avg * 1.3)

      const blocks = splitTranscriptToSrtBlocks(transcript, avg, variance, 3)

      expect(blocks.length).toBeGreaterThan(1)
      // Every block except possibly the last (trailing remainder) should sit
      // inside the soft range — the splitter only overshoots max when it's
      // still under min, so any block under min here would be a real bug.
      for (const block of blocks.slice(0, -1)) {
        expect(block.characterCount).toBeGreaterThanOrEqual(min)
        expect(block.characterCount).toBeLessThanOrEqual(max)
      }
    })

    it('allows a block to overshoot the upper bound rather than flush a too-short block', () => {
      // avg=100, variance=30 -> min=70, max=130. First sentence is 65 chars
      // (under min). The next sentence is 60 chars, which would make the
      // block 65+1+60=126 (still <= max, unremarkable) — so use a longer
      // second sentence that pushes candidateLength past max (130) while the
      // block is still under min, forcing the "reach min first" rule to fire.
      const first = 'A'.repeat(65)
      const second = 'B'.repeat(90)
      const third = 'C'.repeat(40)
      const transcript = `${first}. ${second}. ${third}.`

      const blocks = splitTranscriptToSrtBlocks(transcript, 100, 30, 3)

      // First block = first + second (65 + 1 + 91 = 157 > max=130), accepted
      // anyway because 65 < min=70. Reassembling recovers every character.
      expect(blocks[0].characterCount).toBeGreaterThan(130)
      expect(blocks.map((b) => b.text).join(' ')).toContain('A'.repeat(65))
      expect(blocks.map((b) => b.text).join(' ')).toContain('B'.repeat(90))
    })

    it('keeps a single sentence longer than the upper bound as one standalone oversized block instead of splitting it', () => {
      const longSentence = 'word '.repeat(60).trim() + '.'
      const blocks = splitTranscriptToSrtBlocks(longSentence, 50, 20, 3)

      const max = Math.round(50 * 1.2)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].text).toBe(longSentence)
      expect(blocks[0].characterCount).toBeGreaterThan(max)
    })

    it('variance 0 degrades to the exact old hard-ceiling behavior for sentence grouping (oversized single sentences are never split, regardless of variance)', () => {
      const transcript = 'Short one. Also short. This third sentence is much too long to fit.'
      const blocks = splitTranscriptToSrtBlocks(transcript, 30, 0, 3)

      expect(blocks).toHaveLength(2)
      expect(blocks[0].text).toBe('Short one. Also short.')
      expect(blocks[0].characterCount).toBeLessThanOrEqual(30)
      expect(blocks[1].text).toBe('This third sentence is much too long to fit.')
    })
  })
})

// avgCharacters/bounds must mean "visible characters", consistently across
// scripts — not raw JS UTF-16 code units, which over-count decomposed
// Vietnamese diacritics and surrogate-pair characters (rare kanji, emoji).
describe('splitTranscriptToSrtBlocks — multilingual character counting', () => {
  const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const graphemeCount = (text: string): number => Array.from(graphemeSegmenter.segment(text)).length

  it('normalizes Vietnamese NFD (decomposed) diacritics before counting', () => {
    const nfc = 'Tiếng Việt rất đẹp'
    const nfd = nfc.normalize('NFD')
    // Decomposed form has more UTF-16 code units than visible characters —
    // exactly the case that would previously inflate character_count.
    expect(nfd.length).toBeGreaterThan(nfc.length)
    expect(nfd.length).not.toBe(graphemeCount(nfc))

    const blocks = splitTranscriptToSrtBlocks(nfd, 200, 0, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe(nfc) // re-composed to NFC in the output
    expect(blocks[0].characterCount).toBe(graphemeCount(nfc))
  })

  it('keeps an oversized Vietnamese run as one block (no mid-character hard-cut) and still counts/recomposes it correctly', () => {
    const decomposedRun = 'é'.repeat(60) // decomposed "é" x60, no spaces/punctuation to break on
    const composedChar = 'é'.normalize('NFC') // "é"

    const blocks = splitTranscriptToSrtBlocks(decomposedRun, 10, 0, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe(composedChar.repeat(60))
    expect(blocks[0].characterCount).toBe(60)
  })

  it('counts Japanese and Korean text by visible character, not UTF-16 code units', () => {
    const japanese = '灯台は崖の上に百年間立っていた。'
    const korean = '오래된 등대가 절벽 위에 백 년 동안 서 있었다.'

    const blocks = splitTranscriptToSrtBlocks(`${japanese}\n${korean}`, 200, 0, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].characterCount).toBe(graphemeCount(blocks[0].text))
    // Common JP/KR characters are single BMP code units, so this happens to
    // equal text.length too — the real guarantee is the line above, which
    // holds even when that's no longer true (see the surrogate-pair test).
    expect(blocks[0].characterCount).toBe(blocks[0].text.length)
  })

  it('keeps an oversized run of surrogate-pair characters (rare kanji outside the BMP) as one block, correctly counted', () => {
    const rareKanji = '𠮟' // U+20B9F — 2 UTF-16 code units, 1 grapheme
    const run = rareKanji.repeat(30)

    const blocks = splitTranscriptToSrtBlocks(run, 10, 0, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe(run)
    expect(blocks[0].characterCount).toBe(30)
  })
})
