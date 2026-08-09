import { describe, expect, it } from 'vitest'
import { splitTranscriptToSrtBlocks } from '../../src/main/pipeline/splitSrt'

describe('splitTranscriptToSrtBlocks', () => {
  it('returns nothing for an empty transcript', () => {
    expect(splitTranscriptToSrtBlocks('', 300, 3)).toEqual([])
    expect(splitTranscriptToSrtBlocks('   \n\n  ', 300, 3)).toEqual([])
  })

  it('gathers sentences up to maxCharacters and assigns sequential fake timeline', () => {
    const transcript =
      'The old lighthouse stood on the cliff. Waves crashed below it every night. ' +
      'A young keeper watched the horizon. He dreamed of the sea beyond the fog.'

    const blocks = splitTranscriptToSrtBlocks(transcript, 60, 3)

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

  it('does not split a block whose next sentence would push it over the limit', () => {
    // "Short one." (11) + " Also short." (13) = 24 <= 30, fits together.
    // Adding "This third sentence is much too long to fit." would overflow.
    const transcript = 'Short one. Also short. This third sentence is much too long to fit.'
    const blocks = splitTranscriptToSrtBlocks(transcript, 30, 3)

    expect(blocks[0].text).toBe('Short one. Also short.')
    expect(blocks.every((b) => b.text.length <= 30)).toBe(true)
  })

  it('splits an over-long single sentence on ; then : then , before falling back to whitespace', () => {
    const sentence =
      'First clause here is long; second clause continues further: and a third, shorter part, wraps it up now.'
    const blocks = splitTranscriptToSrtBlocks(sentence, 40, 3)

    expect(blocks.length).toBeGreaterThan(1)
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(40)
    }
    // Prefers breaking right after the semicolon over a mid-clause word wrap.
    expect(blocks[0].text.startsWith('First clause here is long;')).toBe(true)
  })

  it('hard-cuts only when no delimiter or whitespace is available within the limit', () => {
    const unbreakable = 'x'.repeat(50)
    const blocks = splitTranscriptToSrtBlocks(`${unbreakable}.`, 20, 3)

    expect(blocks.length).toBeGreaterThan(1)
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(20)
    }
    // Reassembling the hard-cut chunks recovers the original run of characters.
    expect(blocks.map((b) => b.text).join('')).toBe(`${unbreakable}.`)
  })

  it('treats line breaks as sentence boundaries alongside . ? ! …', () => {
    const transcript = 'First line here\nSecond line follows?\nThird line ends the thought…'
    const blocks = splitTranscriptToSrtBlocks(transcript, 200, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('First line here Second line follows? Third line ends the thought…')
  })
})

// maxCharacters must mean "visible characters", consistently across scripts —
// not raw JS UTF-16 code units, which over-count decomposed Vietnamese
// diacritics and surrogate-pair characters (rare kanji, emoji).
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

    const blocks = splitTranscriptToSrtBlocks(nfd, 200, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe(nfc) // re-composed to NFC in the output
    expect(blocks[0].characterCount).toBe(graphemeCount(nfc))
  })

  it('hard-cuts Vietnamese text without breaking a base letter from its diacritic', () => {
    const decomposedRun = 'é'.repeat(60) // decomposed "é" x60, no spaces/punctuation to break on
    const composedChar = 'é'.normalize('NFC') // "é"

    const blocks = splitTranscriptToSrtBlocks(decomposedRun, 10, 3)

    const rejoined = blocks.map((b) => b.text).join('')
    expect(rejoined).toBe(composedChar.repeat(60))
    for (const block of blocks) {
      expect(block.characterCount).toBeLessThanOrEqual(10)
      // Every character is the fully composed "é" — a mid-character hard-cut
      // would leave a bare "e" or a lone combining accent here instead.
      expect(block.text).toBe(composedChar.repeat(block.characterCount))
    }
  })

  it('counts Japanese and Korean text by visible character, not UTF-16 code units', () => {
    const japanese = '灯台は崖の上に百年間立っていた。'
    const korean = '오래된 등대가 절벽 위에 백 년 동안 서 있었다.'

    const blocks = splitTranscriptToSrtBlocks(`${japanese}\n${korean}`, 200, 3)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].characterCount).toBe(graphemeCount(blocks[0].text))
    // Common JP/KR characters are single BMP code units, so this happens to
    // equal text.length too — the real guarantee is the line above, which
    // holds even when that's no longer true (see the surrogate-pair test).
    expect(blocks[0].characterCount).toBe(blocks[0].text.length)
  })

  it('hard-cuts around surrogate-pair characters (rare kanji outside the BMP) without corrupting them', () => {
    const rareKanji = '𠮟' // U+20B9F — 2 UTF-16 code units, 1 grapheme
    const run = rareKanji.repeat(30)

    const blocks = splitTranscriptToSrtBlocks(run, 10, 3)

    const rejoined = blocks.map((b) => b.text).join('')
    expect(rejoined).toBe(run)
    for (const block of blocks) {
      expect(block.characterCount).toBeLessThanOrEqual(10)
      // No lone surrogate half — every character in the block is the same whole glyph.
      expect(block.text).toBe(rareKanji.repeat(block.characterCount))
    }
  })
})
