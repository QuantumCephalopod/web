(function initPretextRuntime(global) {
  const PRETEXT_ESM_URL = 'https://cdn.jsdelivr.net/npm/@chenglou/pretext/+esm';

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

  import(PRETEXT_ESM_URL)
    .then((pkg) => {
      const {
        prepare,
        prepareWithSegments,
        layoutWithLines,
      } = pkg;

      function ensurePreparedForLines(text, font, options = {}) {
        return prepareWithSegments(String(text ?? ''), font, options);
      }

      global.pretext = {
        prepare(text, font, options = {}) {
          // Keep existing callsites compatible while using official Pretext.
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

        raw: {
          prepare,
          prepareWithSegments,
          layoutWithLines,
        },
      };

      global.dispatchEvent(new Event('pretext:ready'));
    })
    .catch((error) => {
      console.error('Failed to load @chenglou/pretext runtime', error);
    });
})(window);
