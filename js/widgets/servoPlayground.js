// Playground (Ch 6): image-based visual servoing on four tracked corners.
// A camera looks straight at a square target (4 DOF: sideways x, y, distance
// Z, rotation about the optical axis). Each step it measures the corners'
// image positions s, compares them with the goal s*, and moves with
//     v = −λ L⁺ (s − s*)
// where L is the interaction matrix of the points (Chaumette & Hutchinson 2006).

import { shell, slider, check, controls, crisp, palette } from './pg.js';

const HALF = 0.2;          // target half-size (m)
const Z_GOAL = 1.0;        // docked distance (m)
const FOC = 260;           // focal length of the drawn image (px)
const DT = 1 / 30;

export function mountServoPlayground(el) {
  const root = shell(el, {
    id: 'servo',
    title: 'Dock by visual servoing',
    intro: 'Set where the camera starts, then press **Run**. Each step it measures the four corners (filled), compares them with where they should be when docked (hollow), and moves to shrink the difference: $\\mathbf{v} = -\\lambda\\, L^{+}(\\mathbf{s} - \\mathbf{s}^*)$. Try a large rotation, a high gain, or an unknown depth.',
    body: `
  <div class="pg__row">
    <figure class="pg__fig"><canvas data-c="img" aria-label="Camera image with current and goal corner positions"></canvas>
      <figcaption>camera image: <span class="key" data-key="tracked">corners now</span> · <span class="key" data-key="muted">goal</span></figcaption></figure>
    <figure class="pg__fig"><canvas data-c="err" aria-label="Error over time"></canvas>
      <figcaption>error $\\|\\mathbf{s} - \\mathbf{s}^*\\|$ (px, log scale) over time</figcaption></figure>
  </div>
  <div class="pg__controls">
    ${slider({ key: 'x', label: 'start offset sideways', min: -0.6, max: 0.6, step: 0.05, value: 0.35 })}
    ${slider({ key: 'z', label: 'start distance', min: 0.6, max: 3, step: 0.1, value: 1.8 })}
    ${slider({ key: 'th', label: 'start rotation', min: -150, max: 150, step: 5, value: 40 })}
    ${slider({ key: 'gain', label: 'gain $\\lambda$', min: 0.1, max: 3, step: 0.1, value: 1 })}
    ${check({ key: 'trueZ', label: 'robot knows the true depth', checked: true })}
    <div class="pg__buttons"><button type="button" class="btn btn--small" data-b="run">Run</button>
      <button type="button" class="btn btn--ghost btn--small" data-b="reset">Reset</button></div>
  </div>
  <p class="pg__verdict" data-r="state" aria-live="polite"></p>`,
  });
  const col = palette(el);
  const $ = (s) => root.querySelector(s);
  const IW = 300, IH = 220, EW = 260, EH = 220;
  const world = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
  let cam, hist, trails, raf = 0, running = false, t = 0;

  const get = controls(root, {
    x: (v) => `${v.toFixed(2)} m`, z: (v) => `${v.toFixed(1)} m`, th: (v) => `${v}°`, gain: (v) => v.toFixed(1),
  }, () => { if (!running) reset(); });

  // Normalised image coordinates of the corners for camera pose {cx, cy, Z, th}.
  const project = (c) => world.map(([X, Y]) => {
    const dx = X - c.cx, dy = Y - c.cy, ct = Math.cos(c.th), st = Math.sin(c.th);
    return [(ct * dx + st * dy) / c.Z, (-st * dx + ct * dy) / c.Z];
  });
  const goal = project({ cx: 0, cy: 0, Z: Z_GOAL, th: 0 });

  function reset() {
    stop();
    cam = { cx: get('x'), cy: get('x') * 0.4, Z: get('z'), th: (get('th') * Math.PI) / 180 };
    hist = []; trails = [[], [], [], []]; t = 0;
    record();
    draw();
  }

  function record() {
    const s = project(cam);
    s.forEach(([x, y], i) => trails[i].push([x, y]));
    const e = Math.hypot(...s.flatMap(([x, y], i) => [x - goal[i][0], y - goal[i][1]])) * FOC;
    hist.push(e);
    return { s, e };
  }

  // One control step: stack the 2×4 interaction matrices, v = −λ (LᵀL)⁻¹ Lᵀ e.
  function step() {
    const s = project(cam), Zuse = get('trueZ') ? cam.Z : Z_GOAL;
    const A = Array.from({ length: 4 }, () => new Array(4).fill(0)), b = new Array(4).fill(0);
    s.forEach(([x, y], i) => {
      const rows = [[-1 / Zuse, 0, x / Zuse, y], [0, -1 / Zuse, y / Zuse, -x]];
      const err = [x - goal[i][0], y - goal[i][1]];
      rows.forEach((r, k) => {
        for (let p = 0; p < 4; p++) { b[p] += r[p] * err[k]; for (let q = 0; q < 4; q++) A[p][q] += r[p] * r[q]; }
      });
    });
    const sol = solve4(A, b);
    if (!sol) return false;
    const lam = get('gain');
    const [vx, vy, vz, wz] = sol.map((v) => -lam * v);
    const ct = Math.cos(cam.th), st = Math.sin(cam.th);
    cam.cx += (ct * vx - st * vy) * DT;
    cam.cy += (st * vx + ct * vy) * DT;
    cam.Z = Math.max(0.15, cam.Z - vz * DT);
    cam.th += wz * DT;
    t += DT;
    return true;
  }

  function tick() {
    if (!running) return;
    for (let k = 0; k < 2; k++) if (!step()) { stop('Singular configuration: the corners give no usable direction.'); return; }
    const { e } = record();
    draw();
    if (e < 0.5) stop(`Docked in ${t.toFixed(1)} s (error ${e.toFixed(2)} px).`);
    else if (t > 30 || !Number.isFinite(e) || e > 5000) stop(e > 5000 ? 'Diverged: the corners left the view. Lower the gain.' : `Stopped after 30 s, error ${e.toFixed(1)} px.`);
    else raf = requestAnimationFrame(tick);
  }

  function stop(msg) {
    running = false;
    cancelAnimationFrame(raf);
    $('[data-b="run"]').textContent = 'Run';
    if (msg) $('[data-r="state"]').textContent = msg;
  }

  function draw() {
    const ctx = crisp($('[data-c="img"]'), IW, IH);
    const P = ([x, y]) => [IW / 2 + x * FOC, IH / 2 + y * FOC];
    ctx.fillStyle = '#10161c'; ctx.fillRect(0, 0, IW, IH);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.moveTo(IW / 2, 0); ctx.lineTo(IW / 2, IH); ctx.moveTo(0, IH / 2); ctx.lineTo(IW, IH / 2); ctx.stroke();
    // goal
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
    goal.forEach((g) => { const [x, y] = P(g); ctx.strokeRect(x - 6, y - 6, 12, 12); });
    // trails + current
    trails.forEach((tr) => {
      ctx.strokeStyle = 'rgba(255,176,32,.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); tr.forEach((p, i) => { const [x, y] = P(p); (i ? ctx.lineTo : ctx.moveTo).call(ctx, x, y); }); ctx.stroke();
    });
    const s = project(cam);
    ctx.strokeStyle = 'rgba(255,176,32,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); s.forEach((p, i) => { const [x, y] = P(p); (i ? ctx.lineTo : ctx.moveTo).call(ctx, x, y); }); ctx.closePath(); ctx.stroke();
    s.forEach((p) => { const [x, y] = P(p); ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`Z ${cam.Z.toFixed(2)} m · θ ${((cam.th * 180) / Math.PI).toFixed(0)}°`, 6, IH - 8);

    const c = crisp($('[data-c="err"]'), EW, EH);
    c.clearRect(0, 0, EW, EH);
    const lo = Math.log10(0.3), hi = Math.log10(Math.max(10, ...hist) * 1.2);
    const Y = (e) => EH - 20 - ((Math.log10(Math.max(e, 0.3)) - lo) / (hi - lo)) * (EH - 34);
    const X = (i) => 30 + (i / Math.max(60, hist.length - 1)) * (EW - 40);
    c.strokeStyle = col.rule; c.fillStyle = col.muted; c.font = '10px ui-monospace, monospace';
    for (let d = 0; d <= Math.ceil(hi); d++) { const v = 10 ** d; c.beginPath(); c.moveTo(30, Y(v)); c.lineTo(EW - 10, Y(v)); c.stroke(); c.fillText(String(v), 2, Y(v) + 3); }
    c.strokeStyle = col.blue; c.lineWidth = 2;
    c.beginPath(); hist.forEach((e, i) => (i ? c.lineTo : c.moveTo).call(c, X(i), Y(e))); c.stroke();
    if (!running && !$('[data-r="state"]').textContent) $('[data-r="state"]').textContent = 'Press Run.';
  }

  $('[data-b="run"]').addEventListener('click', () => {
    if (running) { stop('Paused.'); return; }
    if (hist.at(-1) < 0.5) reset();
    running = true;
    $('[data-b="run"]').textContent = 'Pause';
    $('[data-r="state"]').textContent = 'Servoing…';
    raf = requestAnimationFrame(tick);
  });
  $('[data-b="reset"]').addEventListener('click', () => { $('[data-r="state"]').textContent = ''; reset(); });

  reset();
  return () => stop();
}

/** Solve a 4×4 linear system (Gaussian elimination with partial pivoting). */
function solve4(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[4] / r[i]);
}
