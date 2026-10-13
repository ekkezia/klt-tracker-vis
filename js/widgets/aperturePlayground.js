// Playground (Ch 1): the aperture problem.
// Left: a long bar seen through a circular window, moving with velocity v.
// Right: velocity space (u, v). Drag the blue dot to set the bar's true motion.
// Every velocity on the dashed line produces the same picture in the window;
// the orange arrow (normal flow) is the only part that can be measured. A
// window large enough to show the bar's end removes the ambiguity.

import { shell, slider, check, controls, crisp } from './pg.js';

const LW = 520, LH = 360;          // left canvas (CSS px)
const VW = 360, VH = 360;          // velocity-space canvas
const SCALE = 40;                  // velocity space: px per unit
const RANGE = 4;                   // ±4 px/frame shown
const BAR_HALF = 190, BAR_W = 22;  // bar half-length and width (px)
const PERIOD = 3;                  // seconds before the motion loops
const SPEED = 30;                  // drawing: px per second per unit of velocity

export function mountAperturePlayground(el) {
  const root = shell(el, {
    id: 'aperture',
    title: 'The aperture problem',
    intro: 'Left: what a small window sees of a long moving bar. Right: the bar\'s true motion as a point you can **drag** in velocity space. Every point on the dashed line gives the *same* picture in the window, so only the motion across the bar (orange) can be measured. Make the window large enough to show an end of the bar and the ambiguity disappears: that is why trackers look for **corners or texture**.',
    body: `
  <div class="pg__row pg__row--dark">
    <figure class="pg__fig pg__fig--wide"><canvas data-c="win" aria-label="A bar moving behind a circular window"></canvas>
      <figcaption data-r="q">Which way is the bar really moving?</figcaption></figure>
    <figure class="pg__fig"><canvas data-c="vel" aria-label="Velocity space; drag the blue dot to set the true motion" tabindex="0"></canvas>
      <figcaption><span class="key" data-key="focus">drag the blue dot</span> · <span class="key" data-key="warn">every point on the dashed line looks identical</span></figcaption></figure>
  </div>
  <div class="pg__controls">
    ${slider({ key: 'r', label: 'window size', min: 30, max: 240, step: 5, value: 90 })}
    ${slider({ key: 'ang', label: 'bar angle', min: 0, max: 175, step: 5, value: 50 })}
    ${check({ key: 'reveal', label: 'reveal true motion' })}
  </div>
  <p class="pg__verdict" data-r="verdict" aria-live="polite"></p>`,
  });
  const $ = (s) => root.querySelector(s);
  const cW = $('[data-c="win"]'), cV = $('[data-c="vel"]');
  const ctxW = crisp(cW, LW, LH), ctxV = crisp(cV, VW, VH);
  let vel = [2.2, 0.6];            // true motion (px/frame, image axes: u right, v down)
  let raf = 0, t0 = performance.now(), lastVerdict = '';

  const get = controls(root, { r: (v) => `${v} px`, ang: (v) => `${v}°` }, () => {});

  // Bar direction e (along the bar) and normal n (across it).
  const axes = () => {
    const a = (get('ang') * Math.PI) / 180;
    return { e: [Math.cos(a), Math.sin(a)], n: [-Math.sin(a), Math.cos(a)] };
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

  function frame(now) {
    if (!cW.offsetParent) { raf = requestAnimationFrame(frame); return; } // notebook closed: skip drawing
    const t = (((now - t0) / 1000) % PERIOD) - PERIOD / 2;
    const { e, n } = axes();
    const R = get('r'), cx = LW / 2, cy = LH / 2;
    const off = [vel[0] * SPEED * t, vel[1] * SPEED * t];     // bar centre offset
    const c = [cx + off[0], cy + off[1]];

    // --- the window view
    ctxW.fillStyle = '#07090c'; ctxW.fillRect(0, 0, LW, LH);
    const drawBar = (alpha) => {
      ctxW.save();
      ctxW.globalAlpha = alpha;
      ctxW.translate(c[0], c[1]);
      ctxW.rotate(Math.atan2(e[1], e[0]));
      ctxW.fillStyle = '#e9edf5';
      ctxW.fillRect(-BAR_HALF, -BAR_W / 2, 2 * BAR_HALF, BAR_W);
      if (get('reveal')) { // marks on the bar move with it, exposing the motion along it
        ctxW.fillStyle = '#ffb020';
        for (let s = -BAR_HALF + 20; s < BAR_HALF; s += 40) { ctxW.beginPath(); ctxW.arc(s, 0, 4, 0, Math.PI * 2); ctxW.fill(); }
      }
      ctxW.restore();
    };
    drawBar(0.08);                                    // the world outside the window (faint)
    ctxW.save();
    ctxW.beginPath(); ctxW.arc(cx, cy, R, 0, Math.PI * 2); ctxW.clip();
    ctxW.fillStyle = '#0c1118'; ctxW.fillRect(0, 0, LW, LH);
    drawBar(1);
    ctxW.restore();
    ctxW.strokeStyle = '#38bdf8'; ctxW.lineWidth = 2.5;
    ctxW.beginPath(); ctxW.arc(cx, cy, R, 0, Math.PI * 2); ctxW.stroke();
    if (get('reveal')) {
      ctxW.strokeStyle = '#ffb020'; ctxW.lineWidth = 2.5;
      arrowTo(ctxW, cx, cy, cx + vel[0] * 25, cy + vel[1] * 25);
    }

    // Can an end of the bar be seen? (either end inside the window)
    const ends = [[c[0] + e[0] * BAR_HALF, c[1] + e[1] * BAR_HALF], [c[0] - e[0] * BAR_HALF, c[1] - e[1] * BAR_HALF]];
    const endVisible = ends.some(([x, y]) => Math.hypot(x - cx, y - cy) < R - 4);

    // --- velocity space
    const O = [VW / 2, VH / 2], P = ([u, v]) => [O[0] + u * SCALE, O[1] + v * SCALE];
    ctxV.fillStyle = '#0c1118'; ctxV.fillRect(0, 0, VW, VH);
    ctxV.strokeStyle = 'rgba(255,255,255,.08)'; ctxV.lineWidth = 1;
    for (let k = -RANGE; k <= RANGE; k++) {
      ctxV.beginPath(); ctxV.moveTo(...P([k, -RANGE - 1])); ctxV.lineTo(...P([k, RANGE + 1]));
      ctxV.moveTo(...P([-RANGE - 1, k])); ctxV.lineTo(...P([RANGE + 1, k])); ctxV.stroke();
    }
    ctxV.strokeStyle = 'rgba(255,255,255,.3)';
    ctxV.beginPath(); ctxV.moveTo(0, O[1]); ctxV.lineTo(VW, O[1]); ctxV.moveTo(O[0], 0); ctxV.lineTo(O[0], VH); ctxV.stroke();
    ctxV.fillStyle = 'rgba(255,255,255,.55)'; ctxV.font = '12px ui-sans-serif, system-ui';
    ctxV.fillText('u →', VW - 30, O[1] - 6); ctxV.fillText('v ↓', O[0] + 6, 14);
    const vn = dot(vel, n), normal = [n[0] * vn, n[1] * vn];
    if (!endVisible) { // the constraint line: every v with n·v = n·v_true
      ctxV.strokeStyle = '#f5a524'; ctxV.lineWidth = 2; ctxV.setLineDash([7, 6]);
      const L = 2 * RANGE + 2;
      ctxV.beginPath(); ctxV.moveTo(...P([normal[0] - e[0] * L, normal[1] - e[1] * L])); ctxV.lineTo(...P([normal[0] + e[0] * L, normal[1] + e[1] * L])); ctxV.stroke();
      ctxV.setLineDash([]);
    }
    ctxV.strokeStyle = '#f5a524'; ctxV.lineWidth = 3;
    arrowTo(ctxV, ...O, ...P(normal));
    const [bx, by] = P(vel);
    ctxV.fillStyle = '#5ab8f5'; ctxV.strokeStyle = '#fff'; ctxV.lineWidth = 2;
    ctxV.beginPath(); ctxV.arc(bx, by, 9, 0, Math.PI * 2); ctxV.fill(); ctxV.stroke();

    const verdict = endVisible
      ? 'An end of the bar is inside the window: it moves along the bar too, so only one motion fits. The ambiguity is gone.'
      : `Through this window only the motion across the bar is measurable: ${Math.abs(vn).toFixed(2)} px/frame. The motion along the bar, ${Math.abs(dot(vel, e)).toFixed(2)} px/frame, is invisible.`;
    if (verdict !== lastVerdict) { $('[data-r="verdict"]').textContent = verdict; lastVerdict = verdict; }
    raf = requestAnimationFrame(frame);
  }

  // --- dragging the true motion
  const setFromEvent = (ev) => {
    const r = cV.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * VW, y = ((ev.clientY - r.top) / r.height) * VH;
    const clamp = (v) => Math.max(-RANGE, Math.min(RANGE, v));
    vel = [clamp((x - VW / 2) / SCALE), clamp((y - VH / 2) / SCALE)];
  };
  let dragging = false;
  cV.addEventListener('pointerdown', (ev) => { dragging = true; cV.setPointerCapture(ev.pointerId); setFromEvent(ev); });
  cV.addEventListener('pointermove', (ev) => { if (dragging) setFromEvent(ev); });
  cV.addEventListener('pointerup', () => { dragging = false; });
  cV.addEventListener('keydown', (ev) => {
    const d = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    vel = [Math.max(-RANGE, Math.min(RANGE, vel[0] + d[0])), Math.max(-RANGE, Math.min(RANGE, vel[1] + d[1]))];
  });
  cV.style.touchAction = 'none';
  cV.style.cursor = 'grab';

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

function arrowTo(ctx, x0, y0, x1, y1) {
  const a = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  if (len < 4) return;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x1 - 10 * Math.cos(a - 0.4), y1 - 10 * Math.sin(a - 0.4));
  ctx.moveTo(x1, y1); ctx.lineTo(x1 - 10 * Math.cos(a + 0.4), y1 - 10 * Math.sin(a + 0.4));
  ctx.stroke();
}
