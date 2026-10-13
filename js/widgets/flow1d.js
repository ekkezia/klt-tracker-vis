// Playground (Ch 1): optical flow in one dimension.
// A smooth bump moves by d pixels. Compare each pixel's own answer
// u = -I_t / I_x with the window least-squares answer, and with iterating
// (warp frame 2 back by the current estimate, solve again).

import { shell, slider, check, controls, crisp, palette } from './pg.js';

const N = 48;               // pixels in the 1D image
const C = 20;               // bump centre in frame 1

export function mountFlow1d(el) {
  const root = shell(el, {
    id: 'flow1d',
    title: 'Optical flow in one dimension',
    intro: 'A bright bump moves right by $d$ pixels between two frames. Each pixel on its own guesses $u = -I_t / I_x$; the window solves for the one $u$ that fits all its pixels; iterating re-solves after shifting frame 2 back by the current guess. Make $d$ larger than the bump to see one step break and iteration recover.',
    body: `
  <canvas class="pg__plot" data-c="sig" aria-label="Frame 1 and frame 2 signals"></canvas>
  <canvas class="pg__plot" data-c="u" aria-label="Estimates of u"></canvas>
  <div class="pg__controls">
    ${slider({ key: 'd', label: 'true shift $d$', min: 0, max: 8, step: 0.25, value: 1 })}
    ${slider({ key: 's', label: 'bump width $\\sigma$', min: 1, max: 6, step: 0.5, value: 2.5 })}
    ${slider({ key: 'w', label: 'window half-width', min: 1, max: 15, step: 1, value: 8 })}
    ${slider({ key: 'noise', label: 'noise', min: 0, max: 0.1, step: 0.005, value: 0 })}
    ${check({ key: 'iter', label: 'iterate (Gauss–Newton)', checked: true })}
  </div>
  <table class="pg__readout"><tbody>
    <tr><th>true shift</th><td data-r="true"></td></tr>
    <tr><th>window, one step</th><td data-r="one"></td></tr>
    <tr><th>window, iterated</th><td data-r="it"></td></tr>
    <tr><th>single pixels</th><td data-r="px"></td></tr>
  </tbody></table>`,
  });
  const col = palette(el);
  const cSig = root.querySelector('[data-c="sig"]'), cU = root.querySelector('[data-c="u"]');
  const W = 560, H1 = 150, H2 = 150;
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

  const get = controls(root, {
    d: (v) => `${v.toFixed(2)} px`, s: (v) => `${v} px`, w: (v) => `${2 * v + 1} px`, noise: (v) => v.toFixed(3),
  }, draw);

  function draw() {
    const d = get('d'), s = get('s'), w = get('w'), noise = get('noise');
    const bump = (x) => Math.exp(-((x - C) ** 2) / (2 * s * s));
    seed = 7;
    const n1 = Array.from({ length: N }, () => rand() * 2 * noise), n2 = Array.from({ length: N }, () => rand() * 2 * noise);
    const f1 = (i) => bump(i) + n1[i];
    // frame 2 sampled at a real-valued position (for warping), noise per pixel
    const f2 = (x) => bump(x - d) + n2[Math.max(0, Math.min(N - 1, Math.round(x)))];
    const Ix = (i) => (f1(Math.min(N - 1, i + 1)) - f1(Math.max(0, i - 1))) / 2;
    const lo = Math.max(1, C - w), hi = Math.min(N - 2, C + w);

    // One least-squares step from guess u0 (frame 2 sampled at x + u0).
    const step = (u0) => {
      let a = 0, b = 0;
      for (let i = lo; i <= hi; i++) { const gx = Ix(i), it = f2(i + u0) - f1(i); a += gx * gx; b += gx * it; }
      return a > 1e-9 ? u0 - b / a : u0;
    };
    const one = step(0);
    let u = 0;
    const path = [0];
    for (let k = 0; k < 20; k++) { const nu = step(u); path.push(nu); if (Math.abs(nu - u) < 1e-4) { u = nu; break; } u = nu; }
    const per = [];
    for (let i = 1; i < N - 1; i++) {
      const gx = Ix(i);
      per.push(Math.abs(gx) > 0.02 ? -(f2(i) - f1(i)) / gx : null);
    }

    // --- signals
    const ctx = crisp(cSig, W, H1);
    const X = (i) => 30 + (i / (N - 1)) * (W - 40), Y = (v) => H1 - 18 - v * (H1 - 40);
    ctx.clearRect(0, 0, W, H1);
    ctx.fillStyle = 'rgba(14,116,144,0.08)';
    ctx.fillRect(X(lo) - 3, 8, X(hi) - X(lo) + 6, H1 - 22);
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillStyle = col.blue; ctx.fillText('window', X(lo), 20);
    const curve = (fn, color, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < N; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i), Y(fn(i)));
      ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < N; i++) { ctx.fillStyle = color; ctx.fillRect(X(i) - 1.5, Y(fn(i)) - 1.5, 3, 3); }
    };
    curve(f1, col.ink, []);
    curve((i) => f2(i), col.orange, [5, 4]);
    if (get('iter')) curve((i) => f2(i + u), col.green, [2, 3]);
    ctx.fillStyle = col.ink; ctx.fillText('frame 1', W - 150, 20);
    ctx.fillStyle = col.orange; ctx.fillText('frame 2', W - 95, 20);
    if (get('iter')) { ctx.fillStyle = col.green; ctx.fillText('frame 2 shifted back by u', W - 150, 34); }

    // --- estimates
    const c2 = crisp(cU, W, H2);
    const umin = -2, umax = 10;
    const UY = (v) => H2 - 20 - ((Math.max(umin, Math.min(umax, v)) - umin) / (umax - umin)) * (H2 - 34);
    c2.clearRect(0, 0, W, H2);
    c2.strokeStyle = col.rule; c2.lineWidth = 1; c2.font = '10px ui-monospace, monospace'; c2.fillStyle = col.muted;
    for (let v = 0; v <= umax; v += 2) { c2.beginPath(); c2.moveTo(30, UY(v)); c2.lineTo(W - 10, UY(v)); c2.stroke(); c2.fillText(String(v), 6, UY(v) + 3); }
    c2.fillText('u (px)', 30, 12);
    const hline = (v, color, label, dash = []) => {
      c2.strokeStyle = color; c2.lineWidth = 2; c2.setLineDash(dash);
      c2.beginPath(); c2.moveTo(30, UY(v)); c2.lineTo(W - 10, UY(v)); c2.stroke(); c2.setLineDash([]);
      c2.fillStyle = color; c2.font = '11px ui-sans-serif, system-ui'; c2.fillText(label, W - 150, UY(v) - 4);
    };
    per.forEach((v, k) => {
      if (v == null) return;
      const i = k + 1, inside = i >= lo && i <= hi;
      c2.fillStyle = inside ? col.ink : col.muted;
      c2.globalAlpha = inside ? 1 : 0.35;
      c2.beginPath(); c2.arc(X(i), UY(v), 2.5, 0, Math.PI * 2); c2.fill();
    });
    c2.globalAlpha = 1;
    hline(d, col.green, 'true shift');
    hline(one, col.blue, 'window, one step', [6, 4]);
    if (get('iter')) hline(u, col.orange, 'window, iterated', [2, 3]);

    const err = (v) => `${v.toFixed(2)} px  (error ${(v - d >= 0 ? '+' : '') + (v - d).toFixed(2)})`;
    const inW = per.filter((v, k) => v != null && k + 1 >= lo && k + 1 <= hi);
    root.querySelector('[data-r="true"]').textContent = `${d.toFixed(2)} px`;
    root.querySelector('[data-r="one"]').textContent = err(one);
    root.querySelector('[data-r="it"]').textContent = get('iter') ? `${err(u)} · ${path.length - 1} steps` : '—';
    root.querySelector('[data-r="px"]').textContent = inW.length
      ? `range ${Math.min(...inW).toFixed(1)} … ${Math.max(...inW).toFixed(1)} px (dots)` : '—';
  }

  draw();
}
