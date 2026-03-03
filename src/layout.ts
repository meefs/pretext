// Text measurement: Intl.Segmenter + canvas measureText + bidi.
// Two-phase: prepare() once per text, layout() is pure arithmetic on resize.

const canvas = typeof OffscreenCanvas !== 'undefined'
  ? new OffscreenCanvas(1, 1)
  : document.createElement('canvas')
const ctx = canvas.getContext('2d')!

// --- Word width cache: font → Map<segment, width> ---

const wordCaches = new Map<string, Map<string, number>>()

function getWordCache(font: string): Map<string, number> {
  let cache = wordCaches.get(font)
  if (!cache) {
    cache = new Map()
    wordCaches.set(font, cache)
  }
  return cache
}

function measureSegment(seg: string, cache: Map<string, number>): number {
  let w = cache.get(seg)
  if (w === undefined) {
    w = ctx.measureText(seg).width
    cache.set(seg, w)
  }
  return w
}

function parseFontSize(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)\s*px/)
  return m ? parseFloat(m[1]!) : 16
}

// --- CJK detection ---

function isCJK(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c >= 0x4E00 && c <= 0x9FFF) ||   // CJK Unified
        (c >= 0x3400 && c <= 0x4DBF) ||   // CJK Extension A
        (c >= 0x3000 && c <= 0x303F) ||   // CJK Punctuation
        (c >= 0x3040 && c <= 0x309F) ||   // Hiragana
        (c >= 0x30A0 && c <= 0x30FF) ||   // Katakana
        (c >= 0xAC00 && c <= 0xD7AF) ||   // Hangul
        (c >= 0xFF00 && c <= 0xFFEF)) {   // Fullwidth
      return true
    }
  }
  return false
}

// --- Bidi character classification (from Unicode/pdf.js) ---

type BidiType = 'L' | 'R' | 'AL' | 'AN' | 'EN' | 'ES' | 'ET' | 'CS' |
                'ON' | 'BN' | 'B' | 'S' | 'WS' | 'NSM'

const baseTypes: BidiType[] = [
  'BN','BN','BN','BN','BN','BN','BN','BN','BN','S','B','S','WS',
  'B','BN','BN','BN','BN','BN','BN','BN','BN','BN','BN','BN','BN',
  'BN','BN','B','B','B','S','WS','ON','ON','ET','ET','ET','ON',
  'ON','ON','ON','ON','ON','CS','ON','CS','ON','EN','EN','EN',
  'EN','EN','EN','EN','EN','EN','EN','ON','ON','ON','ON','ON',
  'ON','ON','L','L','L','L','L','L','L','L','L','L','L','L','L',
  'L','L','L','L','L','L','L','L','L','L','L','L','L','ON','ON',
  'ON','ON','ON','ON','L','L','L','L','L','L','L','L','L','L',
  'L','L','L','L','L','L','L','L','L','L','L','L','L','L','L',
  'L','ON','ON','ON','ON','BN','BN','BN','BN','BN','BN','B','BN',
  'BN','BN','BN','BN','BN','BN','BN','BN','BN','BN','BN','BN',
  'BN','BN','BN','BN','BN','BN','BN','BN','BN','BN','BN','BN',
  'BN','CS','ON','ET','ET','ET','ET','ON','ON','ON','ON','L','ON',
  'ON','ON','ON','ON','ET','ET','EN','EN','ON','L','ON','ON','ON',
  'EN','L','ON','ON','ON','ON','ON','L','L','L','L','L','L','L',
  'L','L','L','L','L','L','L','L','L','L','L','L','L','L','L',
  'L','ON','L','L','L','L','L','L','L','L','L','L','L','L','L',
  'L','L','L','L','L','L','L','L','L','L','L','L','L','L','L',
  'L','L','L','ON','L','L','L','L','L','L','L','L'
]

const arabicTypes: BidiType[] = [
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'CS','AL','ON','ON','NSM','NSM','NSM','NSM','NSM','NSM','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','NSM','NSM','NSM','NSM','NSM','NSM','NSM',
  'NSM','NSM','NSM','NSM','NSM','NSM','NSM','AL','AL','AL','AL',
  'AL','AL','AL','AN','AN','AN','AN','AN','AN','AN','AN','AN',
  'AN','ET','AN','AN','AL','AL','AL','NSM','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','NSM','NSM','NSM','NSM','NSM','NSM','NSM','NSM','NSM','NSM',
  'NSM','NSM','NSM','NSM','NSM','NSM','NSM','NSM','NSM','ON','NSM',
  'NSM','NSM','NSM','AL','AL','AL','AL','AL','AL','AL','AL','AL',
  'AL','AL','AL','AL','AL','AL','AL','AL','AL'
]

function classifyChar(charCode: number): BidiType {
  if (charCode <= 0x00ff) return baseTypes[charCode]!
  if (0x0590 <= charCode && charCode <= 0x05f4) return 'R'
  if (0x0600 <= charCode && charCode <= 0x06ff) return arabicTypes[charCode & 0xff]!
  if (0x0700 <= charCode && charCode <= 0x08AC) return 'AL'
  return 'L'
}

