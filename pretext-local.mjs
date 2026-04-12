const DEFAULT_FONT_SIZE = 16;
const CHAR_WIDTH_FACTOR = 0.58;

function px(value, fallback) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function fontSizeFromShorthand(font) {
  const match = String(font || '').match(/(\d+(?:\.\d+)?)px/);
  return match ? px(match[1], DEFAULT_FONT_SIZE) : DEFAULT_FONT_SIZE;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

function splitParagraph(text) {
  const cleaned = text.replace(/[\t\f\v ]+/g, ' ').trim();
  return cleaned ? cleaned.split(' ') : [];
}

function estimateCharsPerLine(font, lineWidth) {
  const fontSize = fontSizeFromShorthand(font);
  const estimatedCharWidth = Math.max(1, fontSize * CHAR_WIDTH_FACTOR);
  return Math.max(1, Math.floor(lineWidth / estimatedCharWidth));
}

export function prepare(text, font, options = {}) {
  return {
    text: normalizeText(text),
    font: String(font ?? ''),
    options: { ...options },
  };
}

export function prepareWithSegments(text, font, options = {}) {
  const prepared = prepare(text, font, options);
  const segments = prepared.text.split(/(\n)/).filter(Boolean).map((value, index) => ({
    id: index,
    text: value,
    type: value === '\n' ? 'newline' : 'text',
  }));

  return {
    ...prepared,
    segments,
  };
}

export function layoutWithLines(prepared, lineWidth = 240, lineHeight = 16) {
  const source = prepared && typeof prepared === 'object' ? prepared : prepare(prepared, '', {});
  const charsPerLine = estimateCharsPerLine(source.font, Math.max(1, lineWidth));
  const lines = [];

  normalizeText(source.text).split('\n').forEach((paragraph) => {
    const words = splitParagraph(paragraph);
    if (!words.length) {
      lines.push({ text: '' });
      return;
    }

    let current = words[0] || '';
    for (let i = 1; i < words.length; i += 1) {
      const next = words[i];
      if (`${current} ${next}`.length <= charsPerLine) {
        current = `${current} ${next}`;
      } else {
        lines.push({ text: current });
        current = next;
      }
    }
    lines.push({ text: current });
  });

  return {
    lines,
    lineHeight,
  };
}

export function measureLineStats(prepared, lineWidth = 240, lineHeight = 16) {
  const layout = layoutWithLines(prepared, lineWidth, lineHeight);
  return {
    lineCount: layout.lines.length,
    longestLineLength: layout.lines.reduce((max, line) => Math.max(max, line.text.length), 0),
    lineHeight,
  };
}

export function layoutNextLineRange(prepared, fromIndex = 0, lineWidth = 240, lineHeight = 16) {
  const layout = layoutWithLines(prepared, lineWidth, lineHeight);
  const start = Math.max(0, fromIndex);
  const end = Math.min(layout.lines.length, start + 1);
  return {
    start,
    end,
    done: end >= layout.lines.length,
  };
}

export function materializeLineRange(prepared, range, lineWidth = 240, lineHeight = 16) {
  const layout = layoutWithLines(prepared, lineWidth, lineHeight);
  const start = Math.max(0, range?.start || 0);
  const end = Math.max(start, range?.end || start);
  return {
    lines: layout.lines.slice(start, end),
  };
}

export function walkLineRanges(prepared, lineWidth = 240, lineHeight = 16, callback = () => {}) {
  const layout = layoutWithLines(prepared, lineWidth, lineHeight);
  for (let index = 0; index < layout.lines.length; index += 1) {
    callback({ start: index, end: index + 1, done: index + 1 >= layout.lines.length });
  }
}

export const richInline = {
  parse(value) {
    return [{ type: 'text', text: String(value ?? '') }];
  },
};
