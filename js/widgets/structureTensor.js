// REFERENCE WIDGET (Chapter 2): structure tensor of a patch of the current
// video frame. Copy this file's shape when implementing the other widgets:
//   - render markup into `el` only
//   - read pixels with api.stage.grabFrame()
//   - recompute on api.stage.onFrame(...)
//   - return a cleanup function

import { STAGE } from '../config.js';
import {
  toGray, gradients, structureTensor, eig2, harris, classify, findExamples,
} from '../lib/imageOps.js';

const HARRIS_K = 0.05;
const fmt = (v) => (Math.abs(v) >= 100 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : v.toFixed(3));

export function mountStructureTensor(el, api) {
  el.innerHTML = `
<div class="widget widget--tensor">
  <p class="widget__kicker">Widget · structure tensor on the live frame</p>
  <div class="tensor-grid">
    <figure class="tensor-frame">
      <canvas data-c="frame" width="${STAGE.width}" height="${STAGE.height}" tabindex="0" role="img"
        aria-label="Current video frame. Click or use arrow keys to move the analysis window."></canvas>
      <figcaption>Click to place the window · arrow keys move it (Shift = 10 px)</figcaption>
    </figure>
    <figure class="tensor-patch">
      <canvas data-c="patch" width="180" height="180" role="img" aria-label="Magnified patch"></canvas>
      <figcaption>Patch (magnified)</figcaption>
    </figure>
    <figure class="tensor-scatter">
      <canvas data-c="scatter" width="180" height="180" role="img" aria-label="Gradient scatter plot"></canvas>
      <figcaption>Gradients $(I_x, I_y)$; ellipse = gradient spread (∝√λ)</figcaption>
    </figure>
  </div>

  <div class="tensor-controls">
    <div class="presets" role="group" aria-label="Jump to an example">
      <button type="button" class="btn btn--ghost btn--small" data-preset="flat">Flat</button>
      <button type="button" class="btn btn--ghost btn--small" data-preset="edge">Edge</button>
      <button type="button" class="btn btn--ghost btn--small" data-preset="corner">Corner</button>
    </div>
    <label>Window <output data-o="win"></output>
      <input type="range" data-i="win" min="2" max="15" step="1" value="7"></label>
    <label>Threshold τ <output data-o="tau"></output>
      <input type="range" data-i="tau" min="-3" max="1" step="0.05" value="-1"></label>
    <label class="check"><input type="checkbox" data-i="gauss"> Gaussian weights</label>
  </div>

  <div class="tensor-readout" aria-live="polite">
    <p class="class-badge" data-o="class"></p>
    <table class="matrix-table">
      <tbody>
        <tr><th scope="row">$H$</th><td data-o="H"></td></tr>
        <tr><th scope="row">$\\lambda_1,\\ \\lambda_2$</th><td data-o="eig"></td></tr>
        <tr><th scope="row">Shi–Tomasi $\\min\\lambda$</th><td data-o="st"></td></tr>
        <tr><th scope="row">Harris $R$ ($k = ${HARRIS_K}$)</th><td data-o="harris"></td></tr>
        <tr><th scope="row">Condition $\\lambda_1/\\lambda_2$</th><td data-o="cond"></td></tr>
      </tbody>
    </table>
    <p class="widget__meta" data-o="meta"></p>
  </div>
</div>`;

  renderTexIn(el);
  const $ = (sel) => el.querySelector(sel);
  const cFrame = $('[data-c="frame"]'), cPatch = $('[data-c="patch"]'), cScatter = $('[data-c="scatter"]');
  const ctxF = cFrame.getContext('2d'), ctxP = cPatch.getContext('2d'), ctxS = cScatter.getContext('2d');
  const inWin = $('[data-i="win"]'), inTau = $('[data-i="tau"]'), inGauss = $('[data-i="gauss"]');

  const W = STAGE.width, H = STAGE.height;
  let img = null, gray = null, grad = null;
  let px = W >> 1, py = H >> 1;

  const half = () => +inWin.value;
  const tau = () => 10 ** +inTau.value;

  function loadFrame() {
    img = api.stage.grabFrame();
    if (!img) { $('[data-o="meta"]').textContent = 'Waiting for a video frame…'; return; }
    gray = toGray(img);
    grad = gradients(gray, W, H);
    compute();
  }

  function compute() {
    if (!img) return;
    const h = half();
    px = Math.min(W - 1 - h, Math.max(h, px));
    py = Math.min(H - 1 - h, Math.max(h, py));
    const sigma = inGauss.checked ? h / 2 : 0;
    const T = structureTensor(grad.Ix, grad.Iy, W, H, px, py, h, sigma);
    const { l1, l2, v1 } = eig2(T.a, T.b, T.c);
    const cls = classify(l1, l2, tau());

    $('[data-o="win"]').textContent = `${2 * h + 1}×${2 * h + 1}`;
    $('[data-o="tau"]').textContent = fmt(tau());
    $('[data-o="H"]').innerHTML = `<span class="mat">[ ${fmt(T.a)}  ${fmt(T.b)} ; ${fmt(T.b)}  ${fmt(T.c)} ]</span>`;
    $('[data-o="eig"]').textContent = `${fmt(l1)},  ${fmt(l2)}`;
    $('[data-o="st"]').textContent = `${fmt(l2)} ${l2 >= tau() ? '≥' : '<'} τ`;
    $('[data-o="harris"]').textContent = fmt(harris(T.a, T.b, T.c, HARRIS_K));
    $('[data-o="cond"]').textContent = l2 > 1e-9 ? fmt(l1 / l2) : '∞';
    const badge = $('[data-o="class"]');
    badge.textContent = { flat: 'Flat: no reliable motion', edge: 'Edge: aperture problem', corner: 'Corner: trackable' }[cls];
    badge.dataset.cls = cls;
    $('[data-o="meta"]').textContent = `Frame ${api.stage.frame} · window centre (${px}, ${py}) · gray values in [0, 1], central-difference gradients`;
    cFrame.setAttribute('aria-label', `Current video frame; window at ${px}, ${py} is classified ${cls}.`);

    drawFrame(h, cls);
    drawPatch(h);
    drawScatter(T, l1, l2, v1);
  }

  function drawFrame(h, cls) {
    ctxF.putImageData(img, 0, 0);
    ctxF.lineWidth = 2;
    ctxF.strokeStyle = { flat: '#8a8a8a', edge: '#d08a1c', corner: '#1f8a5b' }[cls];
    ctxF.strokeRect(px - h - 0.5, py - h - 0.5, 2 * h + 2, 2 * h + 2);
  }

  function drawPatch(h) {
    const n = 2 * h + 1, s = cPatch.width / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = ((py - h + y) * W + (px - h + x)) * 4;
      ctxP.fillStyle = `rgb(${img.data[i]},${img.data[i + 1]},${img.data[i + 2]})`;
      ctxP.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
    }
  }

  function drawScatter(T, l1, l2, v1) {
    const S = cScatter.width, c = S / 2;
    const ink = getComputedStyle(el).getPropertyValue('--ink').trim() || '#222';
    const muted = getComputedStyle(el).getPropertyValue('--muted').trim() || '#999';
    ctxS.clearRect(0, 0, S, S);
    ctxS.strokeStyle = muted; ctxS.lineWidth = 1;
    ctxS.beginPath(); ctxS.moveTo(0, c); ctxS.lineTo(S, c); ctxS.moveTo(c, 0); ctxS.lineTo(c, S); ctxS.stroke();
    const maxG = Math.max(0.02, ...T.samples.map(([gx, gy]) => Math.max(Math.abs(gx), Math.abs(gy))));
    const k = (c - 8) / maxG;
    ctxS.fillStyle = ink;
    for (const [gx, gy] of T.samples) ctxS.fillRect(c + gx * k - 1, c + gy * k - 1, 2, 2);
    // Ellipse semi-axes = RMS gradient along each eigenvector = sqrt(lambda / sum w).
    const r1 = Math.sqrt(Math.max(0, l1) / T.wsum) * k, r2 = Math.sqrt(Math.max(0, l2) / T.wsum) * k;
    ctxS.strokeStyle = '#c2410c'; ctxS.lineWidth = 1.5;
    ctxS.beginPath(); ctxS.ellipse(c, c, Math.max(r1, 0.5), Math.max(r2, 0.5), Math.atan2(v1[1], v1[0]), 0, Math.PI * 2); ctxS.stroke();
    ctxS.fillStyle = muted; ctxS.font = '10px ui-monospace, monospace';
    ctxS.fillText(`±${maxG.toFixed(2)}`, 4, 12);
  }

  // --- interaction -----------------------------------------------------------
  cFrame.addEventListener('click', (e) => {
    const r = cFrame.getBoundingClientRect();
    px = Math.round(((e.clientX - r.left) / r.width) * W);
    py = Math.round(((e.clientY - r.top) / r.height) * H);
    compute();
  });
  cFrame.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    px += d[0]; py += d[1];
    compute();
  });
  el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    if (!gray) return;
    const ex = findExamples(gray, W, H, half(), tau())[b.dataset.preset];
    if (!ex) {
      $('[data-o="meta"]').textContent = `No “${b.dataset.preset}” window at this threshold in this frame. Try moving τ.`;
      return;
    }
    px = ex.x; py = ex.y;
    compute();
  }));
  [inWin, inTau, inGauss].forEach((i) => i.addEventListener('input', compute));

  loadFrame();
  const off = api.stage.onFrame(loadFrame);
  return () => off();
}

function renderTexIn(root) {
  if (!window.katex) return;
  root.querySelectorAll('figcaption, th').forEach((n) => {
    n.innerHTML = n.innerHTML.replace(/\$([^$]+)\$/g, (_, m) =>
      window.katex.renderToString(m, { throwOnError: false }));
  });
}
