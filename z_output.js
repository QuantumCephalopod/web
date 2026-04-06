const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const fieldCanvas = document.createElement('canvas');
const fieldCtx = fieldCanvas.getContext('2d', { alpha: false });

function rebuildFieldBuffer() {
  const scale = Math.min(1.35, Math.max(0.78, Math.min(W, H) / 900));
  FIELD_W = Math.max(120, Math.round(180 * scale));
  FIELD_H = Math.max(120, Math.round(180 * scale));
  fieldCanvas.width = FIELD_W;
  fieldCanvas.height = FIELD_H;
  fieldImage = fieldCtx.createImageData(FIELD_W, FIELD_H);
  fieldDirty = true;
}

function createSpiralBake(cache) {
  function makeBake(fillStyle) {
    const off = document.createElement('canvas');
    off.width = SPIRAL_BAKE_SIZE;
    off.height = SPIRAL_BAKE_SIZE;
    const octx = off.getContext('2d');
    const ox = off.width / 2;
    const oy = off.height / 2;

    octx.textBaseline = 'middle';
    octx.textAlign = 'center';
    octx.fillStyle = fillStyle;

    for (let i = cache.nameChars; i < cache.glyphs.length; i++) {
      const g = cache.glyphs[i];
      const px = g.cos * g.radius;
      const py = g.sin * g.radius;
      octx.save();
      octx.translate(ox + px, oy + py);
      octx.rotate(g.rotation);
      octx.font = `${FONT_SIZE}px monospace`;
      octx.fillText(g.char, 0, 0);
      octx.restore();
    }

    return off;
  }

  cache.bakeCanvasDark = makeBake(DARK_TEXT);
  cache.bakeCanvasLight = makeBake(LIGHT_TEXT);
  cache.bakeHalf = SPIRAL_BAKE_SIZE / 2;
  cache.bakeRadius = cache.outerR + SPIRAL_BAKE_MARGIN;
}

function requestRender() {
  if (!rafId) rafId = requestAnimationFrame(render);
}

function updateHoverVertex() {
  if (!mouseInside) {
    hoverVertex = null;
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

  hoverVertex = bestD2 < HIT_RADIUS * HIT_RADIUS ? nearest : null;
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
  targetRY = ((mouseX) / W - 0.5) * 2 * MAX_ROT;
  targetRX = -((mouseY) / H - 0.5) * 2 * MAX_ROT;
  mouseInside = true;
  updateHoverVertex();
  fieldDirty = true;
  requestRender();
});

canvas.addEventListener('mouseleave', () => {
  targetRX = 0;
  targetRY = 0;
  mouseX = cx;
  mouseY = cy;
  mouseInside = false;
  hoverVertex = null;
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

      return { sign, vx, vy, sigma, amp };
    });

    let idx = 0;
    for (let y = 0; y < FIELD_H; y++) {
      for (let x = 0; x < FIELD_W; x++) {
        let f = 0;

        for (const n of nodes) {
          const dx = x - n.vx;
          const dy = y - n.vy;
          const s2 = n.sigma * n.sigma;
          f += n.sign * n.amp * Math.exp(-(dx * dx + dy * dy) / (2 * s2));
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

function renderSpiralBase(dir, projVert, boundScale) {
  const { charge, cache } = aspects[dir];
  const { x, y, scale } = projVert;
  const localScale = scale * boundScale;
  const bakedRadiusPx = cache.bakeRadius * localScale;
  const bakedSizePx = bakedRadiusPx * 2;
  const srcHalf = cache.bakeRadius;
  const srcSize = srcHalf * 2;

  const bakeCanvas = charge === 'light' ? cache.bakeCanvasDark : cache.bakeCanvasLight;

  ctx.drawImage(
    bakeCanvas,
    cache.bakeHalf - srcHalf,
    cache.bakeHalf - srcHalf,
    srcSize,
    srcSize,
    x - bakedRadiusPx,
    y - bakedRadiusPx,
    bakedSizePx,
    bakedSizePx
  );
}

function renderAspectName(dir, projVert, boundScale) {
  const { charge, cache } = aspects[dir];
  const { x, y, scale } = projVert;
  const localScale = scale * boundScale;
  const textFill = charge === 'light' ? DARK_TEXT : LIGHT_TEXT;

  ctx.save();
  ctx.translate(x, y);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = textFill;

  const hoverEnabled = mouseInside && Math.abs(flipTarget - flipProgress) < 0.001 && hoverVertex === dir;

  for (let i = 0; i < cache.nameChars; i++) {
    const g = cache.glyphs[i];
    let px = g.cos * g.radius * localScale;
    let py = g.sin * g.radius * localScale;
    const rotation = g.rotation;
    const glyphFs = FONT_SIZE * scale * NAME_SIZE_BOOST;

    const gx = x + px;
    const gy = y + py;
    const d = Math.hypot(mouseX - gx, mouseY - gy);
    const t = hoverEnabled ? Math.max(0, 1 - d / NAME_PROX_RADIUS) : 0;
    const eased = t * t;
    const extraAlong = eased * NAME_GAP_BOOST * scale;
    const extraRadial = eased * NAME_RADIAL_BOOST * scale;
    px += Math.cos(rotation) * extraAlong + g.cos * extraRadial;
    py += Math.sin(rotation) * extraAlong + g.sin * extraRadial;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rotation);
    ctx.font = `${glyphFs}px monospace`;
    ctx.fillText(g.char, 0, 0);
    ctx.restore();
  }

  ctx.restore();
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

  const prevRX = curRX;
  const prevRY = curRY;
  const prevFlip = flipProgress;

  curRX += (targetRX - curRX) * 0.08;
  curRY += (targetRY - curRY) * 0.08;
  flipProgress += (flipTarget - flipProgress) * 0.09;

  if (
    Math.abs(curRX - prevRX) > EPS ||
    Math.abs(curRY - prevRY) > EPS ||
    Math.abs(flipProgress - prevFlip) > EPS
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
    renderSpiralBase(dir, p[dir], boundScale);
  }

  drawDots(sorted, p);

  for (const dir of sorted) {
    renderAspectName(dir, p[dir], boundScale);
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

  if (needsAnotherFrame() || mouseInside) requestRender();
}

function initSidecar() {
  if (!window.FOUNDATION_DATA) {
    setTimeout(initSidecar, 100);
    return;
  }
  const listEl = document.getElementById('territory-list');
  
  const territories = [...new Set(window.FOUNDATION_DATA.map(d => d.territory))];
  
  territories.forEach(terr => {
    const div = document.createElement('div');
    div.className = 'territory-item';
    div.textContent = terr;
    if (terr === currentTerritory) div.classList.add('active');
    
    div.onclick = () => {
      document.querySelectorAll('.territory-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      loadTerritoryData(terr);
    };
    listEl.appendChild(div);
  });
  
  loadTerritoryData(territories.includes('freedom') ? 'freedom' : territories[0]);
}

resizeCanvas();
initSidecar();
requestRender();
