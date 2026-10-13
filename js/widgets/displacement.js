// Playground (Ch 0): how far does a point move between two frames?
//   |d| ≈ f · v⊥ / (Z · fps)   (pinhole camera, motion perpendicular to the ray)
// with Wren's camera (f ≈ 579 px for a 960 px wide image, 79° horizontal field of view).

import { shell, slider, controls, crisp, palette } from './pg.js';

const F_PX = 579;

export function mountDisplacement(el) {
  const root = shell(el, {
    id: 'disp',
    title: 'How far does a point move between frames?',
    intro: 'For a camera with focal length $f$ (in pixels), a point at distance $Z$ moving sideways at speed $v_\\perp$ shifts by about $\\|\\mathbf{d}\\| \\approx f\\,v_\\perp / (Z \\cdot \\text{fps})$ pixels per frame. Lucas–Kanade needs this to be small (a few pixels); beyond that it needs a pyramid (Chapter 3).',
    body: `
  <div class="pg__controls">
    ${slider({ key: 'v', label: 'sideways speed $v_\\perp$', min: 0.1, max: 6, step: 0.1, value: 1.3 })}
    ${slider({ key: 'z', label: 'distance $Z$', min: 0.5, max: 40, step: 0.5, value: 3 })}
    ${slider({ key: 'fps', label: 'frame rate', min: 5, max: 120, step: 1, value: 24 })}
  </div>
  <canvas class="pg__plot" data-c="bar" aria-label="Displacement per frame"></canvas>
  <p class="pg__verdict" data-r="verdict" aria-live="polite"></p>`,
  });
  const col = palette(el);
  const canvas = root.querySelector('[data-c="bar"]');
  const get = controls(root, {
    v: (x) => `${x.toFixed(1)} m/s (${(x * 3.6).toFixed(0)} km/h)`, z: (x) => `${x.toFixed(1)} m`, fps: (x) => `${x} fps`,
  }, draw);

  function draw() {
    const d = (F_PX * get('v')) / (get('z') * get('fps'));
    const W = 560, H = 90, max = 30;
    const ctx = crisp(canvas, W, H);
    const X = (px) => 20 + (Math.min(px, max) / max) * (W - 40);
    ctx.clearRect(0, 0, W, H);
    const zones = [[0, 2, 'rgba(21,128,61,.18)', 'one level'], [2, 16, 'rgba(180,83,9,.16)', 'needs a pyramid (4 levels: up to ~16 px)'], [16, max, 'rgba(185,28,28,.12)', 'too fast']];
    ctx.font = '11px ui-sans-serif, system-ui';
    for (const [a, b, c, label] of zones) {
      ctx.fillStyle = c; ctx.fillRect(X(a), 30, X(b) - X(a), 30);
      ctx.fillStyle = col.muted; ctx.fillText(label, X(a) + 4, 24);
    }
    ctx.fillStyle = col.muted; ctx.font = '10px ui-monospace, monospace';
    for (let t = 0; t <= max; t += 5) ctx.fillText(`${t}`, X(t) - 3, 76);
    ctx.fillText('px / frame', W - 70, 88);
    ctx.fillStyle = col.ink;
    ctx.beginPath(); ctx.moveTo(X(d), 28); ctx.lineTo(X(d) - 6, 18); ctx.lineTo(X(d) + 6, 18); ctx.fill();
    ctx.fillRect(X(d) - 1.5, 28, 3, 34);

    const v = root.querySelector('[data-r="verdict"]');
    v.innerHTML = `<strong>${d.toFixed(2)} px per frame.</strong> ${d <= 2
      ? 'Small enough for Lucas–Kanade in one level.'
      : d <= 16 ? `Too far for one linear step, but a pyramid handles it: at level 3 (÷8) it is only ${(d / 8).toFixed(1)} px.`
        : `Too fast${d > max ? ' (off the scale)' : ''}: even at level 3 (÷8) it is ${(d / 8).toFixed(1)} px. Raise the frame rate or predict the motion (e.g. from a gyro).`}`;
  }

  draw();
}
