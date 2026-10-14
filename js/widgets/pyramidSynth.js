// Playground (Ch 3): pyramidal KLT on a synthetic scene with a known answer.
// Frame t+1 is frame t shifted by exactly (u, v) (plus noise), so the error of
// every estimate is known. Compares:
//   one-shot  one linear least-squares step at full resolution (Chapter 1)
//   KLT       coarse-to-fine pyramid, iterating at every level
// and lists every level: centre, starting guess (2 × the coarser result), result.

import { shell, slider, controls, crisp } from './pg.js';
import { buildPyramid, lkPyramid, lkTranslation, structureTensor, gradients, eig2 } from '../lib/imageOps.js';

const S = 256;                    // image size (px)
const VIEW = 300;                 // drawn size (CSS px)

// The scene: smooth-edged shapes on a dark background (values 0..1).
const edge = (d) => 1 / (1 + Math.exp(-d / 0.9));               // soft step, ~2 px wide
function scene(x, y) {
  let v = 0.16;
  // square
  v += 0.6 * edge(Math.min(x - 60, 124 - x, y - 52, 112 - y));
  // tall bar
  v += 0.55 * edge(Math.min(x - 184, 220 - x, y - 36, 224 - y));
  // round blob
  v += 0.45 * edge(6 - Math.hypot(x - 146, y - 150));
  // textured disc: checkerboard inside a circle
  const inDisc = edge(34 - Math.hypot(x - 78, y - 190));
  const chk = (Math.floor(x / 11) + Math.floor(y / 11)) % 2 ? 0.62 : 0.06;
  v += inDisc * chk;
  return v;
}
const PRESETS = {
  Corner: [60, 52], Edge: [184, 130], Flat: [140, 40], Texture: [78, 190], 'Round blob': [146, 150],
};

