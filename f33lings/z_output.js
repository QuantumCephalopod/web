const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const fieldCanvas = document.createElement('canvas');
const fieldCtx = fieldCanvas.getContext('2d', { alpha: false });
const FIELD_BASE_RES = 180;
const FIELD_MIN_RES = 96;
const FIELD_LOW_QUALITY = 0.64;
const FIELD_ROT_DIRTY_THRESHOLD = 0.003;
const FIELD_FLIP_DIRTY_THRESHOLD = 0.004;
const FIELD_MOTION_ENTER_THRESHOLD = 0.0014;
const FIELD_MOTION_EXIT_THRESHOLD = 0.00045;
const EXP_LUT_MAX = 14;
const EXP_LUT_SIZE = 1024;
const expLut = new Float32Array(EXP_LUT_SIZE + 1);
const expLutStep = EXP_LUT_MAX / EXP_LUT_SIZE;
const expLutInvStep = 1 / expLutStep;
for (let i = 0; i <= EXP_LUT_SIZE; i++) {
  expLut[i] = Math.exp(-i * expLutStep);
}

let fieldQuality = 1;

function fastExpNeg(x) {
  if (x <= 0) return 1;
  if (x >= EXP_LUT_MAX) return 0;
  const scaled = x * expLutInvStep;
  const idx = scaled | 0;
  const frac = scaled - idx;
  const a = expLut[idx];
  const b = expLut[idx + 1];
  return a + (b - a) * frac;
}

function rebuildFieldBuffer() {
  const scale = Math.min(1.35, Math.max(0.78, Math.min(W, H) / 900));
  const targetW = Math.max(FIELD_MIN_RES, Math.round(FIELD_BASE_RES * scale * fieldQuality));
  const targetH = Math.max(FIELD_MIN_RES, Math.round(FIELD_BASE_RES * scale * fieldQuality));
  if (targetW === FIELD_W && targetH === FIELD_H && fieldImage) return;
  FIELD_W = targetW;
  FIELD_H = targetH;
  fieldCanvas.width = FIELD_W;
  fieldCanvas.height = FIELD_H;
  fieldImage = fieldCtx.createImageData(FIELD_W, FIELD_H);
  fieldDirty = true;
}

function requestRender() {
  if (!rafId) rafId = requestAnimationFrame(render);
}

const spiralWebGLRenderer = typeof SpiralWebGLRenderer === 'function'
  ? new SpiralWebGLRenderer()
  : null;
let hoverVertex = null;
let hoverStartTime = 0;
let activeRippleVertex = null;
let rippleStartTime = 0;
let rippleFadeOut = false;
let rippleFadeStartTime = 0;

function updateHoverVertex() {
  const now = performance.now();

  if (!mouseInside) {
    if (hoverVertex !== null) {
      hoverVertex = null;
      hoverStartTime = 0;
      if (activeRippleVertex && !rippleFadeOut) {
        rippleFadeOut = true;
        rippleFadeStartTime = now;
      }
    }
    if (rippleFadeOut && now - rippleFadeStartTime >= RIPPLE_DURATION_MS * 0.6) {
      rippleFadeOut = false;
      activeRippleVertex = null;
    }
    return;
  }

  const pv = getProjVerts();
  let nearest = null;
  let bestD2 = Infinity;

  for (const dir of ORDER) {
    const { x, y } = pv[dir].proj;
    const dx = mouseX - x;
    const dy = mouseY - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      nearest = dir;
    }
  }

  if (nearest && bestD2 < HIT_RADIUS * HIT_RADIUS) {
    if (hoverVertex !== nearest) {
      hoverVertex = nearest;
      hoverStartTime = now;
      activeRippleVertex = nearest;
      rippleStartTime = now;
      rippleFadeOut = false;
      rippleFadeStartTime = 0;
    }
  } else if (hoverVertex !== null) {
    hoverVertex = null;
    hoverStartTime = 0;
    if (activeRippleVertex && !rippleFadeOut) {
      rippleFadeOut = true;
      rippleFadeStartTime = now;
    }
  }

  if (rippleFadeOut && now - rippleFadeStartTime >= RIPPLE_DURATION_MS * 0.6) {
    rippleFadeOut = false;
    activeRippleVertex = null;
  }
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.6);

  const w = Math.max(320, window.innerWidth);
  const h = Math.max(320, window.innerHeight);

  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  W = w;
  H = h;
  cx = W / 2;
  cy = H / 2;

  rebuildFieldBuffer();
  if (spiralWebGLRenderer && spiralWebGLRenderer.available) {
    spiralWebGLRenderer.setSize(W, H, dpr);
  }
  boundScaleState = 1;
  fieldDirty = true;
  requestRender();
}

