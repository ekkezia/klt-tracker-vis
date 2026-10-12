// Materials for the simulator.
//  - photo(id):  CC0 photo textures from Poly Haven (sim/textures/*.jpg), tiled at
//                their real-world size, so geometry UVs are simply in metres.
//  - canvas textures for things that must carry specific content: shop signs,
//    shop interiors, the docking target, the truck's panel grime.

import * as THREE from 'three';

// Real-world size of one texture tile (metres), from the Poly Haven asset info.
const SIZE = {
  asphalt_02: 3.0, bark_platanus: 1.5, brick_wall_08: 1.9, concrete_pavement: 1.8,
  corrugated_iron: 1.12, granite_tile: 2.3, grey_plaster: 1.0, hexagonal_concrete_paving: 1.6,
  leafy_grass: 2.0, painted_brick: 1.8, painted_metal_shutter: 2.0, painted_worn_brick: 1.8,
  rectangular_facade_tiles: 2.0, red_brick_03: 1.0, red_bricks_04: 2.5, rusted_shutter: 1.8,
};

export const FACADES = ['red_brick_03', 'red_bricks_04', 'brick_wall_08', 'painted_brick', 'painted_worn_brick', 'grey_plaster'];
export const SHUTTERS = ['painted_metal_shutter', 'rusted_shutter'];

export function createMaterials(renderer, base = './textures/') {
  const loader = new THREE.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const cache = new Map();
  const pending = [];

  function tex(id) {
    if (cache.has(id)) return cache.get(id);
    let done;
    pending.push(new Promise((res) => { done = res; }));
    const t = loader.load(`${base}${id}.jpg`, () => done(), undefined, () => done());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    const s = SIZE[id] ?? 2;
    t.repeat.set(1 / s, 1 / s);
    cache.set(id, t);
    return t;
  }

  const mats = new Map();
  /** Standard material with a metre-scaled photo texture. */
  function photo(id, opts = {}) {
    const key = id + JSON.stringify(opts);
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ map: tex(id), roughness: 0.9, metalness: 0, ...opts }));
    return mats.get(key);
  }

  return {
    photo,
    flat: (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts }),
    /** Resolves when every photo texture has been uploaded. */
    ready: () => Promise.all(pending),
  };
}

// --- shop signs ---------------------------------------------------------------
// Generic category signage (no invented business names). Real names from
// OpenStreetMap are used where a shop is mapped next to the storefront.
export const GENERIC_SIGNS = [
  ['麵包西餅', 'BAKERY', '#c8102e', '#ffd54a'],
  ['海鮮', 'SEAFOOD', '#0b5394', '#ffffff'],
  ['藥房', 'PHARMACY', '#1e7b34', '#ffffff'],
  ['超級市場', 'SUPERMARKET', '#e2b007', '#8b0000'],
  ['茶餐廳', 'CAFE', '#8b0000', '#ffd700'],
  ['五金', 'HARDWARE', '#2b2b2b', '#ffcc00'],
  ['水果', 'FRUIT', '#2e7d32', '#fff59d'],
  ['珠寶', 'JEWELRY', '#5d1a1a', '#e6c35c'],
  ['餐館', 'RESTAURANT', '#b71c1c', '#ffffff'],
  ['旅行社', 'TRAVEL', '#1565c0', '#ffffff'],
  ['手機', 'MOBILE', '#212121', '#4fc3f7'],
  ['洗衣', 'LAUNDRY', '#00838f', '#ffffff'],
  ['點心', 'DIM SUM', '#a31515', '#fff3c4'],
  ['雜貨', 'GROCERY', '#f5f0e1', '#b71c1c'],
];

const CJK_FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

export function signTexture([zh, en, bg, fg], realName = null) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = fg; g.textBaseline = 'middle';
  if (realName) {
    realName = realName.replace(/\s+(Corporation|Corp\.?|Inc\.?|LLC)$/i, '');
    g.font = `800 ${realName.length > 18 ? 56 : 74}px Helvetica, Arial, sans-serif`;
    g.textAlign = 'center';
    g.fillText(realName.toUpperCase(), c.width / 2, c.height / 2 + 2, c.width - 60);
  } else {
    g.font = `800 112px ${CJK_FONT}`;
    g.textAlign = 'left';
    g.fillText(zh, 40, c.height / 2 + 4);
    g.font = '700 54px Helvetica, Arial, sans-serif';
    g.textAlign = 'right';
    g.fillText(en, c.width - 40, c.height / 2 + 4);
  }
  return canvasTex(c);
}

