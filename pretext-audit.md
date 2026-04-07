# Pretext Audit (April 7, 2026)

## What Pretext is

Pretext (`@chenglou/pretext`) is a text-measurement and line-layout library for cases where apps repeatedly measure dynamic multiline text and want to avoid DOM reflow costs.

## Repo assessment

### Current usage

- This repository does **not** currently include or call `@chenglou/pretext`.
- There are no npm/package manifests in this repo, so no package-level dependency integration currently exists.

### Is that a problem here?

Mostly **no** for the current architecture:

- The visual core renders text directly onto a `<canvas>` using precomputed glyph geometry and baked offscreen canvases.
- The app does not rely on repeated DOM text measurement APIs (e.g., `getBoundingClientRect`, `offsetHeight`) for layout-critical paths.

That means the principal bottleneck that Pretext addresses is not present in the hottest rendering path.

## Correctness and efficiency guidance if Pretext is introduced later

If this app later needs dynamic multiline text sizing (chat bubbles, variable cards, rich editor blocks, etc.), use Pretext this way:

1. Call `prepare(text, font, options?)` once per text+font pair.
2. Reuse the prepared handle and call `layout(...)` across widths/resizes.
3. Do **not** rerun `prepare(...)` on every frame/resize.
4. Keep `font` and `lineHeight` synced with rendered styles.
5. Prefer worker/off-main-thread usage when layout volume is high.

## Performance improvement implemented in this audit

The current architecture intentionally uses `f33lings/f33lings.js` as a project head router so `index.html` can remain stable while routing to different folder entrypoints over time.

To preserve that architecture, this audit does **not** replace the router with direct script tags.

Startup parallelization is now implemented within `f33lings.js` while preserving router architecture by injecting all child scripts immediately with `async = false` (parallel fetch + ordered execution). Optional resource hints in `index.html` can still be layered on later if needed.


## Runtime implementation status

A local `pretext.js` runtime now powers UI copy layout (`window.pretext.prepare/layout/apply`) and all detail-panel + territory-label text writes in `z_output.js` are routed through this pretext pipeline.