window.addEventListener('resize', resizeCanvas);

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left;
  mouseY = e.clientY - r.top;
  const prevTargetRX = targetRX;
  const prevTargetRY = targetRY;
  targetRY = ((mouseX) / W - 0.5) * 2 * MAX_ROT;
  targetRX = -((mouseY) / H - 0.5) * 2 * MAX_ROT;
  mouseInside = true;
  if (
    Math.abs(targetRX - prevTargetRX) > FIELD_ROT_DIRTY_THRESHOLD ||
    Math.abs(targetRY - prevTargetRY) > FIELD_ROT_DIRTY_THRESHOLD
  ) {
    fieldDirty = true;
  }
  requestRender();
});

canvas.addEventListener('mouseleave', () => {
  targetRX = 0;
  targetRY = 0;
  mouseX = cx;
  mouseY = cy;
  mouseInside = false;
  fieldDirty = true;
  requestRender();
});

canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  const pv = getProjVerts();

  let nearest = null;
  let bestD2 = Infinity;
  for (const dir of ORDER) {
    const { x, y } = pv[dir].proj;
    const dx = mx - x;
    const dy = my - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      nearest = dir;
    }
  }

  if (nearest && bestD2 < HIT_RADIUS * HIT_RADIUS) {
    lastClickedVertex = nearest;

    flipFrom = currentBaseOrientation();

    if (activePose === 'A') {
      flipTo = qB.slice();
      activePose = 'B';
    } else {
      flipTo = qA.slice();
      activePose = 'A';
    }

    flipMid = buildMidPose(flipFrom, nearest);
    boundScaleState = computeBoundsScale(getProjVertsMap());
    flipProgress = 0;
    flipTarget = 1;
    fieldDirty = true;
    requestRender();
  }
});

function drawEmissionField(pv, p, boundScale) {
  if (fieldDirty || !fieldImage) {
    const data = fieldImage.data;

    const nodes = ORDER.map(dir => {
      const sign = aspects[dir].charge === 'light' ? 1 : -1;
      const vx = p[dir].x / W * FIELD_W;
      const vy = p[dir].y / H * FIELD_H;
      const frontness = clamp((pv[dir].z + Z_DEPTH) / (2 * Z_DEPTH), 0, 1);
      const backness = 1 - frontness;

      const sigmaPxScreen = lerp(95, 335, backness) * boundScale;
      const sigma = sigmaPxScreen * (FIELD_W / W);
      const amp = lerp(1.25, 0.68, backness);
      const invTwoSigma2 = 1 / (2 * sigma * sigma);
      const signedAmp = sign * amp;

      return { vx, vy, invTwoSigma2, signedAmp };
    });

    let idx = 0;
    for (let y = 0; y < FIELD_H; y++) {
      for (let x = 0; x < FIELD_W; x++) {
        let f = 0;

        for (const n of nodes) {
          const dx = x - n.vx;
          const dy = y - n.vy;
          const dist2 = dx * dx + dy * dy;
          f += n.signedAmp * fastExpNeg(dist2 * n.invTwoSigma2);
        }

        const tone = 128 + 118 * Math.tanh(f * 1.28);
        const g = Math.round(clamp(tone, 0, 255));

        data[idx++] = g;
        data[idx++] = g;
        data[idx++] = g;
        data[idx++] = 255;
      }
    }

    fieldCtx.putImageData(fieldImage, 0, 0);
    fieldDirty = false;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fieldCanvas, 0, 0, W, H);
}