export function mountPyramidSynth(el) {
  const root = shell(el, {
    id: 'pyrsynth',
    title: 'Coarse-to-fine tracking on a test scene',
    intro: 'Frame $t+1$ is frame $t$ moved by exactly $(u, v)$, so every answer can be checked. **One-shot** is a single linear step at full resolution (Chapter 1); **KLT** solves at the coarsest pyramid level first and starts each finer level from twice the coarser result. Try *Large motion*, then set the pyramid to 1 level. The textured disc needs all 4 levels: its repeating squares look alike at every shift smaller than the pattern. Click a frame to pick a point, or use the presets.',
    body: `
  <div class="pg__row pg__row--dark">
    <figure class="pg__fig"><canvas data-c="f0" aria-label="Frame t; click to choose a point"></canvas>
      <figcaption>Frame $t$ — click to choose a point</figcaption></figure>
    <figure class="pg__fig"><canvas data-c="f1" aria-label="Frame t+1 with the true and estimated windows"></canvas>
      <figcaption>Frame $t{+}1$ — <span class="key" data-key="good">truth</span> <span class="key" data-key="tracked">KLT estimate</span></figcaption></figure>
  </div>
  <div class="pg__buttons" role="group" aria-label="Choose a point">${Object.keys(PRESETS).map((k) => `<button type="button" class="btn btn--ghost btn--small" data-p="${k}">${k}</button>`).join('')}</div>
  <div class="pg__controls">
    ${slider({ key: 'u', label: 'motion $u$', min: -12, max: 12, step: 0.1, value: 2.4 })}
    ${slider({ key: 'v', label: 'motion $v$', min: -12, max: 12, step: 0.1, value: -1.3 })}
    ${slider({ key: 'half', label: 'window', min: 2, max: 15, step: 1, value: 7 })}
    ${slider({ key: 'levels', label: 'pyramid levels', min: 1, max: 4, step: 1, value: 3 })}
    ${slider({ key: 'iters', label: 'iterations per level', min: 1, max: 20, step: 1, value: 10 })}
    ${slider({ key: 'noise', label: 'noise', min: 0, max: 0.1, step: 0.005, value: 0.01 })}
  </div>
  <div class="pg__buttons"><button type="button" class="btn btn--ghost btn--small" data-m="small">Small motion (2.4, −1.3)</button>
    <button type="button" class="btn btn--ghost btn--small" data-m="large">Large motion (9, −6)</button></div>
  <table class="pg__readout pg__readout--levels"><thead><tr><th>level</th><th>centre</th><th>start guess $\\mathbf{g}$</th><th>result $\\mathbf{d}$</th><th>steps</th></tr></thead><tbody data-r="levels"></tbody></table>
  <p class="widget__meta">Each row starts from twice the previous row's result. The window is the same size at every level, so it covers more of the scene on coarse levels.</p>
  <table class="pg__readout pg__summary"><tbody>
    <tr><th>truth</th><td data-r="truth"></td></tr>
    <tr><th>one-shot</th><td data-r="one"></td></tr>
    <tr><th>KLT</th><td data-r="klt"></td></tr>
    <tr><th>window</th><td data-r="cls"></td></tr>
  </tbody></table>`,
  });
  const $ = (s) => root.querySelector(s);
  const c0 = $('[data-c="f0"]'), c1 = $('[data-c="f1"]');
  let pt = PRESETS.Corner.slice();
  let cache = null;

  const get = controls(root, {
    u: (v) => (v >= 0 ? '+' : '') + v.toFixed(2), v: (v) => (v >= 0 ? '+' : '') + v.toFixed(2),
    half: (v) => `${2 * v + 1}×${2 * v + 1}`, levels: String, iters: String, noise: (v) => v.toFixed(3),
  }, update);

  // Render both frames (deterministic noise so results don't flicker).
  function render(u, v, noise) {
    const key = `${u},${v},${noise}`;
    if (cache?.key === key) return cache;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    const g0 = new Float32Array(S * S), g1 = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      g0[y * S + x] = scene(x, y) + noise * rnd();
      g1[y * S + x] = scene(x - u, y - v) + noise * rnd();
    }
    cache = { key, g0, g1, P0: buildPyramid(g0, S, S, 4), P1: buildPyramid(g1, S, S, 4) };
    return cache;
  }

  function paint(canvas, gray, boxes) {
    const ctx = crisp(canvas, VIEW, VIEW), k = VIEW / S;
    const img = new ImageData(S, S);
    for (let i = 0; i < S * S; i++) { const g = Math.max(0, Math.min(255, gray[i] * 255)); img.data.set([g, g, g, 255], i * 4); }
    const tmp = Object.assign(document.createElement('canvas'), { width: S, height: S });
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0, VIEW, VIEW);
    for (const { x, y, half, color, dash } of boxes) {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash ? [4, 3] : []);
      ctx.strokeRect((x - half - 0.5) * k, (y - half - 0.5) * k, (2 * half + 1) * k, (2 * half + 1) * k);
    }
    ctx.setLineDash([]);
  }

  function update() {
    const u = get('u'), v = get('v'), half = get('half'), levels = get('levels'), iters = get('iters');
    const { g0, g1, P0, P1 } = render(u, v, get('noise'));
    const [x, y] = pt;
    const klt = lkPyramid(P0, P1, x, y, half, levels, { maxIter: iters, eps: 0.01 });
    const one = lkTranslation(g0, g1, S, S, x, y, half, { maxIter: 1, eps: 0 });
    const errK = Math.hypot(klt.p[0] - u, klt.p[1] - v), errO = Math.hypot(one.p[0] - u, one.p[1] - v);

    paint(c0, g0, [{ x, y, half, color: '#ffb020' }]);
    paint(c1, g1, [
      { x, y, half, color: 'rgba(255,255,255,.6)', dash: true },
      { x: x + u, y: y + v, half, color: '#34d399' },
      { x: x + klt.p[0], y: y + klt.p[1], half, color: '#ffb020' },
    ]);
    // dot at the chosen point
    const ctx = c0.getContext('2d');
    ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(x * VIEW / S, y * VIEW / S, 3, 0, Math.PI * 2); ctx.fill();

    const f = (p) => `(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`;
    $('[data-r="levels"]').innerHTML = klt.log.map(({ level, guess, p, steps, converged }) => `
      <tr><td>${level}</td><td>(${(x / 2 ** level).toFixed(1)}, ${(y / 2 ** level).toFixed(1)})</td><td>${f(guess)}</td><td>${f(p)}</td><td>${steps}${converged ? '' : '*'}</td></tr>`).join('');
    const sgn = (n) => (n >= 0 ? '+' : '') + n.toFixed(2);
    const cls = (e) => `<span class="pg__err" data-ok="${e < 0.25}">err ${e.toFixed(2)}</span>`;
    $('[data-r="truth"]').textContent = `(${sgn(u)}, ${sgn(v)})`;
    $('[data-r="one"]').innerHTML = `(${sgn(one.p[0])}, ${sgn(one.p[1])}) ${cls(errO)}`;
    $('[data-r="klt"]').innerHTML = `(${sgn(klt.p[0])}, ${sgn(klt.p[1])}) ${cls(errK)}`;

    // Is the window well-posed? Structure tensor of frame t at the point.
    const { Ix, Iy } = gradients(g0, S, S);
    const T = structureTensor(Ix, Iy, S, S, x, y, half);
    const { l1, l2 } = eig2(T.a, T.b, T.c);
    const n = (2 * half + 1) ** 2, lo = 2e-4 * n;
    $('[data-r="cls"]').textContent = l1 < lo ? 'flat: no information (ill-posed)'
      : l2 < lo || l1 / l2 > 50 ? 'edge: only motion across it is measurable (ill-posed)'
        : 'corner or texture: well-posed';
  }

  const pick = (canvas) => (e) => {
    const r = canvas.getBoundingClientRect();
    const h = get('half');
    pt = [Math.round(((e.clientX - r.left) / r.width) * S), Math.round(((e.clientY - r.top) / r.height) * S)]
      .map((c) => Math.max(h + 1, Math.min(S - h - 2, c)));
    update();
  };
  c0.addEventListener('click', pick(c0));
  c1.addEventListener('click', pick(c1));
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { pt = PRESETS[b.dataset.p].slice(); update(); }));
  root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    const [u, v] = b.dataset.m === 'large' ? [9, -6] : [2.4, -1.3];
    for (const [k, val] of [['u', u], ['v', v]]) {
      const i = root.querySelector(`[data-i="${k}"]`); i.value = val; i.dispatchEvent(new Event('input'));
    }
  }));

  update();
}