function computeBidiLevels(str: string): Int8Array | null {
  const len = str.length
  if (len === 0) return null

  const types: BidiType[] = new Array(len)
  let numBidi = 0

  for (let i = 0; i < len; i++) {
    const t = classifyChar(str.charCodeAt(i))
    if (t === 'R' || t === 'AL' || t === 'AN') numBidi++
    types[i] = t
  }

  if (numBidi === 0) return null

  const startLevel = (len / numBidi) < 0.3 ? 0 : 1
  const levels = new Int8Array(len)
  for (let i = 0; i < len; i++) levels[i] = startLevel

  const e: BidiType = (startLevel & 1) ? 'R' : 'L'
  const sor = e

  // W1-W7
  let lastType: BidiType = sor
  for (let i = 0; i < len; i++) { if (types[i] === 'NSM') types[i] = lastType; else lastType = types[i]! }
  lastType = sor
  for (let i = 0; i < len; i++) { const t = types[i]!; if (t === 'EN') types[i] = lastType === 'AL' ? 'AN' : 'EN'; else if (t === 'R' || t === 'L' || t === 'AL') lastType = t }
  for (let i = 0; i < len; i++) { if (types[i] === 'AL') types[i] = 'R' }
  for (let i = 1; i < len - 1; i++) { if (types[i] === 'ES' && types[i-1] === 'EN' && types[i+1] === 'EN') types[i] = 'EN'; if (types[i] === 'CS' && (types[i-1] === 'EN' || types[i-1] === 'AN') && types[i+1] === types[i-1]) types[i] = types[i-1]! }
  for (let i = 0; i < len; i++) { if (types[i] === 'EN') { let j; for (j = i-1; j >= 0 && types[j] === 'ET'; j--) types[j] = 'EN'; for (j = i+1; j < len && types[j] === 'ET'; j++) types[j] = 'EN' } }
  for (let i = 0; i < len; i++) { const t = types[i]!; if (t === 'WS' || t === 'ES' || t === 'ET' || t === 'CS') types[i] = 'ON' }
  lastType = sor
  for (let i = 0; i < len; i++) { const t = types[i]!; if (t === 'EN') types[i] = lastType === 'L' ? 'L' : 'EN'; else if (t === 'R' || t === 'L') lastType = t }

  // N1-N2
  for (let i = 0; i < len; i++) {
    if (types[i] === 'ON') {
      let end = i + 1
      while (end < len && types[end] === 'ON') end++
      const before: BidiType = i > 0 ? types[i-1]! : sor
      const after: BidiType = end < len ? types[end]! : sor
      const bDir: BidiType = before !== 'L' ? 'R' : 'L'
      const aDir: BidiType = after !== 'L' ? 'R' : 'L'
      if (bDir === aDir) { for (let j = i; j < end; j++) types[j] = bDir }
      i = end - 1
    }
  }
  for (let i = 0; i < len; i++) { if (types[i] === 'ON') types[i] = e }

  // I1-I2
  for (let i = 0; i < len; i++) {
    const t = types[i]!
    if ((levels[i]! & 1) === 0) {
      if (t === 'R') levels[i]!++
      else if (t === 'AN' || t === 'EN') levels[i]! += 2
    } else {
      if (t === 'L' || t === 'AN' || t === 'EN') levels[i]!++
    }
  }

  return levels
}

function reorderLine(segLevels: Int8Array, start: number, end: number): number[] | null {
  let low = 127, high = 0
  for (let i = start; i < end; i++) {
    const lv = segLevels[i]!
    if (lv < low) low = lv
    if (lv > high) high = lv
  }
  if (high <= 0) return null
  if (low % 2 === 0) low++

  const indices = new Array<number>(end - start)
  for (let i = 0; i < indices.length; i++) indices[i] = start + i

  while (high >= low) {
    let i = 0
    while (i < indices.length) {
      while (i < indices.length && segLevels[indices[i]!]! < high) i++
      let j = i
      while (j < indices.length && segLevels[indices[j]!]! >= high) j++
      let a = i, b = j - 1
      while (a < b) { const tmp = indices[a]!; indices[a] = indices[b]!; indices[b] = tmp; a++; b-- }
      i = j
    }
    high--
  }
  return indices
}

// --- Public types ---

type ParaData = {
  widths: number[]
  isWordLike: boolean[]
  isSpace: boolean[]
  segLevels: Int8Array | null
  breakableWidths: (number[] | null)[]
}

export type PreparedText = {
  paraData: ParaData[]
  lineHeight: number
}

export type LayoutResult = {
  lineCount: number
  height: number
}

// --- Public API ---