function ensureSpiralTextBitmap(cache, textFill) {
  const cacheKey = textFill === DARK_TEXT ? 'textBitmapDark' : 'textBitmapLight';
  if (cache[cacheKey]) return cache[cacheKey];

  const pad = FONT_SIZE * NAME_SIZE_BOOST * 2.4;
  const size = Math.ceil(cache.outerR * 2 + pad * 2);
  const bitmap = document.createElement('canvas');
  bitmap.width = Math.max(2, size);
  bitmap.height = Math.max(2, size);

  const bctx = bitmap.getContext('2d');
  const centerX = bitmap.width * 0.5;
  const centerY = bitmap.height * 0.5;
  const nameFont = `${FONT_SIZE * NAME_SIZE_BOOST}px monospace`;
  const bodyFont = `${FONT_SIZE}px monospace`;

  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.translate(centerX, centerY);
  bctx.textBaseline = 'middle';
  bctx.textAlign = 'center';
  bctx.fillStyle = textFill;

  if (cache.nameGlyphs.length) {
    bctx.font = nameFont;
    for (const g of cache.nameGlyphs) {
      bctx.setTransform(1, 0, 0, 1, centerX, centerY);
      bctx.rotate(g.rotation);
      bctx.fillText(g.char, g.radius, 0);
    }
  }

  if (cache.bodyGlyphs.length) {
    bctx.font = bodyFont;
    for (const g of cache.bodyGlyphs) {
      bctx.setTransform(1, 0, 0, 1, centerX, centerY);
      bctx.rotate(g.rotation);
      bctx.fillText(g.char, g.radius, 0);
    }
  }

  bctx.setTransform(1, 0, 0, 1, 0, 0);
  const textBitmap = {
    canvas: bitmap,
    offsetX: centerX,
    offsetY: centerY,
  };
  cache[cacheKey] = textBitmap;
  return textBitmap;
}

function renderSpiral(dir, projVert, boundScale) {
  const { charge, cache } = aspects[dir];
  const { x, y, scale } = projVert;
  const localScale = scale * boundScale;
  const textFill = charge === 'light' ? DARK_TEXT : LIGHT_TEXT;
  const bitmap = ensureSpiralTextBitmap(cache, textFill);

  const alpha = 1.0;

  ctx.globalAlpha = alpha;
  ctx.setTransform(
    localScale * dpr,
    0,
    0,
    localScale * dpr,
    x * dpr,
    y * dpr
  );
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(bitmap.canvas, -bitmap.offsetX, -bitmap.offsetY);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1.0;
}

// ── Portal Ripple ────────────────────────────────────────────────────────────

