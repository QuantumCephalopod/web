(function initPretextRuntime(global) {
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  const tokenWidthCache = new Map();

  function key(font, token) {
    return `${font}::${token}`;
  }

  function measureToken(font, token) {
    const k = key(font, token);
    if (tokenWidthCache.has(k)) return tokenWidthCache.get(k);
    measureCtx.font = font;
    const w = measureCtx.measureText(token).width;
    tokenWidthCache.set(k, w);
    return w;
  }

  function prepare(text, font) {
    const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
    return {
      text: normalized,
      font,
      tokens: normalized.length ? normalized.split(' ') : [],
    };
  }

  function layout(prepared, options = {}) {
    const lineWidth = Math.max(80, options.lineWidth || 240);
    const tokens = prepared.tokens;
    if (!tokens.length) return [''];

    const lines = [];
    let cur = '';
    let curWidth = 0;

    for (const token of tokens) {
      const tokenW = measureToken(prepared.font, token);
      const spaceW = cur ? measureToken(prepared.font, ' ') : 0;

      if (cur && curWidth + spaceW + tokenW > lineWidth) {
        lines.push(cur);
        cur = token;
        curWidth = tokenW;
      } else {
        cur = cur ? `${cur} ${token}` : token;
        curWidth += spaceW + tokenW;
      }
    }

    if (cur) lines.push(cur);
    return lines;
  }

  function apply(element, text, options = {}) {
    if (!element) return;
    const computed = getComputedStyle(element);
    const font = options.font || `${computed.fontSize} ${computed.fontFamily}`;
    const prepared = prepare(text, font);
    const width = options.lineWidth || Math.max(80, element.clientWidth || element.offsetWidth || 240);
    const lines = layout(prepared, { lineWidth: width });
    element.style.whiteSpace = 'pre-line';
    element.textContent = lines.join('\n');
  }

  global.pretext = {
    prepare,
    layout,
    apply,
  };
})(window);