export function prepare(text: string, font: string, lineHeight?: number): PreparedText {
  ctx.font = font
  const cache = getWordCache(font)

  if (lineHeight === undefined) {
    lineHeight = Math.round(parseFontSize(font) * 1.2)
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  const normalized = text.replace(/\n/g, ' ')

  if (normalized.length === 0 || normalized.trim().length === 0) {
    return { paraData: [], lineHeight }
  }

  const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const segments = segmenter.segment(normalized)
  const widths: number[] = []
  const isWordLike: boolean[] = []
  const isSpace: boolean[] = []
  const segStarts: number[] = []
  const breakableWidths: (number[] | null)[] = []

  // Merge punctuation into preceding words: "better." as one unit
  const rawSegs = [...segments]
  const merged: { text: string, isWordLike: boolean, isSpace: boolean, start: number }[] = []

  for (let i = 0; i < rawSegs.length; i++) {
    const s = rawSegs[i]!
    const ws = !s.isWordLike && /^\s+$/.test(s.segment)

    if (!s.isWordLike && !ws && merged.length > 0) {
      merged[merged.length - 1]!.text += s.segment
    } else {
      merged.push({ text: s.segment, isWordLike: s.isWordLike ?? false, isSpace: ws, start: s.index })
    }
  }

  for (const seg of merged) {
    if (seg.isWordLike && isCJK(seg.text)) {
      const graphemes = graphemeSegmenter.segment(seg.text)
      for (const g of graphemes) {
        widths.push(measureSegment(g.segment, cache))
        isWordLike.push(true)
        isSpace.push(false)
        segStarts.push(seg.start + g.index)
        breakableWidths.push(null)
      }
    } else {
      widths.push(measureSegment(seg.text, cache))
      isWordLike.push(seg.isWordLike)
      isSpace.push(seg.isSpace)
      segStarts.push(seg.start)
      if (seg.isWordLike && seg.text.length > 1) {
        const graphemes = [...graphemeSegmenter.segment(seg.text)]
        if (graphemes.length > 1) {
          const gWidths = new Array<number>(graphemes.length)
          for (let gi = 0; gi < graphemes.length; gi++) {
            gWidths[gi] = measureSegment(graphemes[gi]!.segment, cache)
          }
          breakableWidths.push(gWidths)
        } else {
          breakableWidths.push(null)
        }
      } else {
        breakableWidths.push(null)
      }
    }
  }

  const bidiLevels = computeBidiLevels(normalized)
  let segLevels: Int8Array | null = null

  if (bidiLevels !== null) {
    segLevels = new Int8Array(widths.length)
    for (let i = 0; i < widths.length; i++) {
      segLevels[i] = bidiLevels[segStarts[i]!]!
    }
  }

  return { paraData: [{ widths, isWordLike, isSpace, segLevels, breakableWidths }], lineHeight }
}

export function layout(prepared: PreparedText, maxWidth: number, lineHeight?: number): LayoutResult {
  const { paraData } = prepared
  if (lineHeight === undefined) lineHeight = prepared.lineHeight

  let lineCount = 0

  for (let p = 0; p < paraData.length; p++) {
    const data = paraData[p]!

    const { widths, isWordLike: isWord, isSpace: isSp, segLevels, breakableWidths } = data
    let lineW = 0
    let hasContent = false
    let lineStart = 0
    let lastWordIdx = -1

    for (let i = 0; i < widths.length; i++) {
      const w = widths[i]!

      if (!hasContent) {
        if (w > maxWidth && breakableWidths[i] !== null) {
          const gWidths = breakableWidths[i]!
          lineW = 0
          for (let g = 0; g < gWidths.length; g++) {
            if (lineW > 0 && lineW + gWidths[g]! > maxWidth) {
              lineCount++
              lineW = gWidths[g]!
            } else {
              if (lineW === 0) lineCount++
              lineW += gWidths[g]!
            }
          }
          hasContent = true
          lineStart = i
          lastWordIdx = -1
        } else {
          lineW = w
          hasContent = true
          lineCount++
          lineStart = i
          lastWordIdx = isWord[i] ? i : -1
        }
        continue
      }

      const newW = lineW + w

      if (newW > maxWidth) {
        let breakIdx: number
        if (isWord[i]) {
          breakIdx = i
        } else if (isSp[i]) {
          continue
        } else if (lastWordIdx > lineStart) {
          breakIdx = lastWordIdx
        } else {
          lineW = newW
          continue
        }

        if (segLevels !== null) {
          reorderLine(segLevels, lineStart, breakIdx)
        }

        lineStart = breakIdx
        lineCount++
        lineW = 0
        lastWordIdx = -1
        for (let j = breakIdx; j <= i; j++) {
          lineW += widths[j]!
          if (isWord[j]) {
            lastWordIdx = j
          }
        }

        if (breakIdx === i && w > maxWidth && breakableWidths[i] !== null) {
          const gWidths = breakableWidths[i]!
          lineW = 0
          lineCount--
          for (let g = 0; g < gWidths.length; g++) {
            if (lineW > 0 && lineW + gWidths[g]! > maxWidth) {
              lineCount++
              lineW = gWidths[g]!
            } else {
              if (lineW === 0) lineCount++
              lineW += gWidths[g]!
            }
          }
        }
      } else {
        lineW = newW
        if (isWord[i]) {
          lastWordIdx = i
        }
      }
    }

    if (hasContent && segLevels !== null) {
      reorderLine(segLevels, lineStart, widths.length)
    }

    if (!hasContent) {
      lineCount++
    }
  }

  return { lineCount, height: lineCount * lineHeight }
}

export function clearCache(): void {
  wordCaches.clear()
}