function drawRipple(dir, p) {
  if (!activeRippleVertex || rippleFadeOut) return;
  const { charge, cache } = aspects[dir];
  const { x, y, scale } = p[dir];
  const outerR  = cache.outerR * scale * boundScaleState;
  const innerR  = DOT_R * scale * 0.5;
  // Rings expand outward a bit beyond the spiral edge for a nice portal feel
  const maxR    = outerR * 1.12;

  const now     = performance.now();
  const elapsed = now - rippleStartTime;

  // RGB components of the ring color match the spiral disc color
  const rgb = charge === 'light' ? '15,15,16' : '245,242,234';

  for (let k = 0; k < RIPPLE_RING_COUNT; k++) {
    const delay      = (k / RIPPLE_RING_COUNT) * RIPPLE_DURATION_MS;
    const ringElapsed = elapsed - delay;
    if (ringElapsed < 0 || ringElapsed > RIPPLE_DURATION_MS) continue;

    const phase = ringElapsed / RIPPLE_DURATION_MS;
    const r     = lerp(innerR, maxR, phase);
    // Sine envelope: alpha peaks at mid-expansion
    const ringAlpha = Math.sin(phase * Math.PI) * 0.55;
    const lw        = lerp(3.5, 0.4, phase) * scale;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb},${ringAlpha})`;
    ctx.lineWidth   = lw;
    ctx.stroke();
  }
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

const DETAIL_PANEL = {
  x: 24,
  width: 260,
  paddingX: 16,
  paddingY: 18,
  radius: 12,
};

const detailPanelState = {
  layoutCache: new Map(),
  activeDir: null,
  activeSignature: '',
  targetVisible: 0,
  visible: 0,
  content: null,
};

function invalidateDetailPanelCache() {
  detailPanelState.layoutCache.clear();
}

window.addEventListener('resize', invalidateDetailPanelCache);

function layoutPretextLines(raw, fieldId, width, font, lineHeight) {
  const text = String(raw ?? '');
  const cacheKey = `${fieldId}§${text}§${width}§${font}§${lineHeight}`;
  const cached = detailPanelState.layoutCache.get(cacheKey);
  if (cached) return cached;

  const pre = window.pretext;
  const core = pre && pre.core;
  let lines;
  if (core && typeof core.prepareWithSegments === 'function' && typeof core.layoutWithLines === 'function') {
    const prepared = core.prepareWithSegments(text, font, { whiteSpace: 'pre-wrap' });
    const laidOut = core.layoutWithLines(prepared, width, lineHeight);
    lines = laidOut.lines.map((line) => line.text);
  } else {
    lines = text.split(/\n/g);
  }

  detailPanelState.layoutCache.set(cacheKey, lines);
  return lines;
}

function setPlainText(el, value) {
  if (!el) return;
  el.style.whiteSpace = 'normal';
  el.textContent = String(value ?? '');
}

function showDetailPanel(dir) {
  const a = aspects[dir];
  if (!a) return;

  const nextContent = {
    address: `${a.domain} › ${a.territory} › ${a.name}`,
    symbol: a.symbol,
    name: a.name,
    essence: a.autonomous_essence,
    create: a.create_aspect,
    copy: a.copy_aspect,
    control: a.control_aspect,
  };

  const nextSignature = [
    nextContent.address,
    nextContent.symbol,
    nextContent.name,
    nextContent.essence,
    nextContent.create,
    nextContent.copy,
    nextContent.control,
  ].join('§');

  detailPanelState.targetVisible = 1;

  if (detailPanelState.activeDir === dir && detailPanelState.activeSignature === nextSignature) {
    return;
  }

  detailPanelState.activeDir = dir;
  detailPanelState.activeSignature = nextSignature;
  detailPanelState.content = nextContent;
}

function hideDetailPanel() {
  detailPanelState.targetVisible = 0;
}

function drawDetailPanelOverlay() {
  const speed = 0.14;
  detailPanelState.visible += (detailPanelState.targetVisible - detailPanelState.visible) * speed;
  if (Math.abs(detailPanelState.visible - detailPanelState.targetVisible) < 0.001) {
    detailPanelState.visible = detailPanelState.targetVisible;
  }

  if (detailPanelState.visible <= 0.001 || !detailPanelState.content) return;

  const alpha = detailPanelState.visible;
  const width = DETAIL_PANEL.width;
  const bodyWidth = width - DETAIL_PANEL.paddingX * 2;
  const x = DETAIL_PANEL.x;

  const fonts = {
    address: '9px monospace',
    symbol: '26px serif',
    name: 'bold 15px monospace',
    essence: 'italic 11px monospace',
    label: '8px monospace',
    section: '11px monospace',
  };

  const lineHeights = {
    address: 14,
    essence: 17,
    section: 17,
  };

  const content = detailPanelState.content;
  const addressLines = layoutPretextLines(content.address, 'address', bodyWidth, fonts.address, lineHeights.address);
  const essenceLines = layoutPretextLines(content.essence, 'essence', bodyWidth, fonts.essence, lineHeights.essence);
  const createLines = layoutPretextLines(content.create, 'create', bodyWidth, fonts.section, lineHeights.section);
  const copyLines = layoutPretextLines(content.copy, 'copy', bodyWidth, fonts.section, lineHeights.section);
  const controlLines = layoutPretextLines(content.control, 'control', bodyWidth, fonts.section, lineHeights.section);

  const contentHeight =
    12 +
    addressLines.length * lineHeights.address +
    10 +
    30 +
    essenceLines.length * lineHeights.essence +
    10 +
    (12 + createLines.length * lineHeights.section) +
    (12 + copyLines.length * lineHeights.section) +
    (12 + controlLines.length * lineHeights.section) +
    12;

  const panelHeight = Math.min(H - 40, Math.max(220, DETAIL_PANEL.paddingY * 2 + contentHeight));
  const y = cy - panelHeight * 0.5;

  const panelAlpha = alpha * 0.92;
  ctx.save();
  ctx.globalAlpha = panelAlpha;
  ctx.fillStyle = 'rgba(248,246,240,0.92)';
  ctx.strokeStyle = 'rgba(0,0,0,0.09)';
  ctx.lineWidth = 1;

  const r = DETAIL_PANEL.radius;
  const right = x + width;
  const bottom = y + panelHeight;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(right, y, right, bottom, r);
  ctx.arcTo(right, bottom, x, bottom, r);
  ctx.arcTo(x, bottom, x, y, r);
  ctx.arcTo(x, y, right, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  let ty = y + DETAIL_PANEL.paddingY;
  const tx = x + DETAIL_PANEL.paddingX;

  const drawLines = (lines, font, fill, lh) => {
    ctx.font = font;
    ctx.fillStyle = fill;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = alpha;
    for (const line of lines) {
      ctx.fillText(line, tx, ty);
      ty += lh;
    }
  };

  drawLines(addressLines, fonts.address, 'rgba(136,136,136,1)', lineHeights.address);
  ty += 8;

  ctx.globalAlpha = alpha;
  ctx.font = fonts.symbol;
  ctx.fillStyle = 'rgba(17,17,17,1)';
  ctx.fillText(content.symbol || '', tx, ty - 4);

  ctx.font = fonts.name;
  ctx.fillStyle = 'rgba(17,17,17,1)';
  ctx.fillText(content.name || '', tx + 34, ty + 6);
  ty += 30;

  drawLines(essenceLines, fonts.essence, 'rgba(85,85,85,1)', lineHeights.essence);
  ty += 8;

  const section = (label, lines) => {
    ctx.globalAlpha = alpha;
    ctx.font = fonts.label;
    ctx.fillStyle = 'rgba(168,168,168,1)';
    ctx.fillText(label, tx, ty);
    ty += 12;
    drawLines(lines, fonts.section, 'rgba(34,34,34,1)', lineHeights.section);
  };

  section('CREATE', createLines);
  section('COPY', copyLines);
  section('CONTROL', controlLines);

  ctx.globalAlpha = 1;
}

function drawEdges(pv) {
  const p = {};
  for (const dir of ORDER) p[dir] = pv[dir].proj;

  const diagPairs = DIAG_PAIRS.slice().sort(
    (e1, e2) => (pv[e1[0]].z + pv[e1[1]].z) - (pv[e2[0]].z + pv[e2[1]].z)
  );

  for (const [a, b] of diagPairs) {
    ctx.beginPath();
    ctx.moveTo(p[a].x, p[a].y);
    ctx.lineTo(p[b].x, p[b].y);
    ctx.strokeStyle = 'rgba(160,160,160,0.48)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(176,176,176,0.42)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(p.w.x, p.w.y);
  ctx.lineTo(p.y.x, p.y.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(122,122,122,0.58)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x.x, p.x.y);
  ctx.lineTo(p.z.x, p.z.y);
  ctx.stroke();
}

function drawDots(sorted, p) {
  for (const dir of sorted) {
    const { symbol, charge } = aspects[dir];
    const { x, y, scale } = p[dir];
    const r = DOT_R * scale;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (charge === 'light') {
      ctx.fillStyle = LIGHT_DISC;
      ctx.fill();
    } else {
      ctx.fillStyle = DARK_DISC;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 1.2 * scale;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.font = `bold ${Math.round(18 * scale)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = charge === 'light' ? DARK_TEXT : LIGHT_TEXT;
    ctx.fillText(symbol, 0, 0);
    ctx.restore();
  }
}

