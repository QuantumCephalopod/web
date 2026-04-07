# Pretext Audit (April 7, 2026)

## Scope

This audit checks Pretext usage in the two current projects:

- `f33lings/`
- `moiré/`

## Findings

### `f33lings/`: **Uses Pretext runtime**

`f33lings` explicitly loads the local runtime at `../pretext.js` from its entry loader, then routes UI text updates through a helper that prefers `window.pretext.apply(...)`.

Observed usage:

- Script load of `../pretext.js` in `f33lings/f33lings.js`.
- `setPretextText(...)` helper in `f33lings/z_output.js`:
  - Uses `window.pretext.apply(el, value)` when available.
  - Falls back to `el.textContent = value` if Pretext is unavailable.
- Helper is used for detail panel and sidecar text rendering (`detail-address`, `detail-symbol`, `detail-name`, `detail-essence`, `detail-create`, `detail-copy`, `detail-control`, domain and territory labels).

Assessment:

- Integration is **defensive and safe** (has fallback behavior).
- Integration is currently **runtime-global** (`window.pretext`), not package-managed.

### `moiré/`: **Uses Pretext for text layout/status text**

`moiré/moiré.html` now loads `../pretext.js` and uses Pretext APIs for wrapping/layout decisions (`prepare` + `layout`) as well as status/button DOM text updates through a shared helper that prefers `window.pretext.apply(...)` with fallback.

Assessment:

- Pretext is now integrated into this project's text pipeline for line layout and UI copy updates.
- Canvas glyph drawing remains canvas-native (`fillText`) after Pretext-driven layout.

## Summary table

| Project | Pretext loaded? | Pretext called? | Notes |
|---|---:|---:|---|
| `f33lings/` | Yes | Yes | Uses `window.pretext.apply` with `textContent` fallback |
| `moiré/` | Yes | Yes | Uses Pretext for wrapping/layout and DOM status/button copy |

## Recommendation

Keep fallback behavior (`textContent`) in both projects for resilience, but continue routing text layout/copy updates through Pretext by default.
