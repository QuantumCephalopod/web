# Pretext Audit + Feature Documentation (April 8, 2026)

## Scope

This document covers:

- How Pretext is currently used in this repository.
- A practical documentation summary of official Pretext features from the upstream `chenglou/pretext` repository.

## Current Integration in This Repo

### `f33lings/`

- Loads `../pretext-runtime.js` from `f33lings/f33lings.js`.
- Uses `setPretextText(...)` in `f33lings/z_output.js`.
- Current helper behavior:
  - Prefers core APIs (`window.pretext.core.prepareWithSegments` + `layoutWithLines`) for text layout.
  - Falls back to `window.pretext.apply(...)` then `textContent`.

### `moiré/`

- Loads `../pretext-runtime.js` in `moiré/moiré.html`.
- Uses Pretext core APIs for:
  - Text wrapping (`prepareWithSegments` + `layoutWithLines`).
  - Line statistics (`measureLineStats`) where available.
  - Range walker (`walkLineRanges`) where available.
- Also uses the same DOM helper strategy for button/status text.

### Runtime Adapter (`pretext-runtime.js`)

- Imports `@chenglou/pretext` from jsDelivr ESM.
- Exposes:
  - `window.pretext.core` (official core APIs)
  - `window.pretext.richInline` (optional rich-inline helper package)
  - Compatibility aliases (`prepare`, `layout`, `apply`)

---

## Official Pretext Feature Documentation (Upstream Summary)

> Source of truth: `https://github.com/chenglou/pretext` (README/API section).

## 1) Core purpose

Pretext is a JavaScript/TypeScript multiline text measurement + layout engine that avoids repeated DOM measurement/reflow (`getBoundingClientRect`, `offsetHeight`) by precomputing text/font data and running layout as arithmetic.

## 2) Two primary API workflows

### A. Measure paragraph height quickly (DOM-free)

- `prepare(text, font, options?)`
- `layout(prepared, maxWidth, lineHeight)`

Use this when you mainly need **height/line count** for a given width.

Common options:

- `whiteSpace: 'normal' | 'pre-wrap'`
- `wordBreak: 'normal' | 'keep-all'`

### B. Manual line layout / custom rendering pipelines

- `prepareWithSegments(text, font, options?)`
- `layoutWithLines(prepared, maxWidth, lineHeight)`

Use this when you need line text + cursors for Canvas/SVG/WebGL/manual DOM rendering.

## 3) Measurement + shrink-wrap helpers

- `measureLineStats(prepared, maxWidth)`
  - Returns `{ lineCount, maxLineWidth }` without line text allocations.
- `walkLineRanges(prepared, maxWidth, onLine)`
  - Walks line ranges/cursors and widths without materializing strings.
- `measureNaturalWidth(prepared)`
  - Returns natural widest forced line when wrapping width is not the limiter.

These are useful for balanced layout, binary-search width fitting, and true multiline shrink-wrap.

## 4) Variable-width / obstacle-aware flow

- `layoutNextLineRange(prepared, startCursor, maxWidth)`
- `materializeLineRange(prepared, lineRange)`
- (Also available: `layoutNextLine(...)`)

This enables per-row width changes (e.g., text flowing around images/shapes), where each subsequent line can be laid out with a different width.

## 5) Rich inline helper package

From `@chenglou/pretext/rich-inline`:

- `prepareRichInline(items)`
- `layoutNextRichInlineLineRange(prepared, maxWidth, start?)`
- `walkRichInlineLineRanges(prepared, maxWidth, onLine)`
- `materializeRichInlineLineRange(prepared, range)`
- `measureRichInlineStats(prepared, maxWidth)`

`RichInlineItem` supports:

- `text`
- `font`
- `break?: 'normal' | 'never'`
- `extraWidth?` (for pill/chip chrome, padding, borders)

Intended scope is intentionally narrow: inline flow (`white-space: normal`) for chips/mentions/code spans and similar mixed-inline content.

## 6) Recommended usage patterns from upstream API design

- Treat `prepare*` as a one-time precompute step.
- Re-run `layout*` many times (e.g., on resize/animation/what-if width tests).
- Prefer stats/range walkers when you only need counts/widths, not full strings.
- Materialize strings only at final render boundaries.

## 7) Practical limitations to keep in mind

Based on upstream docs/readme guidance:

- Fonts should be loaded before preparing text.
- `prepare*` has non-zero upfront cost; keep it off critical hot UI path when possible.
- Rich-inline helper is not a full nested HTML/CSS inline formatting engine.

---

## Links

- GitHub repo (official): https://github.com/chenglou/pretext
- npm package: https://www.npmjs.com/package/@chenglou/pretext
- rich-inline package path: `@chenglou/pretext/rich-inline`