function render() {
  rafId = 0;
  if (!W || !H || !aspects.w) return;

  const prevRX  = curRX;
  const prevRY  = curRY;
  const prevFlip = flipProgress;

  curRX        += (targetRX - curRX) * 0.08;
  curRY        += (targetRY - curRY) * 0.08;
  flipProgress += (flipTarget - flipProgress) * 0.09;

  const now = performance.now();

  const rotDeltaX = Math.abs(curRX - prevRX);
  const rotDeltaY = Math.abs(curRY - prevRY);
  const flipDelta = Math.abs(flipProgress - prevFlip);
  const motionDelta = Math.max(rotDeltaX, rotDeltaY, flipDelta);

  if (fieldQuality === 1 && motionDelta > FIELD_MOTION_ENTER_THRESHOLD) {
    fieldQuality = FIELD_LOW_QUALITY;
    rebuildFieldBuffer();
  } else if (fieldQuality !== 1 && motionDelta < FIELD_MOTION_EXIT_THRESHOLD) {
    fieldQuality = 1;
    rebuildFieldBuffer();
  }

  if (
    rotDeltaX > FIELD_ROT_DIRTY_THRESHOLD ||
    rotDeltaY > FIELD_ROT_DIRTY_THRESHOLD ||
    flipDelta > FIELD_FLIP_DIRTY_THRESHOLD
  ) {
    fieldDirty = true;
  }
  updateHoverVertex();

  const pv = getProjVerts();
  const p = {};
  for (const dir of ORDER) p[dir] = pv[dir].proj;

  ctx.clearRect(0, 0, W, H);

  const rawBoundScale = computeBoundsScale(p);
  const boundScale = getStableBoundScale(rawBoundScale);

  drawEmissionField(pv, p, boundScale);
  drawEdges(pv);

  const sorted = ORDER.slice().sort((a, b) => pv[a].z - pv[b].z);

  let renderedWebGLSpiral = false;
  if (spiralWebGLRenderer && spiralWebGLRenderer.available) {
    renderedWebGLSpiral = spiralWebGLRenderer.render({
      aspects,
      p,
      boundScale,
      now,
      activeRippleVertex,
      rippleFadeOut,
      rippleStartTime,
      rippleFadeStartTime,
      rippleDurationMs: RIPPLE_DURATION_MS,
    });
    if (renderedWebGLSpiral) {
      ctx.drawImage(spiralWebGLRenderer.canvas, 0, 0, W, H);
    }
  }

  if (!renderedWebGLSpiral) {
    for (const dir of sorted) {
      renderSpiral(dir, p[dir], boundScale);
    }
  }

  drawDots(sorted, p);


  const CAPTION_Y = cy + ARM + 72;
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(150,150,150,0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${currentDomain} · ${currentTerritory}`, cx, CAPTION_Y);

  drawDetailPanelOverlay();

  if (Math.abs(flipTarget - flipProgress) <= EPS && flipTarget === 1) {
    flipProgress = 1;
    flipFrom = flipTo.slice();
    flipMid = flipTo.slice();
    flipTarget = 0;
    flipProgress = 0;
  }


  if (needsAnotherFrame(rawBoundScale)) requestRender();
}

function setPlainText(el, value) {
  if (!el) return;
  el.style.whiteSpace = 'normal';
  el.textContent = String(value ?? '');
}

function initSidecar() {
  if (!window.FOUNDATION_DATA) {
    setTimeout(initSidecar, 100);
    return;
  }
  const listEl = document.getElementById('territory-list');
  let activeTerritoryEl = null;
  const territoryElementMap = new Map();
  
  // Group territories by domain
  const domainMap = {};
  window.FOUNDATION_DATA.forEach(d => {
    if (!domainMap[d.domain]) domainMap[d.domain] = new Set();
    domainMap[d.domain].add(d.territory);
  });

  Object.entries(domainMap).forEach(([domain, terrSet]) => {
    const container = document.createElement('div');
    container.className = 'domain-container';
    
    const title = document.createElement('div');
    title.className = 'domain-title';
    setPlainText(title, domain);
    container.appendChild(title);
    
    terrSet.forEach(terr => {
      const div = document.createElement('div');
      div.className = 'territory-item';
      setPlainText(div, terr);
      if (terr === currentTerritory) {
        div.classList.add('active');
        activeTerritoryEl = div;
      }
      territoryElementMap.set(terr, div);
      
      div.onclick = () => {
        if (activeTerritoryEl && activeTerritoryEl !== div) {
          activeTerritoryEl.classList.remove('active');
        }
        div.classList.add('active');
        activeTerritoryEl = div;
        loadTerritoryData(terr);
      };
      container.appendChild(div);
    });
    
    listEl.appendChild(container);
  });
  
  const allTerrs = [...new Set(window.FOUNDATION_DATA.map(d => d.territory))];
  const initialTerritory = allTerrs.includes('freedom') ? 'freedom' : allTerrs[0];
  if (!activeTerritoryEl) {
    activeTerritoryEl = territoryElementMap.get(initialTerritory) || listEl.querySelector('.territory-item');
    if (activeTerritoryEl) activeTerritoryEl.classList.add('active');
  }
  loadTerritoryData(initialTerritory);
}

resizeCanvas();
initSidecar();
requestRender();
