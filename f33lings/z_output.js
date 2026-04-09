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

function updateHoverVertex() {
  if (!mouseInside) {
    if (hoverVertex !== null) {
      hoverVertex = null;
      hoverStartTime = 0;
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

  const newHover = bestD2 < HIT_RADIUS * HIT_RADIUS ? nearest : null;
  if (hoverVertex !== newHover) {
    hoverVertex = newHover;
    hoverStartTime = newHover ? performance.now() : 0;
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
  updateHoverVertex();
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
  hoverVertex = null;
  hoverStartTime = 0;
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
    hoverVertex = nearest;

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

function ensureSpiralTextBitmap(cache) {
  if (cache.textBitmap) return cache.textBitmap;

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
  bctx.fillStyle = '#fff';

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
  cache.textBitmap = {
    canvas: bitmap,
    offsetX: centerX,
    offsetY: centerY,
  };
  return cache.textBitmap;
}

function renderSpiral(dir, projVert, boundScale) {
  const { charge, cache } = aspects[dir];
  const { x, y, scale } = projVert;
  const localScale = scale * boundScale;
  const textFill = charge === 'light' ? DARK_TEXT : LIGHT_TEXT;
  const bitmap = ensureSpiralTextBitmap(cache);

  // Fade spiral out while ripple is active, fade back in when fading out
  let alpha = 1.0;
  if (activeRippleVertex === dir) {
    const now = performance.now();
    if (rippleFadeOut) {
      const t = clamp((now - rippleFadeStartTime) / (RIPPLE_DURATION_MS * 0.6), 0, 1);
      alpha = clamp(0.08 + easeInOut(t) * 0.92, 0, 1);
    } else {
      const t = clamp((now - rippleStartTime) / (RIPPLE_DURATION_MS * 0.7), 0, 1);
      alpha = clamp(1.0 - easeInOut(t) * 0.92, 0.08, 1);
    }
  }

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
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = textFill;
  ctx.fillRect(-bitmap.offsetX, -bitmap.offsetY, bitmap.canvas.width, bitmap.canvas.height);
  ctx.globalCompositeOperation = 'source-over';
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

const DETAIL_FIELD_SELECTORS = {
  address: '.detail-address',
  symbol: '.detail-symbol',
  name: '.detail-name',
  essence: '.detail-essence',
  create: '.detail-create',
  copy: '.detail-copy',
  control: '.detail-control'
};

const detailPanelState = {
  panel: null,
  fields: new Map(),
  metrics: new Map(),
  layoutCache: new Map(),
  activeDir: null,
  activeSignature: ''
};

function invalidateDetailPanelCache() {
  detailPanelState.metrics.clear();
  detailPanelState.layoutCache.clear();
}

window.addEventListener('resize', invalidateDetailPanelCache);

function getDetailPanel() {
  if (detailPanelState.panel && document.body.contains(detailPanelState.panel)) {
    return detailPanelState.panel;
  }

  const panel = document.getElementById('detail-panel');
  if (!panel) return null;

  detailPanelState.panel = panel;
  detailPanelState.fields.clear();
  for (const [fieldId, selector] of Object.entries(DETAIL_FIELD_SELECTORS)) {
    detailPanelState.fields.set(fieldId, panel.querySelector(selector));
  }
  invalidateDetailPanelCache();
  return panel;
}

function getFieldMetrics(fieldId, el) {
  let metrics = detailPanelState.metrics.get(fieldId);
  if (metrics) return metrics;

  const computed = getComputedStyle(el);
  const fontSize = parseFloat(computed.fontSize) || 16;
  const width = Math.max(80, el.clientWidth || el.offsetWidth || 240);
  const font = `${computed.fontSize} ${computed.fontFamily}`;
  const lineHeight = parseFloat(computed.lineHeight) || fontSize * 1.35;

  metrics = { width, font, lineHeight };
  detailPanelState.metrics.set(fieldId, metrics);
  return metrics;
}

// Prefer full pretext layout primitives for all UI copy blocks.
function setPretextText(el, value, fieldId = '') {
  if (!el) return;

  const raw = String(value ?? '');
  const pre = window.pretext;
  const core = pre && pre.core;
  if (!core || typeof core.prepareWithSegments !== 'function' || typeof core.layoutWithLines !== 'function') {
    el.style.whiteSpace = 'normal';
    el.textContent = raw;
    return;
  }

  const metrics = getFieldMetrics(fieldId, el);
  const cacheKey = `${fieldId}§${raw}§${metrics.width}§${metrics.font}`;
  let text = detailPanelState.layoutCache.get(cacheKey);

  if (text === undefined) {
    const prepared = core.prepareWithSegments(raw, metrics.font, { whiteSpace: 'pre-wrap' });
    const { lines } = core.layoutWithLines(prepared, metrics.width, metrics.lineHeight);
    text = lines.map((line) => line.text).join('\n');
    detailPanelState.layoutCache.set(cacheKey, text);
  }

  el.style.whiteSpace = 'pre-line';
  el.textContent = text;
}


function setPlainText(el, value) {
  if (!el) return;
  el.style.whiteSpace = 'normal';
  el.textContent = String(value ?? '');
}

function showDetailPanel(dir) {
  const a = aspects[dir];
  const panel = getDetailPanel();
  if (!panel) return;

  const nextContent = {
    address: `${a.domain} › ${a.territory} › ${a.name}`,
    symbol: a.symbol,
    name: a.name,
    essence: a.autonomous_essence,
    create: a.create_aspect,
    copy: a.copy_aspect,
    control: a.control_aspect
  };
  const nextSignature = [
    nextContent.address,
    nextContent.symbol,
    nextContent.name,
    nextContent.essence,
    nextContent.create,
    nextContent.copy,
    nextContent.control
  ].join('§');

  if (detailPanelState.activeDir === dir && detailPanelState.activeSignature === nextSignature) {
    panel.classList.add('active');
    return;
  }

  // Address line: domain → territory → aspect
  setPretextText(detailPanelState.fields.get('address'), nextContent.address, 'address');

  // Symbol + name header
  setPretextText(detailPanelState.fields.get('symbol'), nextContent.symbol, 'symbol');
  setPretextText(detailPanelState.fields.get('name'), nextContent.name, 'name');

  // Essence line
  setPretextText(detailPanelState.fields.get('essence'), nextContent.essence, 'essence');

  // Three labeled sections
  setPretextText(detailPanelState.fields.get('create'), nextContent.create, 'create');
  setPretextText(detailPanelState.fields.get('copy'), nextContent.copy, 'copy');
  setPretextText(detailPanelState.fields.get('control'), nextContent.control, 'control');

  detailPanelState.activeDir = dir;
  detailPanelState.activeSignature = nextSignature;

  // Activate (CSS handles the opacity transition)
  panel.classList.add('active');
}

function hideDetailPanel() {
  const panel = document.getElementById('detail-panel');
  if (panel) panel.classList.remove('active');
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

  // ── Trigger portal on 1.3 s dwell ──────────────────────────────────────────
  if (hoverVertex && !activeRippleVertex && hoverStartTime && now - hoverStartTime > 1300) {
    if (Math.abs(flipTarget - flipProgress) < 0.001) {
      activeRippleVertex  = hoverVertex;
      rippleStartTime     = now;
      rippleFadeOut       = false;
      showDetailPanel(activeRippleVertex);
    }
  }

  // ── Start fade-out when hover moves away / changes vertex ──────────────────
  if (activeRippleVertex && !rippleFadeOut &&
      (!hoverVertex || hoverVertex !== activeRippleVertex)) {
    rippleFadeOut      = true;
    rippleFadeStartTime = now;
    hideDetailPanel();
  }

  // ── Clean up once spiral is fully restored ─────────────────────────────────
  if (activeRippleVertex && rippleFadeOut) {
    const fadeElapsed = now - rippleFadeStartTime;
    if (fadeElapsed > RIPPLE_DURATION_MS * 0.65) {
      activeRippleVertex = null;
      rippleFadeOut      = false;
    }
  }

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

  const pv = getProjVerts();
  const p = {};
  for (const dir of ORDER) p[dir] = pv[dir].proj;

  ctx.clearRect(0, 0, W, H);

  const rawBoundScale = computeBoundsScale(p);
  const boundScale = getStableBoundScale(rawBoundScale);

  drawEmissionField(pv, p, boundScale);
  drawEdges(pv);

  const sorted = ORDER.slice().sort((a, b) => pv[a].z - pv[b].z);

  for (const dir of sorted) {
    renderSpiral(dir, p[dir], boundScale);
  }

  drawDots(sorted, p);

  for (const dir of sorted) {
    // Draw ripple rings above spirals, below dots
    if (dir === activeRippleVertex) drawRipple(dir, p);
  }

  const CAPTION_Y = cy + ARM + 72;
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(150,150,150,0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${currentDomain} · ${currentTerritory}`, cx, CAPTION_Y);

  if (Math.abs(flipTarget - flipProgress) <= EPS && flipTarget === 1) {
    flipProgress = 1;
    flipFrom = flipTo.slice();
    flipMid = flipTo.slice();
    flipTarget = 0;
    flipProgress = 0;
  }

  if (mouseInside && Math.abs(flipTarget - flipProgress) < 0.001) {
    updateHoverVertex();
  }

  // Keep ticking while ripple rings are still expanding or fading in
  const rippleActive = activeRippleVertex && (
    (!rippleFadeOut && now - rippleStartTime < RIPPLE_DURATION_MS * 1.6) ||
    rippleFadeOut
  );

  if (needsAnotherFrame(rawBoundScale) || rippleActive) requestRender();
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
