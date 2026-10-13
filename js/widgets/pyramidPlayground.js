// Playground (Ch 3): when does one level of Lucas–Kanade stop working, and
// how many pyramid levels does it take to recover? Real frames, real tracks.
// The frame gap makes the motion larger (gap g = g frames of motion at once).

import { shell, slider, controls, crisp, palette, drawGray } from './pg.js';
import { toGray, buildPyramid, lkPyramid, samplePatch } from '../lib/imageOps.js';

const MAXGAP = 8;

export function mountPyramidPlayground(el, api) {
  const root = shell(el, {
    id: 'pyr',
    title: 'Pyramids: how far can Lucas–Kanade reach?',
    intro: 'A fast-moving corner, tracked across a growing **frame gap** (more gap = larger motion). With one level, Lucas–Kanade fails once the shift exceeds a few pixels; each extra pyramid level halves the shift it has to find. Click a dot to try another corner. **Try the fence on the right:** its bars repeat, so even the pyramid locks onto the wrong bar.',
    body: `
  <div class="pg__row">
    <figure class="pg__fig pg__fig--wide"><canvas data-c="frame" aria-label="Frame; click a dot to choose a corner"></canvas>
      <figcaption>Click a dot to choose a corner</figcaption></figure>
    <figure class="pg__fig"><canvas data-c="chart" aria-label="Error vs frame gap"></canvas>
      <figcaption>error vs. frame gap: one level (orange) and your pyramid (blue)</figcaption></figure>
  </div>
  <div class="pg__row pg__row--patches" data-r="levels"></div>
  <div class="pg__controls">
    ${slider({ key: 'gap', label: 'frame gap', min: 1, max: MAXGAP, step: 1, value: 3 })}
    ${slider({ key: 'levels', label: 'pyramid levels', min: 1, max: 4, step: 1, value: 4 })}
    ${slider({ key: 'half', label: 'window', min: 3, max: 12, step: 1, value: 7 })}
  </div>
  <table class="pg__readout"><tbody>
    <tr><th>true shift (OpenCV)</th><td data-r="true"></td></tr>
    <tr><th>one level</th><td data-r="one"></td></tr>
    <tr><th>pyramid</th><td data-r="pyr"></td></tr>
  </tbody></table>
  <p class="widget__meta" data-r="meta">Loading frames…</p>`,
  });
  const col = palette(el);
  const $ = (s) => root.querySelector(s);
  const FW = 480, FH = 270, CW = 240, CH = 170;
  let F = 0, grays = null, img = null, w = 0, h = 0, track = null;
  const pyrCache = new Map();

  const get = controls(root, { gap: (v) => `${v}`, levels: (v) => (v === 1 ? '1 (no pyramid)' : String(v)), half: (v) => `${2 * v + 1}×${2 * v + 1}` }, compute);

  async function load() {
    // The chapter's key frame (fast motion), so results don't depend on where the story is.
    F = Math.max(MAXGAP, api.chapter.dialogue.find((l) => l.hold != null)?.hold ?? api.stage.frame);
    $('[data-r="meta"]').textContent = 'Loading frames…';
    const want = Array.from({ length: MAXGAP + 1 }, (_, k) => F - MAXGAP + k);
    const imgs = await api.stage.grabFramesAt(want);
    if (imgs.some((x) => !x)) { $('[data-r="meta"]').textContent = 'Video frames not available yet.'; return; }
    w = imgs[0].width; h = imgs[0].height; img = imgs[MAXGAP];
    grays = new Map(want.map((f, k) => [f, toGray(imgs[k])]));
    pyrCache.clear();
    track = null;
    compute();
  }
  const pyr = (f) => { if (!pyrCache.has(f)) pyrCache.set(f, buildPyramid(grays.get(f), w, h, 4)); return pyrCache.get(f); };

  // Default corner: the fastest-moving one (alive across the whole gap range)
  // that a 4-level pyramid tracks correctly at gap 3, so the demo starts on a
  // clean case; repetitive texture (the fence) is left for the reader to try.
  function fastest() {
    const tr = api.stage.tracks;
    const ok = tr.frames[F].filter((p) => p.status === 'tracked' && tr.byId.get(p.id).get(F - MAXGAP)
      && p.x > 40 && p.x < w - 40 && p.y > 40 && p.y < h - 40);
    const sp = (p) => { const q = tr.byId.get(p.id).get(F - 3); return Math.hypot(p.x - q.x, p.y - q.y); };
    ok.sort((a, b) => sp(b) - sp(a));
    const clean = ok.find((p) => { track = p; return solve(3, 4, 7).err < 1; });
    track = null;
    return clean ?? ok[0] ?? null;
  }

  function solve(gap, levels, half) {
    const tr = api.stage.tracks, old = tr.byId.get(track.id).get(F - gap), cur = tr.byId.get(track.id).get(F);
    const x0 = Math.round(old.x), y0 = Math.round(old.y);
    const truth = [cur.x - x0, cur.y - y0];
    const r = lkPyramid(pyr(F - gap), pyr(F), x0, y0, half, levels);
    return { truth, r, err: Math.hypot(r.p[0] - truth[0], r.p[1] - truth[1]), x0, y0 };
  }

  function compute() {
    if (!grays) return;
    track = track ?? fastest();
    if (!track) { $('[data-r="meta"]').textContent = 'No corner survives the whole gap range here.'; return; }
    const gap = get('gap'), levels = get('levels'), half = get('half');
    const one = solve(gap, 1, half), many = solve(gap, levels, half);
    const fmtP = (p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`;
    const verdict = (s) => `${fmtP(s.r.p)} px · ${s.err < 1 ? '✓ correct' : `✗ off by ${s.err.toFixed(1)} px`}`;
    $('[data-r="true"]').textContent = `${fmtP(one.truth)} px · ${Math.hypot(...one.truth).toFixed(1)} px long`;
    $('[data-r="one"]').textContent = verdict(one);
    $('[data-r="pyr"]').textContent = levels === 1 ? '(set levels > 1)' : verdict(many);
    $('[data-r="meta"]').textContent = `Frames ${F - gap} → ${F} · track #${track.id}`;
    drawFrame(gap);
    drawChart(levels, half, gap);
    drawLevels(many, levels, half, gap);
  }

  function drawFrame(gap) {
    const ctx = crisp($('[data-c="frame"]'), FW, FH), s = FW / w, tr = api.stage.tracks;
    const tmp = Object.assign(document.createElement('canvas'), { width: w, height: h });
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0, FW, FH);
    for (const p of tr.frames[F]) {
      if (p.status === 'lost') continue;
      ctx.fillStyle = 'rgba(255,176,32,.9)';
      ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    const old = tr.byId.get(track.id).get(F - gap), cur = tr.byId.get(track.id).get(F);
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(old.x * s, old.y * s); ctx.lineTo(cur.x * s, cur.y * s); ctx.stroke();
    ctx.beginPath(); ctx.arc(cur.x * s, cur.y * s, 9, 0, Math.PI * 2); ctx.stroke();
  }

  function drawChart(levels, half, gapNow) {
    const ctx = crisp($('[data-c="chart"]'), CW, CH);
    const pad = 28, maxE = 10;
    const X = (g) => pad + ((g - 1) / (MAXGAP - 1)) * (CW - pad - 10), Y = (e) => CH - 22 - (Math.min(e, maxE) / maxE) * (CH - 40);
    ctx.clearRect(0, 0, CW, CH);
    ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = col.muted; ctx.strokeStyle = col.rule;
    for (let e = 0; e <= maxE; e += 2) { ctx.beginPath(); ctx.moveTo(pad, Y(e)); ctx.lineTo(CW - 10, Y(e)); ctx.stroke(); ctx.fillText(String(e), 6, Y(e) + 3); }
    for (let g = 1; g <= MAXGAP; g++) ctx.fillText(String(g), X(g) - 3, CH - 8);
    ctx.fillText('px error', pad, 12);
    ctx.fillStyle = 'rgba(21,128,61,.12)'; ctx.fillRect(pad, Y(1), CW - pad - 10, Y(0) - Y(1));
    const series = (lv, color) => {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let g = 1; g <= MAXGAP; g++) { const e = solve(g, lv, half).err; (g > 1 ? ctx.lineTo : ctx.moveTo).call(ctx, X(g), Y(e)); }
      ctx.stroke();
      for (let g = 1; g <= MAXGAP; g++) { const e = solve(g, lv, half).err; ctx.beginPath(); ctx.arc(X(g), Y(e), g === gapNow ? 4 : 2.5, 0, Math.PI * 2); ctx.fill(); }
    };
    series(1, col.orange);
    if (levels > 1) series(levels, col.blue);
  }

  function drawLevels(sol, levels, half, gap) {
    const host = $('[data-r="levels"]');
    const tr = api.stage.tracks, old = tr.byId.get(track.id).get(F - gap);
    host.innerHTML = sol.r.log.slice().reverse().map(({ level, guess, p, steps, converged }) => `
      <figure class="pg__fig pg__fig--patch"><canvas data-l="${level}" width="96" height="96"></canvas>
        <figcaption>level ${level}: start (${guess[0].toFixed(1)}, ${guess[1].toFixed(1)}) → (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) in ${steps} step${steps === 1 ? '' : 's'}${converged ? '' : ' ✗'}</figcaption></figure>`).join('');
    const P = pyr(F - gap);
    for (const { level, p } of sol.r.log) {
      const s = 2 ** level, L = P[level], S = 20;
      const cv = host.querySelector(`[data-l="${level}"]`);
      drawGray(cv, samplePatch(L.gray, L.w, L.h, old.x / s, old.y / s, S), 2 * S + 1);
      const c = cv.getContext('2d'), k = cv.width / (2 * S + 1), m = cv.width / 2;
      c.strokeStyle = '#22d3ee'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(m, m); c.lineTo(m + p[0] * k, m + p[1] * k); c.stroke();
      c.strokeRect(m - half * k, m - half * k, (2 * half + 1) * k, (2 * half + 1) * k);
    }
  }

  $('[data-c="frame"]').addEventListener('click', (e) => {
    if (!grays) return;
    const r = e.currentTarget.getBoundingClientRect(), s = w / r.width;
    const x = (e.clientX - r.left) * s, y = (e.clientY - r.top) * s, tr = api.stage.tracks;
    const cand = tr.frames[F].filter((p) => p.status === 'tracked' && tr.byId.get(p.id).get(F - MAXGAP));
    const best = cand.reduce((b, p) => (!b || Math.hypot(p.x - x, p.y - y) < Math.hypot(b.x - x, b.y - y) ? p : b), null);
    if (best) { track = best; compute(); }
  });

  load();
  // Fixed frames: nothing to update when the story moves on.
}
