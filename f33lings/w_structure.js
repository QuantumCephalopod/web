const ARM = 214;
const DOT_R = 18;
const Z_DEPTH = 104;
const FOV = 1000;
const MAX_ROT = 0.30;
const FONT_SIZE = 9;
const CHAR_W = 5.4;
const CHAR_GAP = 1.8;
const SPIRAL_STEP = 3.4;
const FIRST_ORBIT = DOT_R + 10;
const HIT_RADIUS = 88;
const EPS = 0.0005;
const VIEW_MARGIN = 30;
const NAME_WEIGHT = 1.18;
const NAME_SIZE_BOOST = 1.42;
const RIPPLE_DURATION_MS  = 900;
const RIPPLE_RING_COUNT   = 4;

const DARK_TEXT = '#0f0f10';
const LIGHT_TEXT = '#f5f2ea';
const LIGHT_DISC = '#f7f4ee';
const DARK_DISC = '#151517';

const verts3D = {
  w: [0, -ARM, +Z_DEPTH],
  y: [0, +ARM, +Z_DEPTH],
  x: [-ARM, 0, -Z_DEPTH],
  z: [+ARM, 0, -Z_DEPTH],
};

const ORDER = ['w', 'x', 'y', 'z'];
const DIAG_PAIRS = [['w', 'x'], ['w', 'z'], ['y', 'x'], ['y', 'z']];

// Path-tensor runtime law constants (w = structural definitions)
const PT_NODE_IMAGE_LITERAL = 'ImageLiteral';
const PT_SCOPE_TOP = 'top';
