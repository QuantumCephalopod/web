let W = 0, H = 0;
let cx = 0, cy = 0;
let dpr = 1;
let fieldDirty = true;
let FIELD_W = 180, FIELD_H = 180;
let fieldImage = null;

let aspects = {};
let currentTerritory = 'freedom';
let currentDomain = 'experiential';

let targetRX = 0, targetRY = 0, curRX = 0, curRY = 0;
let rafId = 0;
let mouseInside = false;
let mouseX = cx, mouseY = cy;
let hoverVertex = null;
let boundScaleState = 1;

let flipProgress = 0;
let flipTarget = 0;
let activePose = 'A';
let lastClickedVertex = 'w';

// Will be hydrated mathematically by the relational engine layer
let flipFrom, flipTo, flipMid;
let qA, qB, SWAP_AXIS;
