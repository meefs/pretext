## Text Metrics

DOM-free text measurement library using canvas `measureText()` + `Intl.Segmenter`.

Two-phase API: `prepare()` once per text, `layout()` is pure arithmetic on resize. Full i18n: CJK, Thai, Arabic, Hebrew, bidi, emoji. ~0.1ms to reflow 500 comments.

### Commands

- `bun run serve` — serve demo pages at http://localhost:3000
- `bun run check` — typecheck + lint

### Architecture

- `src/layout.ts` — the library. prepare() segments + measures words via canvas. layout() walks cached widths.
- `pages/` — benchmark, accuracy sweep, interleaving demo, visual demo

### Key decisions

- Canvas measureText over DOM: avoids read/write interleaving. DOM renders use the same font engine, but canvas goes through a separate pipeline. Emoji widths differ (canvas vs DOM) at font sizes <24px on macOS.
- Intl.Segmenter over split(' '): handles CJK (no spaces between words), Thai, etc. Also replaces Sebastian's linebreak npm dependency.
- Punctuation merged with preceding word before measuring: "better." measured as one unit, not "better" + ".". Reduces accumulation error.
- Trailing whitespace hangs past line edge (CSS behavior): spaces that overflow maxWidth don't trigger line breaks.
- Word-level cache keyed on (segment, font): survives across resize since font doesn't change. Common words shared across texts.

### Known limitations

- Emoji: canvas measures 4px wider than DOM at font sizes <24px on macOS (Apple Color Emoji pipeline difference). Converges at >=24px. Platform-specific; untested on Windows.
- system-ui font: canvas and DOM resolve to different optical variants at certain sizes on macOS. Use named fonts.
- Bidi: character-level classification + reordering is implemented. Full embedding levels (nested LTR/RTL) not yet supported.

### Based on

Fork of Sebastian Markbage's [text-layout](https://github.com/reactjs/text-layout) research prototype. Original architecture: bidi + canvas measureText + break iterator. We added: two-phase caching, Intl.Segmenter, punctuation merging, CJK grapheme splitting, overflow-wrap support.
