(function initPretextRuntime(global) {
  function resolveRuntimeRelative(path) {
    let runtimeScriptUrl = document.currentScript && document.currentScript.src;
    if (!runtimeScriptUrl) {
      const scripts = Array.from(document.getElementsByTagName('script'));
      const runtimeTag = scripts.find((tag) => /pretext-runtime\.js(?:\?|$)/.test(tag.src || ''));
      runtimeScriptUrl = runtimeTag && runtimeTag.src;
    }
    const base = runtimeScriptUrl || global.location.href;
    return new URL(path, base).href;
  }

  const PRETEXT_ESM_URL = resolveRuntimeRelative('./vendor/pretext-upstream/dist/layout.js');
  const PRETEXT_RICH_INLINE_ESM_URL = resolveRuntimeRelative('./vendor/pretext-upstream/dist/rich-inline.js');
  global.pretextRuntimeDiagnostics = {
    state: 'loading',
    coreUrl: PRETEXT_ESM_URL,
    richInlineUrl: PRETEXT_RICH_INLINE_ESM_URL,
    lastError: null,
  };

  function px(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function estimateLineHeight(fontSizePx, computedLineHeight) {
    const explicit = px(computedLineHeight, NaN);
    if (Number.isFinite(explicit)) return explicit;
    return Math.max(12, fontSizePx * 1.35);
  }

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  Promise.all([
    import(PRETEXT_ESM_URL),
    import(PRETEXT_RICH_INLINE_ESM_URL),
  ])
    .then(([corePkg, richInlinePkg]) => {
      const {
        prepare,
        prepareWithSegments,
        layoutWithLines,
        measureLineStats,
        walkLineRanges,
        layoutNextLineRange,
        materializeLineRange,
      } = corePkg;

      function ensurePreparedForLines(text, font, options = {}) {
        return prepareWithSegments(String(text ?? ''), font, options);
      }

      const core = {
        prepare,
        prepareWithSegments,
        layoutWithLines,
        measureLineStats,
        walkLineRanges,
        layoutNextLineRange,
        materializeLineRange,
      };

      const richInline = richInlinePkg;

      global.pretext = {
        core,
        richInline,

        // Legacy aliases preserved for older callsites.
        prepare(text, font, options = {}) {
          return ensurePreparedForLines(normalizeText(text), font, options);
        },

        layout(prepared, options = {}) {
          const lineWidth = Math.max(1, options.lineWidth || 240);
          const lineHeight = Math.max(8, options.lineHeight || 16);
          const { lines } = layoutWithLines(prepared, lineWidth, lineHeight);
          return lines.map((line) => line.text);
        },

        apply(element, text, options = {}) {
          if (!element) return;
          const computed = getComputedStyle(element);
          const fontSizePx = px(computed.fontSize, 16);
          const font = options.font || `${computed.fontSize} ${computed.fontFamily}`;
          const lineWidth = options.lineWidth || Math.max(80, element.clientWidth || element.offsetWidth || 240);
          const lineHeight = options.lineHeight || estimateLineHeight(fontSizePx, computed.lineHeight);
          const prepared = ensurePreparedForLines(String(text ?? ''), font, { whiteSpace: 'pre-wrap' });
          const { lines } = layoutWithLines(prepared, lineWidth, lineHeight);
          element.style.whiteSpace = 'pre-line';
          element.textContent = lines.map((line) => line.text).join('\n');
        },
      };

      global.pretextRuntimeDiagnostics.state = 'ready';
      global.dispatchEvent(new CustomEvent('pretext:ready', { detail: { ...global.pretextRuntimeDiagnostics } }));
    })
    .catch((error) => {
      global.pretext = global.pretext || {
        core: null,
        richInline: null,
      };
      global.pretextRuntimeDiagnostics.state = 'failed';
      global.pretextRuntimeDiagnostics.lastError = error && error.message ? error.message : String(error);
      console.error('Failed to load local @chenglou/pretext runtime', error);
      global.dispatchEvent(new CustomEvent('pretext:failed', { detail: { ...global.pretextRuntimeDiagnostics, error } }));
    });
})(window);