/** A shop interior seen through glass: rows of small goods, a counter, lights. */
export function interiorTexture(seed, kind = 'shop') {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  // Back wall and ceiling.
  g.fillStyle = `hsl(${30 + r() * 30}, 18%, ${22 + r() * 12}%)`; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(255,246,225,0.95)'; g.fillRect(40 + i * 140, 8, 90, 7); }
  if (kind === 'bakery') {
    // Menu board, then glass display case with trays of buns and tarts.
    g.fillStyle = '#7a1b16'; g.fillRect(120, 40, 780, 110);
    g.fillStyle = '#ffe9a8'; g.font = '700 46px "PingFang SC", "Hiragino Sans GB", sans-serif'; g.textAlign = 'center';
    g.fillText('菠蘿包 · 蛋撻 · 叉燒包 · 雞尾包', 512, 112);
    g.fillStyle = '#c9b89a'; g.fillRect(0, 230, 1024, 282);           // counter body
    for (let row = 0; row < 3; row++) {
      const y = 250 + row * 78;
      g.fillStyle = '#9aa0a3'; g.fillRect(20, y + 52, 984, 6);       // glass shelf
      for (let x = 30; x < 990; x += 34 + r() * 10) {
        const tart = r() < 0.35;
        g.fillStyle = tart ? '#f2c12e' : `hsl(${28 + r() * 12}, ${55 + r() * 20}%, ${42 + r() * 18}%)`;
        g.beginPath(); g.ellipse(x + 14, y + 40, 14, tart ? 8 : 11, 0, 0, 7); g.fill();
        if (tart) { g.strokeStyle = '#b5772a'; g.lineWidth = 3; g.stroke(); }
      }
      for (let x = 30; x < 990; x += 120) { g.fillStyle = '#fff'; g.fillRect(x, y + 58, 34, 14); }  // price tags
    }
  } else {
    for (let row = 0; row < 7; row++) {                                  // shelves with small goods
      const y = 40 + row * 62;
      g.fillStyle = '#3a3128'; g.fillRect(0, y + 50, 1024, 6);
      for (let x = 4; x < 1020;) {
        const w = 10 + r() * 18;
        g.fillStyle = `hsl(${r() * 360}, ${30 + r() * 45}%, ${32 + r() * 38}%)`;
        g.fillRect(x, y + 50 - (16 + r() * 26), w - 3, 50);
        x += w;
      }
    }
    g.fillStyle = '#5b4a3a'; g.fillRect(0, 420, 1024, 92);              // counter
  }
  g.fillStyle = 'rgba(170,195,215,0.16)'; g.fillRect(0, 0, 1024, 512);   // glass sheen
  return canvasTex(c);
}

/** Docking target: a black/white checkerboard with a quiet zone and a label. */
export function dockTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 640;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 512, 640);
  const n = 7, s = 56, ox = (512 - n * s) / 2, oy = 40;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i + j) % 2 === 0) { g.fillStyle = '#111'; g.fillRect(ox + i * s, oy + j * s, s, s); }
  }
  g.fillStyle = '#0e7490'; g.fillRect(0, 470, 512, 170);
  g.fillStyle = '#fff'; g.font = '800 64px Helvetica, Arial, sans-serif'; g.textAlign = 'center';
  g.fillText('WREN DOCK', 256, 545);
  g.font = '500 30px Helvetica, Arial, sans-serif';
  g.fillText('charging bay · Seward Park', 256, 600);
  return canvasTex(c);
}

/** Off-white panel with faint grime, for the box truck (flat, but not perfectly uniform). */
export function panelTexture(seed = 1) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ecebe6'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(90,80,70,${r() * 0.035})`;
    g.fillRect(r() * 512, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  const grad = g.createLinearGradient(0, 200, 0, 256);
  grad.addColorStop(0, 'rgba(80,70,60,0)'); grad.addColorStop(1, 'rgba(80,70,60,0.18)');
  g.fillStyle = grad; g.fillRect(0, 200, 512, 56);
  return canvasTex(c);
}

/** Soft green leaf mass for tree canopies. */
export function foliageTexture() {
  const r = rng(7);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f6b2a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `hsl(${85 + r() * 40}, ${35 + r() * 30}%, ${18 + r() * 30}%)`;
    g.beginPath(); g.ellipse(r() * 256, r() * 256, 2 + r() * 4, 1 + r() * 3, r() * 3, 0, 7); g.fill();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
