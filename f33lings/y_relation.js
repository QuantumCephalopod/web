function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function normalize3([x, y, z]) {
  const m = Math.hypot(x, y, z) || 1;
  return [x / m, y / m, z / m];
}

function qNormalize([w, x, y, z]) {
  const m = Math.hypot(w, x, y, z) || 1;
  return [w / m, x / m, y / m, z / m];
}

function qFromAxisAngle(axis, angle) {
  const [ax, ay, az] = normalize3(axis);
  const h = angle * 0.5;
  const s = Math.sin(h);
  return qNormalize([Math.cos(h), ax * s, ay * s, az * s]);
}

function qMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function qSlerp(a, b, t) {
  let cosom = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b.slice();
  if (cosom < 0) {
    cosom = -cosom;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (cosom > 0.9995) {
    return qNormalize([
      lerp(a[0], bb[0], t),
      lerp(a[1], bb[1], t),
      lerp(a[2], bb[2], t),
      lerp(a[3], bb[3], t),
    ]);
  }
  const omega = Math.acos(clamp(cosom, -1, 1));
  const sinom = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / sinom;
  const s1 = Math.sin(t * omega) / sinom;
  return [
    a[0] * s0 + bb[0] * s1,
    a[1] * s0 + bb[1] * s1,
    a[2] * s0 + bb[2] * s1,
    a[3] * s0 + bb[3] * s1,
  ];
}

function qRotateVec(q, [x, y, z]) {
  const qv = [0, x, y, z];
  const qc = [q[0], -q[1], -q[2], -q[3]];
  const r = qMul(qMul(q, qv), qc);
  return [r[1], r[2], r[3]];
}

// Hydrate x_state variables using y_relation math now that it's loaded
SWAP_AXIS = normalize3([1 / Math.SQRT2, 1 / Math.SQRT2, 0]);
qA = [1, 0, 0, 0];
qB = qFromAxisAngle(SWAP_AXIS, Math.PI);

flipFrom = qA.slice();
flipTo = qA.slice();
flipMid = qA.slice();

function qApplyToOrientation(baseQ, axis, angle) {
  return qNormalize(qMul(qFromAxisAngle(axis, angle), baseQ));
}

function buildMidPose(baseFrom, vertex) {
  const map = {
    w: { axis: [1, 0, 0], angle: 0.62 },
    y: { axis: [1, 0, 0], angle: -0.62 },
    x: { axis: [0, 1, 0], angle: -0.62 },
    z: { axis: [0, 1, 0], angle: 0.62 },
  };
  const cfg = map[vertex] || map.w;
  return qApplyToOrientation(baseFrom, cfg.axis, cfg.angle);
}

function currentBaseOrientation() {
  const t = easeInOut(flipProgress);
  if (t < 0.5) {
    return qSlerp(flipFrom, flipMid, t / 0.5);
  }
  return qSlerp(flipMid, flipTo, (t - 0.5) / 0.5);
}

function currentOrientation() {
  const base = currentBaseOrientation();
  const qTiltY = qFromAxisAngle([0, 1, 0], curRY);
  const qTiltX = qFromAxisAngle([1, 0, 0], curRX);
  return qMul(qTiltY, qMul(qTiltX, base));
}

function project([x, y, z]) {
  const s = FOV / (FOV + z);
  return { x: cx + x * s, y: cy + y * s, scale: s, z };
}

function getProjVerts() {
  const out = {};
  const q = currentOrientation();

  for (const [dir, v] of Object.entries(verts3D)) {
    const rv = qRotateVec(q, v);
    out[dir] = { proj: project(rv), z: rv[2] };
  }
  return out;
}

function getProjVertsMap() {
  const pv = getProjVerts();
  const p = {};
  for (const dir of ORDER) p[dir] = pv[dir].proj;
  return p;
}

function computeBoundsScale(projMap) {
  let required = 1;

  for (const dir of ORDER) {
    const { x, y, scale } = projMap[dir];
    const armDx = x - cx;
    const armDy = y - cy;
    const armD = Math.hypot(armDx, armDy) || 1;
    const ox = armDx / armD;
    const oy = armDy / armD;
    const cache = aspects[dir].cache;
    const baseBound = cache.outerR * scale * NAME_WEIGHT + 12 * scale;

    const ax = Math.abs(ox) < 1e-6 ? Infinity : (ox > 0 ? (W - VIEW_MARGIN - x) / ox : (VIEW_MARGIN - x) / ox);
    const ay = Math.abs(oy) < 1e-6 ? Infinity : (oy > 0 ? (H - VIEW_MARGIN - y) / oy : (VIEW_MARGIN - y) / oy);
    const availableAlongAxis = Math.min(ax, ay);

    if (availableAlongAxis > 0 && Number.isFinite(availableAlongAxis)) {
      required = Math.min(required, availableAlongAxis / baseBound);
    }
  }

  return Math.max(0.68, Math.min(1, required));
}

function getStableBoundScale(rawBoundScale) {
  const flipping = Math.abs(flipTarget - flipProgress) > 0.001;

  if (flipping) {
    boundScaleState = Math.min(boundScaleState, rawBoundScale);
  } else {
    boundScaleState += (rawBoundScale - boundScaleState) * 0.18;
    if (Math.abs(rawBoundScale - boundScaleState) < 0.0005) {
      boundScaleState = rawBoundScale;
    }
  }

  return boundScaleState;
}

function buildSpiralLayout(name, text) {
  const cleanText = text.replace(/-+$/, '').trim();
  const normalizedName = normalizeText(name);
  const normalizedBody = normalizeText(`· ${cleanText}`);
  const nameChars = [...normalizedName].length;
  const bodyChars = [...normalizedBody];
  const glyphs = [];
  const nameGlyphs = [];
  const bodyGlyphs = [];
  const slotSize = CHAR_W + CHAR_GAP;

  function advanceAt(turnPos, isName) {
    const localSlot = slotSize * (isName ? NAME_SIZE_BOOST : 1);
    const r = FIRST_ORBIT + SPIRAL_STEP * turnPos;
    const arcFactor = Math.sqrt(r * r + SPIRAL_STEP * SPIRAL_STEP);
    return localSlot / Math.max(arcFactor, 0.001);
  }

  let turnPos = 0;
  let nameAngleSum = 0;
  for (let i = 0; i < nameChars; i++) {
    nameAngleSum += turnPos;
    turnPos += advanceAt(turnPos, true);
  }

  const nameCenterOffset = nameChars > 0 ? nameAngleSum / nameChars : 0;
  const thetaStart = -Math.PI / 2 - nameCenterOffset;

  turnPos = 0;
  for (const ch of [...normalizedName]) {
    const theta = thetaStart + turnPos;
    const r = FIRST_ORBIT + SPIRAL_STEP * turnPos;
    const glyph = {
      char: ch,
      cos: Math.cos(theta),
      sin: Math.sin(theta),
      rotation: theta + Math.PI / 2,
      radius: r,
      isName: true,
      baseX: Math.cos(theta) * r,
      baseY: Math.sin(theta) * r,
    };
    glyphs.push(glyph);
    nameGlyphs.push(glyph);
    turnPos += advanceAt(turnPos, true);
  }

  const RADIAL_CLEARANCE_PX = 22;
  turnPos += RADIAL_CLEARANCE_PX / SPIRAL_STEP;

  let bodyTurn = turnPos;
  const rawBodySlots = [];
  let outerR = FIRST_ORBIT + SPIRAL_STEP * bodyTurn;

  for (let i = 0; i < bodyChars.length; i++) {
    rawBodySlots.push({ turn: bodyTurn, radius: FIRST_ORBIT + SPIRAL_STEP * bodyTurn });
    outerR = FIRST_ORBIT + SPIRAL_STEP * bodyTurn;
    bodyTurn += advanceAt(bodyTurn, false);
  }

  const outermostTurn = rawBodySlots.length ? rawBodySlots[rawBodySlots.length - 1].turn : turnPos;
  const bodySlots = rawBodySlots.map(slot => {
    const theta = -Math.PI / 2 + (outermostTurn - slot.turn);
    return { theta, radius: slot.radius };
  });

  for (let i = 0; i < bodyChars.length; i++) {
    const slot = bodySlots[bodySlots.length - 1 - i];
    const glyph = {
      char: bodyChars[i],
      cos: Math.cos(slot.theta),
      sin: Math.sin(slot.theta),
      rotation: slot.theta + Math.PI / 2,
      radius: slot.radius,
      isName: false,
      baseX: Math.cos(slot.theta) * slot.radius,
      baseY: Math.sin(slot.theta) * slot.radius,
    };
    glyphs.push(glyph);
    bodyGlyphs.push(glyph);
  }

  return {
    normalized: `${normalizedName} ${normalizedBody}`.trim(),
    chars: glyphs.map(g => g.char),
    glyphs,
    nameGlyphs,
    bodyGlyphs,
    outerR,
    nameChars,
    thetaStart,
  };
}

let territoryDataIndex = null;

function buildTerritoryDataIndex() {
  if (!window.FOUNDATION_DATA) return null;

  const index = new Map();
  for (const item of window.FOUNDATION_DATA) {
    let entry = index.get(item.territory);
    if (!entry) {
      entry = { items: [], lights: [], shadows: [] };
      index.set(item.territory, entry);
    }
    entry.items.push(item);
    if (item.charge === 'light') entry.lights.push(item);
    if (item.charge === 'shadow') entry.shadows.push(item);
  }
  return index;
}

function loadTerritoryData(territory) {
  if (!window.FOUNDATION_DATA) return;
  if (!territoryDataIndex) territoryDataIndex = buildTerritoryDataIndex();
  if (!territoryDataIndex) return;

  const entry = territoryDataIndex.get(territory);
  if (!entry || entry.items.length !== 4) return;

  const items = entry.items;
  const lights = entry.lights;
  const shadows = entry.shadows;
  
  currentTerritory = territory;
  currentDomain = items[0].domain;

  function makeAspect(d, charge) {
    return {
      symbol:             d?.aspect_symbol    || '',
      name:               d?.aspect_name      || '',
      charge,
      // Spiral body text
      text: `${d?.create_aspect || ''}. ${d?.copy_aspect || ''}. ${d?.control_aspect || ''}`,
      // Detail panel fields
      autonomous_essence: d?.autonomous_essence || '',
      create_aspect:      d?.create_aspect      || '',
      copy_aspect:        d?.copy_aspect        || '',
      control_aspect:     d?.control_aspect     || '',
      domain:             d?.domain             || '',
      territory:          d?.territory          || '',
    };
  }

  aspects = {
    w: makeAspect(lights[0],  'light'),
    y: makeAspect(lights[1],  'light'),
    x: makeAspect(shadows[0], 'shadow'),
    z: makeAspect(shadows[1], 'shadow'),
  };

  for (const dir of ORDER) {
    aspects[dir].cache = buildSpiralLayout(aspects[dir].name, aspects[dir].text);
  }
  
  const pMap = getProjVertsMap();
  boundScaleState = computeBoundsScale(pMap);
  
  fieldDirty = true;
  requestRender();
}

function needsAnotherFrame(rawBoundScale) {
  const nextBoundScale = rawBoundScale ?? computeBoundsScale(getProjVertsMap());
  const hasActiveRipple =
    typeof activeRippleVertex !== 'undefined' && activeRippleVertex !== null;
  const hasRippleFadeOut =
    typeof rippleFadeOut !== 'undefined' && rippleFadeOut;
  return (
    hasActiveRipple ||
    hasRippleFadeOut ||
    Math.abs(flipTarget - flipProgress) > EPS ||
    Math.abs(targetRX - curRX) > EPS ||
    Math.abs(targetRY - curRY) > EPS ||
    Math.abs(nextBoundScale - boundScaleState) > EPS
  );
}
