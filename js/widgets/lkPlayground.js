// Playground (Ch 4): Lucas–Kanade on real pixels, one step at a time.
// Pick a tracked corner on the frame, click the error surface E(p) to choose
// the starting guess p0, and step through Gauss–Newton. Shows the template,
// the warped patch and the error image at the selected step.

import { shell, slider, controls, crisp, palette, drawGray } from './pg.js';
import { toGray, lkTranslation, samplePatch, bilinear } from '../lib/imageOps.js';

const R = 6;      // error surface covers p in [-R, R]^2 px
const G = 49;     // surface resolution

export function mountLkPlayground(el, api) {
  const root = shell(el, {
    id: 'lk',
    title: 'Lucas–Kanade, one step at a time',
    intro: 'Click a dot on the frame to pick a corner. The square shows the error $E(\\mathbf{p})$ for every shift $\\mathbf{p}$ within ±6 px (dark = good match). **Click anywhere on it to start the solver there**, then step through the iterations. Starts close to the dark valley converge; starts far away, or windows on an edge, wander.',
    body: `
  <div class="pg__row">
    <figure class="pg__fig pg__fig--wide"><canvas data-c="frame" aria-label="Frame with tracks; click a dot to choose a corner"></canvas>
      <figcaption>Click a dot to choose a corner</figcaption></figure>
    <figure class="pg__fig"><canvas data-c="surf" aria-label="Error surface; click to set the start"></canvas>
      <figcaption>$E(\\mathbf{p})$ · click = start · ring = OpenCV's answer</figcaption></figure>
  </div>
  <div class="pg__row pg__row--patches">
    <figure class="pg__fig pg__fig--patch"><canvas data-c="T" width="96" height="96"></canvas><figcaption>template $T$</figcaption></figure>
    <figure class="pg__fig pg__fig--patch"><canvas data-c="I" width="96" height="96"></canvas><figcaption>$I(\\mathbf{x}+\\mathbf{p}_k)$</figcaption></figure>
    <figure class="pg__fig pg__fig--patch"><canvas data-c="E" width="96" height="96"></canvas><figcaption>error $I - T$ at step $k$</figcaption></figure>
    <table class="pg__readout"><tbody>
      <tr><th>step $k$</th><td data-r="k"></td></tr>
      <tr><th>$\\mathbf{p}_k$</th><td data-r="p"></td></tr>
      <tr><th>$E(\\mathbf{p}_k)$</th><td data-r="e"></td></tr>
      <tr><th>result</th><td data-r="res"></td></tr>
    </tbody></table>
  </div>
  <div class="pg__controls">
    ${slider({ key: 'k', label: 'show step $k$', min: 0, max: 15, step: 1, value: 15 })}
    ${slider({ key: 'half', label: 'window', min: 2, max: 12, step: 1, value: 7 })}
    ${slider({ key: 'lag', label: 'frame gap', min: 1, max: 6, step: 1, value: 2 })}
  </div>
  <p class="widget__meta" data-r="meta">Loading frames…</p>`,
  });
  const col = palette(el);
  const $ = (s) => root.querySelector(s);
  const cF = $('[data-c="frame"]'), cS = $('[data-c="surf"]');
  const FW = 480, FH = 270, SW = 220;
  let g0 = null, g1 = null, w = 0, h = 0, F = 0, frames = null, track = null, p0 = [1.5, -1], run = null, surf = null;

  const get = controls(root, { k: (v) => String(v), half: (v) => `${2 * v + 1}×${2 * v + 1}`, lag: (v) => `${v} frame${v > 1 ? 's' : ''}` }, () => {
    if (get('lag') !== frames?.lag) load(); else solve(true);
  });

  async function load() {
    const tr = api.stage.tracks;
    // The chapter's key frame (its first held line), so results don't depend on where the story is.
    F = Math.max(6, api.chapter.dialogue.find((l) => l.hold != null)?.hold ?? api.stage.frame);
    const lag = get('lag');
    $('[data-r="meta"]').textContent = 'Loading frames…';
    const [a, b] = await api.stage.grabFramesAt([F - lag, F]);
    if (!a || !b) { $('[data-r="meta"]').textContent = 'Video frames not available yet.'; return; }
    g0 = toGray(a); g1 = toGray(b); w = a.width; h = a.height;
    frames = { lag, img: b };
    if (!track || !tr.byId.get(track.id)?.get(F - lag)) track = pickDefault(tr, lag);
    solve(false);
  }

  function pickDefault(tr, lag) {
    const pts = tr.frames[F].filter((p) => p.status === 'tracked' && tr.byId.get(p.id).get(F - lag));
    const inside = pts.filter((p) => p.x > 40 && p.x < w - 40 && p.y > 40 && p.y < h - 40);
    const age = (p) => { let k = 0; const hst = tr.byId.get(p.id); while (hst.has(F - k - 1)) k++; return k; };
    return (inside.length ? inside : pts).reduce((b, p) => (!b || age(p) > age(b) ? p : b), null);
  }

  function solve(keepSurface) {
    if (!g0 || !track) return;
    const tr = api.stage.tracks, lag = get('lag'), half = get('half');
    const old = tr.byId.get(track.id).get(F - lag), cur = tr.byId.get(track.id).get(F);
    const x0 = Math.round(old.x), y0 = Math.round(old.y);
    const T = samplePatch(g0, w, h, x0, y0, half);
    if (!keepSurface || surf?.half !== half || surf?.id !== track.id) {
      // E(p) on a grid: sum of squared differences between T and I shifted by p.
      const E = new Float32Array(G * G);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const px = -R + (2 * R * i) / (G - 1), py = -R + (2 * R * j) / (G - 1);
        let e = 0;
        for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
          const r = bilinear(g1, w, h, x0 + dx + px, y0 + dy + py) - T[(dy + half) * (2 * half + 1) + dx + half];
          e += r * r;
        }
        E[j * G + i] = e;
      }
      surf = { E, half, id: track.id };
    }
    run = lkTranslation(g0, g1, w, h, x0, y0, half, { maxIter: 15, eps: 0.02, init: p0 });
    const truth = [cur.x - x0, cur.y - y0];
    const k = Math.min(get('k'), run.iterates.length - 1);
    drawFrame(old, cur);
    drawSurface(truth, k);
    drawPatches(T, x0, y0, half, k);
    const [px, py, E] = run.iterates[k];
    const fin = run.p, miss = Math.hypot(fin[0] - truth[0], fin[1] - truth[1]);
    $('[data-r="k"]').textContent = `${k} of ${run.iterates.length - 1}`;
    $('[data-r="p"]').textContent = `(${px.toFixed(2)}, ${py.toFixed(2)}) px`;
    $('[data-r="e"]').textContent = E == null ? '(converged)' : E.toFixed(3);
    $('[data-r="res"]').textContent = `${run.converged ? 'converged' : 'did not converge'} at (${fin[0].toFixed(2)}, ${fin[1].toFixed(2)}) · ${miss < 0.5 ? 'matches' : `${miss.toFixed(1)} px from`} OpenCV`;
    $('[data-r="meta"]').textContent = `Frames ${F - lag} → ${F} · track #${track.id} · start p0 = (${p0[0].toFixed(1)}, ${p0[1].toFixed(1)}) · λmin = ${run.lambdaMin.toExponential(2)}`;
  }

  function drawFrame(old, cur) {
    const ctx = crisp(cF, FW, FH), s = FW / w;
    const tmp = Object.assign(document.createElement('canvas'), { width: w, height: h });
    tmp.getContext('2d').putImageData(frames.img, 0, 0);
    ctx.drawImage(tmp, 0, 0, FW, FH);
    for (const p of api.stage.tracks.frames[F]) {
      if (p.status === 'lost') continue;
      ctx.fillStyle = 'rgba(255,176,32,.9)';
      ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2;
    const half = get('half');
    ctx.strokeRect((cur.x - half) * s, (cur.y - half) * s, (2 * half + 1) * s, (2 * half + 1) * s);
    ctx.beginPath(); ctx.arc(cur.x * s, cur.y * s, 9, 0, Math.PI * 2); ctx.stroke();
  }

  const toSurf = (v) => ((v + R) / (2 * R)) * SW;
  function drawSurface(truth, k) {
    const ctx = crisp(cS, SW, SW);
    const { E } = surf;
    let lo = Infinity, hi = -Infinity;
    for (const e of E) { lo = Math.min(lo, e); hi = Math.max(hi, e); }
    const img = ctx.createImageData(G, G);
    for (let i = 0; i < E.length; i++) {
      const t = Math.log1p(E[i] - lo) / Math.log1p(hi - lo || 1);
      const c = Math.round(20 + 225 * t);
      img.data.set([c, Math.round(c * 0.95), Math.round(c * 0.85), 255], i * 4);
    }
    const tmp = Object.assign(document.createElement('canvas'), { width: G, height: G });
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, SW, SW);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(SW / 2, 0); ctx.lineTo(SW / 2, SW); ctx.moveTo(0, SW / 2); ctx.lineTo(SW, SW / 2); ctx.stroke();
    // OpenCV's answer
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(toSurf(truth[0]), toSurf(truth[1]), 7, 0, Math.PI * 2); ctx.stroke();
    // iterate path up to step k
    ctx.strokeStyle = '#fbbf24'; ctx.fillStyle = '#fbbf24'; ctx.lineWidth = 2;
    ctx.beginPath();
    run.iterates.slice(0, k + 1).forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, toSurf(x), toSurf(y)));
    ctx.stroke();
    run.iterates.slice(0, k + 1).forEach(([x, y], i) => {
      ctx.beginPath(); ctx.arc(toSurf(x), toSurf(y), i === k ? 4.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#fff'; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`±${R} px`, 4, 12);
  }

  function drawPatches(T, x0, y0, half, k) {
    const n = 2 * half + 1, [px, py] = run.iterates[k];
    const I = samplePatch(g1, w, h, x0 + px, y0 + py, half);
    const E0 = samplePatch(g1, w, h, x0 + p0[0], y0 + p0[1], half);
    const range = Math.max(1e-3, ...E0.map((v, i) => Math.abs(v - T[i])));
    drawGray($('[data-c="T"]'), T, n);
    drawGray($('[data-c="I"]'), I, n);
    drawGray($('[data-c="E"]'), I.map((v, i) => v - T[i]), n, true, range);
  }

  // --- interaction -------------------------------------------------------------
  cS.addEventListener('click', (e) => {
    const r = cS.getBoundingClientRect();
    p0 = [((e.clientX - r.left) / r.width) * 2 * R - R, ((e.clientY - r.top) / r.height) * 2 * R - R];
    root.querySelector('[data-i="k"]').value = 15;
    root.querySelector('[data-o="k"]').textContent = '15';
    solve(true);
  });
  cF.addEventListener('click', (e) => {
    if (!g0) return;
    const r = cF.getBoundingClientRect(), s = w / r.width;
    const x = (e.clientX - r.left) * s, y = (e.clientY - r.top) * s;
    const tr = api.stage.tracks, lag = get('lag');
    const cand = tr.frames[F].filter((p) => p.status === 'tracked' && tr.byId.get(p.id).get(F - lag));
    const best = cand.reduce((b, p) => (!b || Math.hypot(p.x - x, p.y - y) < Math.hypot(b.x - x, b.y - y) ? p : b), null);
    if (best) { track = best; solve(false); }
  });

  load();
  // Fixed frames: nothing to update when the story moves on.
}
