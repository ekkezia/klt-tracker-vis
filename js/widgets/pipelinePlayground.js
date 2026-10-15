// Playground (Ch 5): the whole KLT loop, re-run in the browser on the last
// N frames of footage with your parameters:
//   detect/replenish (Shi–Tomasi, spacing) → track (pyramidal LK) → verify
//   (forward–backward error, corner strength).

import { shell, slider, controls, crisp, palette } from './pg.js';
import { toGray, gradients, minEigenMap, buildPyramid, lkPyramid } from '../lib/imageOps.js';

const N = 16; // frames re-tracked

export function mountPipelinePlayground(el, api) {
  const root = shell(el, {
    id: 'pipe',
    title: 'Run the KLT loop yourself',
    intro: 'The last 16 frames of footage, re-tracked in your browser with the three steps of the loop: detect/replenish, track, verify. Change the parameters and watch how many tracks survive, how many are dropped, and how many must be re-detected. (A short, plain re-implementation: no smoothing before gradients, so its errors run higher than OpenCV\'s in the HUD.)',
    body: `
  <div class="pg__row">
    <figure class="pg__fig pg__fig--wide"><canvas data-c="frame" aria-label="Last frame with tracks and trails"></canvas>
      <figcaption><span class="key" data-key="tracked">tracked</span> · <span class="key" data-key="fresh">detected in these frames</span> · <span class="key" data-key="lost">dropped</span> (last frame)</figcaption></figure>
    <figure class="pg__fig"><canvas data-c="chart" aria-label="Track counts per frame"></canvas>
      <figcaption>per frame: kept, dropped, new</figcaption></figure>
  </div>
  <div class="pg__controls">
    ${slider({ key: 'max', label: 'max corners', min: 20, max: 200, step: 10, value: 100 })}
    ${slider({ key: 'dist', label: 'min spacing', min: 4, max: 40, step: 1, value: 12 })}
    ${slider({ key: 'fb', label: 'forward–backward limit', min: 0.1, max: 5, step: 0.1, value: 1 })}
    ${slider({ key: 'levels', label: 'pyramid levels', min: 1, max: 4, step: 1, value: 3 })}
    ${slider({ key: 'half', label: 'window', min: 3, max: 10, step: 1, value: 7 })}
  </div>
  <table class="pg__readout"><tbody>
    <tr><th>tracks at the end</th><td data-r="end"></td></tr>
    <tr><th>dropped (forward–backward / weak / left view)</th><td data-r="drop"></td></tr>
    <tr><th>re-detected</th><td data-r="new"></td></tr>
    <tr><th>median forward–backward error</th><td data-r="fb"></td></tr>
  </tbody></table>
  <p class="widget__meta" data-r="meta">Loading frames…</p>`,
  });
  const col = palette(el);
  const $ = (s) => root.querySelector(s);
  const FW = 480, FH = 270, CW = 240, CH = 170;
  let frames = null, last = null, w = 0, h = 0, F = 0, loading = false, result = null;

  const get = controls(root, {
    max: String, dist: (v) => `${v} px`, fb: (v) => `${v.toFixed(1)} px`, levels: (v) => (v === 1 ? '1 (none)' : String(v)), half: (v) => `${2 * v + 1}×${2 * v + 1}`,
  }, () => { $('[data-r="meta"]').textContent = 'Re-tracking…'; setTimeout(run, 20); }, 250);

  async function load() {
    F = Math.max(N, api.stage.frame);
    loading = true;
    $('[data-r="meta"]').textContent = 'Loading frames…';
    const want = Array.from({ length: N }, (_, k) => F - N + 1 + k);
    const imgs = await api.stage.grabFramesAt(want).finally(() => setTimeout(() => { loading = false; }, 300));
    if (imgs.some((x) => !x)) { $('[data-r="meta"]').textContent = 'Video frames not available yet.'; return; }
    w = imgs[0].width; h = imgs[0].height; last = imgs[N - 1];
    frames = imgs.map((im) => {
      const gray = toGray(im);
      const { Ix, Iy } = gradients(gray, w, h);
      return { gray, score: minEigenMap(Ix, Iy, w, h, 3), pyr: buildPyramid(gray, w, h, 4) };
    });
    run();
  }

  // Shi–Tomasi detection: local maxima of λmin above 1% of the best, strongest
  // first, at least `dist` px from each other and from existing tracks.
  function detect(fr, existing, want, dist) {
    if (want <= 0) return [];
    const { score } = fr, m = 12;
    let best = 0;
    for (const v of score) best = Math.max(best, v);
    const cand = [];
    for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
      const i = y * w + x, v = score[i];
      if (v < best * 0.01 || v < 1e-3) continue;
      if (v < score[i - 1] || v < score[i + 1] || v < score[i - w] || v < score[i + w]) continue;
      cand.push([v, x, y]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const cell = Math.max(1, dist), grid = new Map();
    const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    const near = (x, y) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        for (const [px, py] of grid.get(`${cx + dx},${cy + dy}`) ?? []) if (Math.hypot(px - x, py - y) < dist) return true;
      }
      return false;
    };
    const add = (x, y) => { const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, y]); };
    existing.forEach((t) => add(t.x, t.y));
    const out = [];
    for (const [, x, y] of cand) {
      if (out.length >= want) break;
      if (near(x, y)) continue;
      add(x, y); out.push({ x, y });
    }
    return out;
  }

  function run() {
    if (!frames) return;
    const max = get('max'), dist = get('dist'), thr = get('fb'), levels = get('levels'), half = get('half');
    let nextId = 1;
    let tracks = detect(frames[0], [], max, dist).map((p) => ({ id: nextId++, x: p.x, y: p.y, trail: [[p.x, p.y]], born: 0 }));
    const stats = [{ kept: 0, dropped: 0, fresh: tracks.length }];
    const reasons = { fb: 0, weak: 0, out: 0 };
    const fbAll = [];
    let lostLast = [];
    for (let f = 1; f < N; f++) {
      const A = frames[f - 1], B = frames[f], kept = [];
      lostLast = [];
      for (const t of tracks) {
        const x0 = Math.round(t.x), y0 = Math.round(t.y);
        const m = half + 2;
        const fwd = lkPyramid(A.pyr, B.pyr, x0, y0, half, levels);
        const nx = x0 + fwd.p[0], ny = y0 + fwd.p[1];
        if (!(nx > m && ny > m && nx < w - m && ny < h - m)) { reasons.out++; lostLast.push(t); continue; }
        const bx0 = Math.round(nx), by0 = Math.round(ny);
        const back = lkPyramid(B.pyr, A.pyr, bx0, by0, half, levels);
        const e = Math.hypot(bx0 + back.p[0] - t.x, by0 + back.p[1] - t.y);
        fbAll.push(e);
        if (!(e < thr)) { reasons.fb++; lostLast.push(t); continue; }
        if (B.score[by0 * w + bx0] < 5e-4) { reasons.weak++; lostLast.push(t); continue; }
        t.x = nx; t.y = ny; t.trail.push([nx, ny]); kept.push(t);
      }
      const fresh = detect(B, kept, max - kept.length, dist).map((p) => ({ id: nextId++, x: p.x, y: p.y, trail: [[p.x, p.y]], born: f }));
      tracks = kept.concat(fresh);
      stats.push({ kept: kept.length, dropped: lostLast.length, fresh: fresh.length });
    }
    result = { tracks, stats, lostLast };
    const sum = (k) => stats.slice(1).reduce((s, x) => s + x[k], 0);
    fbAll.sort((a, b) => a - b);
    $('[data-r="end"]').textContent = `${tracks.length} (${tracks.filter((t) => t.born === 0).length} followed all ${N} frames)`;
    $('[data-r="drop"]').textContent = `${sum('dropped')}  (${reasons.fb} / ${reasons.weak} / ${reasons.out})`;
    $('[data-r="new"]').textContent = `${sum('fresh')}`;
    $('[data-r="fb"]').textContent = fbAll.length ? `${fbAll[fbAll.length >> 1].toFixed(3)} px` : '—';
    $('[data-r="meta"]').textContent = `Frames ${F - N + 1}–${F} · ${tracks.length} tracks · computed in your browser`;
    draw();
  }

  function draw() {
    const ctx = crisp($('[data-c="frame"]'), FW, FH), s = FW / w;
    const tmp = Object.assign(document.createElement('canvas'), { width: w, height: h });
    tmp.getContext('2d').putImageData(last, 0, 0);
    ctx.drawImage(tmp, 0, 0, FW, FH);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, FW, FH);
    for (const t of result.tracks) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); t.trail.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x * s, y * s)); ctx.stroke();
      ctx.fillStyle = t.born === 0 ? '#ffb020' : '#34d399';
      ctx.beginPath(); ctx.arc(t.x * s, t.y * s, 2.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
    for (const t of result.lostLast) {
      const x = t.x * s, y = t.y * s;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
    }
    // counts per frame: stacked bars kept (amber) + new (green), dropped (red) below the axis
    const c = crisp($('[data-c="chart"]'), CW, CH);
    const st = result.stats, top = Math.max(...st.map((x) => x.kept + x.fresh), 10), dmax = Math.max(...st.map((x) => x.dropped), 5);
    const base = CH - 46, bw = (CW - 30) / N;
    const Y = (v) => (v / top) * (base - 14), D = (v) => (v / dmax) * 30;
    c.clearRect(0, 0, CW, CH);
    st.forEach((x, i) => {
      const X = 24 + i * bw;
      c.fillStyle = '#d99a1e'; c.fillRect(X, base - Y(x.kept), bw - 2, Y(x.kept));
      c.fillStyle = '#34d399'; c.fillRect(X, base - Y(x.kept) - Y(x.fresh), bw - 2, Y(x.fresh));
      c.fillStyle = '#ef4444'; c.fillRect(X, base + 2, bw - 2, D(x.dropped));
    });
    c.fillStyle = col.muted; c.font = '10px ui-monospace, monospace';
    c.fillText(String(top), 2, 18); c.fillText('0', 12, base + 3);
    c.fillText(`${N} frames →`, CW - 72, CH - 4);
  }

  load();
  // Follow the story's frame, but only once it has come to rest and only while this playground is on screen:
  // grabbing frames seeks the shared video, which must never happen while the story is playing footage.
  let settle = 0;
  const off = api.stage.onFrame(() => {
    clearTimeout(settle);
    settle = setTimeout(() => { if (!loading && el.isConnected && el.offsetParent && api.stage.frame !== F) load(); }, 500);
  });
  return () => { off(); clearTimeout(settle); };
}
