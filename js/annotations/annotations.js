// Annotations: explanations drawn ON the footage, anchored to what they explain.
//
// A dialogue line may carry `focus` (one object or an array):
//   { kind, at, title?, body?, win?, lag?, scale? }
//
//   kind  one of KINDS below:
//           'card' | 'tracks' | 'window' | 'tensor' | 'aperture' | 'flow' | 'lk'
//           'flowfield'  motion arrows for every active track (lag, scale)
//           'heatmap'    Shi–Tomasi λ_min of every pixel under the dots
//                        (win: half-size, spacing: draw min-distance circles)
//           'fb'         forward–backward error ring on every track (scale, labels)
//           'replenish'  tracks lost (×) and corners detected (rings) in the last `lag` frames
//           'pyramid'    inset: the anchored track's motion at pyramid levels 0..3
//           'patches'    inset: patches around the anchored track; maps from
//                        'prev' | 'next' | 'Ix' | 'Iy' | 'It'
//         `lk` with start: [dx, dy] (or startOffset: [dx, dy] from OpenCV's answer), inset: true adds template / warped / error images and the
//         iterate path, magnified. Anchored kinds dim every other track (focus).
//   at    anchor spec (resolved every frame, in the footage's pixel grid):
//           { point: [x, y] }               fixed position
//           { trackId: n }                  follow one track
//           { track: 'auto', near?: [x,y] } follow the active track nearest
//                                           `near` (default: centre of the
//                                           visible area); re-picks if lost
//           { track: 'fastest' }            the visible track that moved most
//                                           since the previous frame
//           { auto: 'corner'|'edge'|'flat',  best example found by the
//             region?: [x0,y0,x1,y1] }      structure-tensor detector on the
//                                           current frame, inside the visible area
//                                           (and inside `region`, if given)
//         omitted -> the card floats in the top-left of the visible area.
//   title/body  markup (see chapters.js header)
//   win   window half-size in px (default 7 -> 15x15)
//
// Cards are HTML (so KaTeX works); markers and leader lines are canvas.
//
// Colour keys: card text may contain {{key|words}} (see markup.js), e.g.
// "{{lost|red ×}}". The words take the key's colour; every mark the kind
// registered under that key (mark(it, key, x, y, r)) gets a halo in the same
// colour, and a connector runs from the card to the nearest one. Hovering or
// focusing the words makes all of that key's marks pulse. Keys: tracked, fresh,
// lost, focus, good, warn, bad, muted, tail, heat (colour only).

import { inline, render } from '../lib/markup.js';
import {
  toGray, gradients, structureTensor, eig2, classify, findExamples, lkTranslation, harris,
  minEigenMap, downsample2, samplePatch, bilinear,
} from '../lib/imageOps.js';
import { arrow } from '../stage/scenes.js';

const TAU = 0.1; // classification threshold, same default as the Ch 2 widget
const fmt = (v) => (Math.abs(v) >= 100 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : v.toFixed(3));
const CLASS_TEXT = { flat: 'Flat', edge: 'Edge', corner: 'Corner' };
const fmtTex = (v) => fmt(v).replace(/e([+-]?)(\d+)$/, (_, sg, d) => `\\times 10^{${sg === '-' ? '-' : ''}${d}}`);
const FOCUS_KINDS = new Set(['flow', 'lk', 'pyramid', 'patches', 'window']);

export function createAnnotations(layer, stage, { getSafeRect, onFocus }) {
  let items = [];
  let token = 0;

  let placed = []; // card rects already placed this frame (screen px), for collision avoidance
  stage.onDraw((ctx, info) => {
    // Start with on-screen UI that cards must not cover (marked data-annot-avoid).
    placed = [...document.querySelectorAll('[data-annot-avoid]')]
      .filter((el) => !el.hidden && el.offsetParent)
      .map((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    for (const it of items) drawItem(ctx, it, info);
    for (const it of items) drawKeys(ctx, it, info);
  });
  stage.onUnderlay((ctx, info) => items.forEach((it) => { it.marks = []; it.kind.under?.(ctx, it, info); }));

  // --- colour keys -------------------------------------------------------------
  // Colours come from the same CSS as the words, so text and marks always match.
  const keyColors = new Map();
  function keyColor(key) {
    if (!keyColors.has(key)) {
      const probe = Object.assign(document.createElement('span'), { className: 'key' });
      probe.dataset.key = key;
      probe.style.cssText = 'position:absolute;visibility:hidden';
      layer.appendChild(probe);
      keyColors.set(key, getComputedStyle(probe).color);
      probe.remove();
    }
    return keyColors.get(key);
  }

  let active = null; // { it, key } while the reader hovers / focuses a key
  function setActive(chip) {
    const it = chip && items.find((x) => x.card.contains(chip));
    active = it ? { it, key: chip.dataset.key } : null;
    layer.querySelectorAll('.key.is-active').forEach((el) => el.classList.remove('is-active'));
    if (active) {
      it.card.querySelectorAll(`.key[data-key="${active.key}"]`).forEach((el) => el.classList.add('is-active'));
      const tick = () => { if (!active) return stage.redraw(); stage.redraw(); requestAnimationFrame(tick); };
      tick();
    } else stage.redraw();
  }
  layer.addEventListener('pointerover', (e) => { const c = e.target.closest?.('.key'); if (c) setActive(c); });
  layer.addEventListener('pointerout', (e) => { if (e.target.closest?.('.key') && !e.relatedTarget?.closest?.('.key')) setActive(null); });
  layer.addEventListener('focusin', (e) => { const c = e.target.closest?.('.key'); if (c) setActive(c); });
  layer.addEventListener('focusout', () => setActive(null));

  function drawKeys(ctx, it, info) {
    const chips = [...it.card.querySelectorAll('.key[data-key]')];
    if (!chips.length || !it.marks?.length) return;
    const { px } = info;
    const card = it.card.getBoundingClientRect();
    const done = new Set();
    for (const chip of chips) {
      const key = chip.dataset.key;
      if (done.has(key)) continue;
      done.add(key);
      const marks = it.marks.filter((m) => m.key === key);
      if (!marks.length) continue;
      const col = keyColor(key);
      const hot = active?.it === it && active.key === key;
      const faded = active?.it === it && !hot; // another key of this card is hovered
      const halo = (m) => (m.r ?? 0) + (hot ? 9 + 3 * Math.sin(performance.now() / 160) : 7) * px;
      // Halos: always when there are few marks; for crowds (every track) only on hover.
      if (marks.length <= 40 || hot) {
        ctx.save();
        if (faded) ctx.globalAlpha = 0.2;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = hot ? 14 : 6;
        ctx.lineWidth = (hot ? 3 : 2) * px;
        for (const m of marks) { ctx.beginPath(); ctx.arc(m.x, m.y, halo(m), 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
      // Connector: from where the line leaves the card to the nearest mark.
      const cr = chip.getBoundingClientRect();
      const sx = cr.left + cr.width / 2, sy = cr.top + cr.height / 2;
      const scr = marks.map((m) => [m, ...stage.toScreen(m.x, m.y)]);
      const [m, mx, my] = scr.reduce((b, c) => (Math.hypot(c[1] - sx, c[2] - sy) < Math.hypot(b[1] - sx, b[2] - sy) ? c : b));
      const dx = mx - sx, dy = my - sy;
      const exits = [dx > 0 ? (card.right - sx) / dx : dx < 0 ? (card.left - sx) / dx : Infinity,
        dy > 0 ? (card.bottom - sy) / dy : dy < 0 ? (card.top - sy) / dy : Infinity];
      const tExit = Math.min(...exits);
      if (!(tExit < 1)) continue; // the mark is under the card
      const [ex, ey] = stage.toNative(sx + dx * tExit, sy + dy * tExit);
      const d = Math.hypot(m.x - ex, m.y - ey), stop = Math.max(0, d - halo(m));
      ctx.save();
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.globalAlpha = hot ? 1 : faded ? 0.2 : 0.85;
      ctx.lineWidth = (hot ? 2.5 : 1.5) * px;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + ((m.x - ex) * stop) / d, ey + ((m.y - ey) * stop) / d); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, 2.5 * px, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  // Focus mode: while an annotation is about one track, dim all the others.
  stage.setFocusProvider(() => {
    const ids = items.filter((it) => FOCUS_KINDS.has(it.spec.kind) && it.lockId != null).map((it) => it.lockId);
    return ids.length ? new Set(ids) : null;
  });

  // Recompute pixel-based measurements when a new frame is presented.
  stage.onFrame(() => items.forEach((it) => it.kind.onFrame?.(it, stage)));
  // Re-place cards when the layer or any UI they avoid changes size (e.g. the
  // HUD panel collapsing after a chapter brief).
  const ro = new ResizeObserver(() => stage.redraw());
  ro.observe(layer);
  document.querySelectorAll('[data-annot-avoid]').forEach((el) => ro.observe(el));

  function show(focus) {
    clear();
    const list = focus == null ? [] : [].concat(focus);
    const my = ++token;
    onFocus?.(list);
    items = list.map((spec) => {
      const kind = KINDS[spec.kind] ?? KINDS.card;
      const card = document.createElement('div');
      card.className = `annot annot--${spec.kind ?? 'card'}`;
      card.innerHTML = `
        ${spec.title ? `<p class="annot__title">${inline(spec.title)}</p>` : ''}
        ${spec.body ? `<div class="annot__body">${render(spec.body)}</div>` : ''}
        <div class="annot__live" aria-live="off"></div>`;
      layer.appendChild(card);
      ro.observe(card); // live readouts and KaTeX change its size after placement
      const it = { spec, kind, card, live: card.querySelector('.annot__live'), anchor: null, lockId: null, data: {}, stage, marks: [] };
      return it;
    });
    // Async set-up (auto anchors, frame grabs) after the current frame exists.
    items.forEach(async (it) => {
      await it.kind.init?.(it, stage, getSafeRect);
      if (my === token) it.kind.onFrame?.(it, stage);
      stage.redraw();
    });
    stage.redraw();
  }

  function clear() {
    token++;
    active = null;
    onFocus?.([]);
    items.forEach((it) => it.card.remove());
    items = [];
  }

  // --- per-frame drawing -----------------------------------------------------
  function drawItem(ctx, it, info) {
    const a = resolveAnchor(it, info, getSafeRect());
    it.anchor = a;
    const { px, colors } = info;
    if (a) it.kind.draw?.(ctx, it, a, info);
    placeCard(ctx, it, a, px, colors);
  }

  function resolveAnchor(it, info, safe) {
    const at = it.spec.at;
    if (!at) return null;
    if (at.point) return { x: at.point[0], y: at.point[1] };
    if (at.auto) return it.data.auto ?? null;
    const active = info.points.filter((p) => p.status !== 'lost');
    if (at.trackId != null) { it.lockId = at.trackId; return active.find((p) => p.id === at.trackId) ?? null; }
    if (at.track) {
      let p = it.lockId != null ? active.find((q) => q.id === it.lockId) : null;
      if (!p) {
        const [nx, ny] = at.near ?? [(safe.x0 + safe.x1) / 2, (safe.y0 + safe.y1) / 2];
        const inside = active.filter((q) => q.x > safe.x0 + 20 && q.x < safe.x1 - 20 && q.y > safe.y0 + 20 && q.y < safe.y1 - 20);
        // 'fastest': the visible track that moved most since the previous frame.
        const speed = (q) => { const o = info.tracks.byId.get(q.id)?.get(info.frame - 1); return o ? Math.hypot(q.x - o.x, q.y - o.y) : -1; };
        const score = at.track === 'fastest' ? (q) => -speed(q) : (q) => Math.hypot(q.x - nx, q.y - ny);
        p = inside // only anchor to a track the reader can actually see
          .reduce((best, q) => (!best || score(q) < score(best) ? q : best), null);
        it.lockId = p?.id ?? null;
      }
      return p;
    }
    return null;
  }

  function placeCard(ctx, it, a, px, colors) {
    const safe = getSafeRect();
    const [sx0, sy0] = stage.toScreen(safe.x0, safe.y0);
    const [sx1, sy1] = stage.toScreen(safe.x1, safe.y1);
    const cw = it.card.offsetWidth, ch = it.card.offsetHeight;
    const pad = 14;
    const clampX = (x) => Math.min(sx1 - cw - pad, Math.max(sx0 + pad, x));
    const clampY = (y) => Math.min(sy1 - ch - pad, Math.max(sy0 + pad, y));
    const overlap = (l, t) => placed.reduce((sum, r) =>
      sum + Math.max(0, Math.min(l + cw + 8, r.l + r.w + 8) - Math.max(l, r.l)) * Math.max(0, Math.min(t + ch + 8, r.t + r.h + 8) - Math.max(t, r.t)), 0);
    const hits = (l, t) => overlap(l, t) > 0;
    const [ax, ay] = a ? stage.toScreen(a.x, a.y) : [sx0, sy0];
    // Keep the card clear of what the kind draws around its anchor (`reach`, native px).
    const gap = Math.max(56, (it.kind.reach?.(it) ?? 0) * stage.transform.scale + 20);
    // Candidate spots around the anchor (or stacked down the left edge if unanchored).
    const candidates = a
      ? [[ax + gap, ay - ch - gap], [ax - gap - cw, ay - ch - gap], [ax + gap, ay + gap], [ax - gap - cw, ay + gap],
        [ax + gap, ay - ch / 2], [ax - gap - cw, ay - ch / 2]]
      : [[sx0 + pad, sy0 + pad], [sx1 - cw - pad, sy0 + pad]];
    let left, top;
    for (const [l, t] of candidates.map(([l, t]) => [clampX(l), clampY(t)])) {
      if (!hits(l, t)) { left = l; top = t; break; }
    }
    if (left == null) { // everything overlaps: take the spot that covers the least
      const spots = candidates.map(([l, t]) => [clampX(l), clampY(t)]);
      for (let t = sy0 + pad; t < sy1 - ch; t += 24) spots.push([clampX(sx0 + pad), t], [clampX(sx1 - cw - pad), t]);
      [left, top] = spots.reduce((b, p) => (overlap(...p) < overlap(...b) ? p : b));
    }
    placed.push({ l: left, t: top, w: cw, h: ch });
    if (a) {
      // Leader line from the anchor to the nearest point on the card.
      const nx = Math.min(left + cw, Math.max(left, ax)), ny = Math.min(top + ch, Math.max(top, ay));
      const [lx, ly] = stage.toNative(nx, ny);
      ctx.strokeStyle = colors.focus;
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = colors.focus;
      ctx.beginPath(); ctx.arc(a.x, a.y, 3 * px, 0, Math.PI * 2); ctx.fill();
    }
    it.card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  return { show, clear };
}

// --- helpers -----------------------------------------------------------------
function analyse(stage) {
  const img = stage.grabFrame();
  if (!img) return null;
  const gray = toGray(img);
  return { gray, grad: gradients(gray, img.width, img.height), w: img.width, h: img.height };
}

function tensorAt(an, x, y, half) {
  const T = structureTensor(an.grad.Ix, an.grad.Iy, an.w, an.h, Math.round(x), Math.round(y), half);
  return { ...T, ...eig2(T.a, T.b, T.c) };
}

// Grey frames by index, shared by all annotations. The current frame is read
// straight from the video; others need a seek (grabFramesAt), which is safe
// because annotations are only shown once the footage is at rest.
const grayCache = new Map();
async function grays(stage, frames) {
  const want = frames.filter((f) => f >= 0 && !grayCache.has(f));
  const put = (f, img) => {
    if (!img) return;
    grayCache.set(f, { gray: toGray(img), w: img.width, h: img.height });
    while (grayCache.size > 8) grayCache.delete(grayCache.keys().next().value);
  };
  if (want.includes(stage.frame)) put(stage.frame, stage.grabFrame());
  const seek = want.filter((f) => f !== stage.frame);
  if (seek.length) (await stage.grabFramesAt(seek)).forEach((img, k) => put(seek[k], img));
  return frames.map((f) => grayCache.get(f) ?? null);
}

// Colour maps: sequential (inferno-like) for scores, diverging for signed values.
const RAMP = [[0, 0, 4], [87, 16, 110], [188, 55, 84], [249, 142, 9], [252, 255, 164]];
function heat(v) {
  const t = Math.min(1, Math.max(0, v)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
}
function diverge(v) { // v in [-1, 1]: blue - white - red
  const t = Math.min(1, Math.abs(v));
  const end = v < 0 ? [59, 76, 192] : [180, 4, 38];
  return end.map((c) => Math.round(245 + (c - 245) * t));
}

/** Paint an n×n patch into a canvas. mode 'gray' (0..1) or 'signed' (scaled by `range`). */
function paintPatch(canvas, vals, n, mode, range = 1) {
  const c = canvas.getContext('2d');
  const img = c.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const rgb = mode === 'gray' ? [vals[i] * 255, vals[i] * 255, vals[i] * 255] : diverge(vals[i] / range);
    img.data.set([...rgb, 255], i * 4);
  }
  const tmp = Object.assign(document.createElement('canvas'), { width: n, height: n });
  tmp.getContext('2d').putImageData(img, 0, 0);
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

const insetHtml = (cells, foot = '') => `
  <div class="annot__insets">${cells.map(([key, label]) => `
    <figure class="annot__inset"><canvas data-inset="${key}" width="96" height="96"></canvas><figcaption>${inline(label)}</figcaption></figure>`).join('')}
  </div>${foot}`;
const insetCanvas = (it, key) => it.live.querySelector(`[data-inset="${key}"]`);
const maxAbs = (arrs) => arrs.reduce((m, a) => a.reduce((mm, v) => Math.max(mm, Math.abs(v)), m), 1e-6);

/** Run an async inset renderer once per anchored track (draw() is synchronous). */
function renderOnce(it, a, fn) {
  if (it.data.insetFor === a.id || it.data.insetBusy) return;
  it.data.insetBusy = true;
  fn().then(() => { it.data.insetFor = a.id; }).catch((e) => console.warn(e))
    .finally(() => { it.data.insetBusy = false; it.stage.redraw(); });
}

/** Register a mark for colour keys (native px; r = radius of what is drawn there). */
const mark = (it, key, x, y, r = 0) => it.marks.push({ key, x, y, r });
/** A colour-keyed phrase in generated HTML (same as {{key|text}} in markup). */
const keyed = (key, text) => `<span class="key" data-key="${key}" tabindex="0">${text}</span>`;

// Harris & Stephens: R > 0 corner, R < 0 edge, |R| small flat.
const harrisText = (R) => `${fmt(R)} ${Math.abs(R) < 1e-3 ? '(≈ 0: flat)' : R > 0 ? '(> 0: corner)' : '(< 0: edge)'}`;

function setLive(it, html) {
  if (it.data.liveHtml !== html) { it.live.innerHTML = html; it.data.liveHtml = html; }
}

function windowBox(ctx, a, half, px, color, dashed) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * px;
  if (dashed) ctx.setLineDash([5 * px, 4 * px]);
  ctx.strokeRect(a.x - half - 0.5, a.y - half - 0.5, 2 * half + 1, 2 * half + 1);
  ctx.setLineDash([]);
}

// --- kinds -------------------------------------------------------------------
const KINDS = {
  card: {},

  // Every track (drawn by the stage); registers dots, tails and lost marks for keys.
  tracks: {
    under(ctx, it, info) {
      for (const p of info.points) {
        mark(it, p.status === 'lost' ? 'lost' : p.status === 'new' ? 'fresh' : 'tracked', p.x, p.y);
        if (p.status === 'lost') continue;
        const h = info.tracks.byId.get(p.id);
        let k = 10;
        while (k > 1 && !h.has(info.frame - k)) k--;
        const q = h.get(info.frame - k);
        if (q && k > 1) mark(it, 'tail', q.x, q.y);
      }
    },
    onFrame(it, stage) {
      const pts = (stage.tracks?.frames[Math.max(0, stage.frame)] ?? []).filter((p) => p.status !== 'lost');
      setLive(it, `<p class="annot__readout">${pts.length} tracks in this frame</p>`);
    },
  },

  window: {
    reach: (it) => (it.spec.win ?? 7) + 4,
    draw(ctx, it, a, info) {
      windowBox(ctx, a, it.spec.win ?? 7, info.px, info.colors.focus, true);
      mark(it, 'focus', a.x, a.y, it.spec.win ?? 7);
    },
  },

  // Live structure tensor at the anchor: window + gradient-spread ellipse.
  tensor: {
    reach: (it) => (it.spec.win ?? 7) * 2.5,
    async init(it, stage, getSafeRect) { await autoAnchor(it, stage, getSafeRect); },
    onFrame(it, stage) {
      const a = it.anchor ?? it.data.auto;
      const an = analyse(stage);
      if (!a || !an) return;
      const half = it.spec.win ?? 7;
      const t = tensorAt(an, a.x, a.y, half);
      const cls = classify(t.l1, t.l2, TAU);
      it.data.t = t; it.data.cls = cls;
      if (it.spec.compact) { // several tensors at once: badge + eigenvalues only
        setLive(it, `<p class="annot__badge" data-cls="${cls}">${CLASS_TEXT[cls]}</p>
          <p class="annot__readout">${inline(`$\\lambda_1 = ${fmtTex(t.l1)},\\ \\lambda_2 = ${fmtTex(t.l2)}$`)}</p>`);
        stage.redraw();
        return;
      }
      setLive(it, `
        <p class="annot__badge" data-cls="${cls}">${CLASS_TEXT[cls]}</p>
        <table class="annot__table"><tbody>
          <tr><th>${inline('$\\lambda_1$')}</th><td>${fmt(t.l1)}</td></tr>
          <tr><th>${inline('$\\lambda_2$')}</th><td>${fmt(t.l2)}</td></tr>
          <tr><th>Shi–Tomasi ${inline('$\\lambda_{\\min}$')}</th><td>${fmt(t.l2)} ${t.l2 >= TAU ? '≥' : '<'} τ = ${TAU}</td></tr>
          <tr><th>Harris ${inline('$R$')}</th><td>${harrisText(harris(t.a, t.b, t.c, 0.05))}</td></tr>
        </tbody></table>
        <p class="annot__readout">ellipse = gradient spread (∝√λ)</p>`);
      stage.redraw();
    },
    draw(ctx, it, a, info) {
      const half = it.spec.win ?? 7;
      const color = { flat: info.colors.hairline, edge: '#f59e0b', corner: '#34d399' }[it.data.cls] ?? info.colors.focus;
      windowBox(ctx, a, half, info.px, color, false);
      if (it.data.cls) mark(it, it.data.cls, a.x, a.y, half);
      const t = it.data.t;
      if (!t) return;
      // Semi-axes: RMS gradient along each eigenvector, mapped so 0.3/px fills 2.5 windows.
      const R = half * 2.5;
      const r1 = Math.min(1, Math.sqrt(Math.max(0, t.l1) / t.wsum) / 0.3) * R;
      const r2 = Math.min(1, Math.sqrt(Math.max(0, t.l2) / t.wsum) / 0.3) * R;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * info.px;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, Math.max(r1, info.px), Math.max(r2, info.px), Math.atan2(t.v1[1], t.v1[0]), 0, Math.PI * 2);
      ctx.stroke();
    },
  },

  // Aperture problem on an edge: gradient (observable) vs. along-edge (not).
  aperture: {
    reach: () => 66,
    async init(it, stage, getSafeRect) { await autoAnchor(it, stage, getSafeRect); },
    onFrame(it, stage) {
      const a = it.anchor ?? it.data.auto;
      const an = analyse(stage);
      if (!a || !an) return;
      it.data.t = tensorAt(an, a.x, a.y, it.spec.win ?? 7);
      stage.redraw();
    },
    draw(ctx, it, a, info) {
      const t = it.data.t;
      if (!t) return;
      const [gx, gy] = t.v1;           // across the edge (gradient direction)
      const [ex, ey] = [-gy, gx];      // along the edge
      const L = 90, px = info.px;
      ctx.strokeStyle = info.colors.hairline;
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.beginPath(); ctx.moveTo(a.x - ex * L, a.y - ey * L); ctx.lineTo(a.x + ex * L, a.y + ey * L); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.5 * px;
      arrow(ctx, a.x, a.y, a.x + gx * 48, a.y + gy * 48, 9 * px);
      ctx.strokeStyle = '#f87171';
      arrow(ctx, a.x, a.y, a.x + ex * 48, a.y + ey * 48, 9 * px);
      ctx.font = `600 ${13 * px}px ui-sans-serif, system-ui`;
      ctx.fillStyle = '#f87171';
      ctx.fillText('?', a.x + ex * 58, a.y + ey * 58);
      ctx.fillStyle = '#34d399';
      ctx.fillText('✓', a.x + gx * 58, a.y + gy * 58);
      mark(it, 'good', a.x + gx * 48, a.y + gy * 48);
      mark(it, 'bad', a.x + ex * 48, a.y + ey * 48);
    },
  },

  // Motion of the anchored track over the last `lag` frames, magnified.
  flow: {
    draw(ctx, it, a, info) {
      const lag = it.spec.lag ?? 4, k = it.spec.scale ?? 4;
      const prev = info.tracks.byId.get(a.id)?.get(info.frame - lag);
      if (!prev) return;
      const u = (a.x - prev.x) / lag, v = (a.y - prev.y) / lag;
      ctx.strokeStyle = info.colors.focus;
      ctx.lineWidth = 2.5 * info.px;
      arrow(ctx, a.x, a.y, a.x + u * lag * k, a.y + v * lag * k, 9 * info.px);
      mark(it, 'focus', a.x + u * lag * k, a.y + v * lag * k);
      it.data.uv = [u, v];
    },
    onFrame(it) {
      const uv = it.data.uv;
      if (!uv) return;
      setLive(it, `<p class="annot__readout">${inline(`$\\mathbf{d} = (u, v) \\approx (${uv[0].toFixed(2)},\\ ${uv[1].toFixed(2)})$`)} px / frame</p>`);
    },
  },

  // Real Lucas-Kanade iterations between frame F-lag and F on this track.
  lk: {
    reach: (it) => (it.spec.win ?? 7) + 8,
    async init(it, stage, getSafeRect) {
      const F = Math.max(0, stage.frame);
      const lag = it.spec.lag ?? 2;
      const safe = getSafeRect(), m = 40; // the corner must be visible, clear of the panels
      const visible = (p) => p.x > safe.x0 + m && p.x < safe.x1 - m && p.y > safe.y0 + m && p.y < safe.y1 - m;
      const tr = stage.tracks;
      if (!tr) return;
      // Anchor track: resolved by id or nearest; we need its position in both frames.
      const pts = tr.frames[F].filter((p) => p.status !== 'lost');
      const want = it.spec.at?.trackId;
      const near = it.spec.at?.near ?? [tr.width / 2, tr.height * 0.35];
      // Prefer a long-lived track near `near`: static corners survive longest,
      // while points on people or moving vehicles come and go.
      const age = (p) => { const h = tr.byId.get(p.id); let k = 0; while (h.has(F - k - 1)) k++; return k; };
      const seen = pts.filter((p) => visible(p) && tr.byId.get(p.id).get(F - lag));
      const close = seen.filter((p) => Math.hypot(p.x - near[0], p.y - near[1]) < 220);
      const cand = close.length ? close : seen;
      const [gT, gI] = await grays(stage, [F - lag, F]);
      if (!gT || !gI) return;
      const half = it.spec.win ?? 7;
      // Among the longest-lived nearby corners, show the one Lucas–Kanade fits best
      // (converges in the fewest steps, then smallest residual): a clean, textbook example.
      const fit = (p) => {
        const o = tr.byId.get(p.id).get(F - lag);
        const t = lkTranslation(gT.gray, gI.gray, gT.w, gT.h, Math.round(o.x), Math.round(o.y), half, { maxIter: 15, eps: 0.01 });
        return t.converged ? t.iterates.length + (t.iterates.at(-2)?.[2] ?? 0) : Infinity; // fewest steps, then residual
      };
      const pool = cand.slice().sort((a, b) => age(b) - age(a)).slice(0, 12);
      const cur = want != null ? pts.find((p) => p.id === want)
        : pool.map((p) => [p, fit(p)]).reduce((b, c) => (!b || c[1] < b[1] ? c : b), null)?.[0];
      if (!cur) { // panels may still be animating (safe area too small): try again shortly
        if ((it.data.tries = (it.data.tries ?? 0) + 1) < 5 && it.card.isConnected) {
          setTimeout(() => it.card.isConnected && KINDS.lk.init(it, stage, getSafeRect).then(() => stage.redraw()), 400);
        }
        return;
      }
      const old = tr.byId.get(cur.id).get(F - lag);
      if (!old) return;
      it.lockId = cur.id;
      const r = lkTranslation(gT.gray, gI.gray, gT.w, gT.h,
        Math.round(old.x), Math.round(old.y), half, {
        maxIter: 15, eps: 0.01,
        // startOffset: begin this far from OpenCV's answer (a deliberately wrong guess that
        // still lies inside the basin), so the iterations have visible work to do.
        init: it.spec.startOffset ? [cur.x - Math.round(old.x) + it.spec.startOffset[0], cur.y - Math.round(old.y) + it.spec.startOffset[1]]
          : it.spec.start ?? [0, 0],
      });
      it.data.lk = { r, old, cur, half };
      const truth = [cur.x - Math.round(old.x), cur.y - Math.round(old.y)];
      const shown = r.iterates.map((v, k) => [v, k]);
      const rows = shown.map(([v, k]) => (v == null ? `<tr><td>${k}</td><td></td><td></td></tr>` : (([x, y, E]) =>
        `<tr><td>${k}</td><td>(${x.toFixed(2)}, ${y.toFixed(2)})</td><td>${E == null ? '—' : E.toFixed(3)}</td></tr>`)(v))).join('');
      const inset = it.spec.inset ? lkInset(it, gT, gI, Math.round(old.x), Math.round(old.y), half, r) : null;
      // With the inset, the path image replaces the table (keeps the card inside the visible area).
      const table = inset ? '' : `<table class="annot__table"><thead><tr><th>k</th><th>${inline('$\\mathbf{p}_k$')}</th><th>${inline('$E$')}</th></tr></thead><tbody>${rows}</tbody></table>`;
      const steps = r.iterates.length - 1;
      setLive(it, `${inset?.html ?? ''}${table}
        <p class="annot__readout">${r.converged ? `Converged in ${steps} step${steps === 1 ? '' : 's'}` : 'Did not converge'}${inset ? ` · ${inline(`$E$: ${r.iterates[0][2].toFixed(2)} → ${(r.iterates.at(-2)?.[2] ?? 0).toFixed(2)}`)}` : ''} · OpenCV tracker (21×21, pyramid) says ${inline(`$(${truth[0].toFixed(1)}, ${truth[1].toFixed(1)})$`)} · ${inline(`$\\lambda_{\\min} = ${fmt(r.lambdaMin)}$`)}</p>`);
      inset?.paint();
    },
    draw(ctx, it, a, info) {
      const d = it.data.lk;
      if (!d) return;
      const { r, old, half } = d;
      const x0 = Math.round(old.x), y0 = Math.round(old.y);
      windowBox(ctx, { x: x0, y: y0 }, half, info.px, info.colors.hairline, true);
      mark(it, 'muted', x0, y0, half);
      mark(it, 'good', x0 + r.p[0], y0 + r.p[1], half);
      r.iterates.forEach(([x, y]) => mark(it, 'focus', x0 + x, y0 + y));
      ctx.fillStyle = info.colors.focus;
      ctx.strokeStyle = info.colors.focus;
      ctx.lineWidth = 1.5 * info.px;
      ctx.beginPath();
      r.iterates.forEach(([x, y], k) => (k ? ctx.lineTo(x0 + x, y0 + y) : ctx.moveTo(x0 + x, y0 + y)));
      ctx.stroke();
      for (const [x, y] of r.iterates) {
        ctx.beginPath(); ctx.arc(x0 + x, y0 + y, 2.5 * info.px, 0, Math.PI * 2); ctx.fill();
      }
      windowBox(ctx, { x: x0 + r.p[0], y: y0 + r.p[1] }, half, info.px, '#34d399', false);
    },
  },

  // Motion of every active track over the last `lag` frames, magnified.
  flowfield: {
    onFrame(it, stage) {
      const tr = stage.tracks, F = Math.max(0, stage.frame), lag = it.spec.lag ?? 4;
      if (!tr) return;
      let n = 0, su = 0, sv = 0;
      for (const p of tr.frames[F]) {
        const q = p.status !== 'lost' && tr.byId.get(p.id)?.get(F - lag);
        if (!q) continue;
        n++; su += (p.x - q.x) / lag; sv += (p.y - q.y) / lag;
      }
      if (n) setLive(it, `<p class="annot__readout">${n} tracks · mean ${inline(`$\\mathbf{d} \\approx (${(su / n).toFixed(1)},\\ ${(sv / n).toFixed(1)})$`)} px / frame · arrows ×${(it.spec.scale ?? 3) * lag} of one frame</p>`);
    },
    under(ctx, it, info) {
      const lag = it.spec.lag ?? 4, k = it.spec.scale ?? 3;
      ctx.strokeStyle = info.colors.focus;
      ctx.lineWidth = 2 * info.px;
      for (const p of info.points) {
        const q = p.status !== 'lost' && info.tracks.byId.get(p.id)?.get(info.frame - lag);
        if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 60) continue; // skip re-used ids / outliers
        arrow(ctx, p.x, p.y, p.x + (p.x - q.x) * k, p.y + (p.y - q.y) * k, 7 * info.px);
        mark(it, 'focus', p.x + (p.x - q.x) * k, p.y + (p.y - q.y) * k);
      }
    },
  },

  // Detector response: λ_min of each pixel's window, as a heat map under the dots.
  heatmap: {
    async init(it, stage) {
      const F = Math.max(0, stage.frame);
      const [g] = await grays(stage, [F]);
      if (!g) return;
      const half = it.spec.win ?? 3; // 7×7, the block size the recorded tracker used
      const { Ix, Iy } = gradients(g.gray, g.w, g.h);
      const m = minEigenMap(Ix, Iy, g.w, g.h, half);
      const hi = Float32Array.from(m).sort()[Math.floor(m.length * 0.995)] || 1;
      const c = Object.assign(document.createElement('canvas'), { width: g.w, height: g.h });
      const cx = c.getContext('2d'), img = cx.createImageData(g.w, g.h);
      for (let i = 0; i < m.length; i++) {
        const v = Math.min(1, Math.max(0, m[i]) / hi);
        img.data.set([...heat(v), v < 0.04 ? 0 : Math.round(235 * Math.min(1, 1.6 * v) ** 0.7)], i * 4);
      }
      cx.putImageData(img, 0, 0);
      it.data.map = c;
      const minDist = stage.tracks?.tracker?.minDist ?? 12;
      it.data.minDist = minDist;
      setLive(it, `
        <div class="annot__ramp"><span>${inline('$\\lambda_{\\min}$')} low</span><i></i><span>high</span></div>
        <p class="annot__readout">${2 * half + 1}×${2 * half + 1} window per pixel${it.spec.spacing ? ` · dashed circles: ${minDist} px minimum spacing between corners` : ''}</p>`);
    },
    under(ctx, it, info) {
      if (!it.data.map) return;
      ctx.save();
      ctx.globalAlpha = it.spec.alpha ?? 0.8;
      ctx.drawImage(it.data.map, 0, 0, info.width, info.height);
      ctx.restore();
      if (!it.spec.spacing) return;
      ctx.strokeStyle = info.colors.hairline;
      ctx.lineWidth = 1 * info.px;
      ctx.setLineDash([3 * info.px, 3 * info.px]);
      for (const p of info.points) {
        if (p.status === 'lost') continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, it.data.minDist, 0, Math.PI * 2); ctx.stroke();
        mark(it, 'muted', p.x, p.y, it.data.minDist);
      }
      ctx.setLineDash([]);
    },
  },

  // Forward–backward error from the recorded tracker, drawn as a ring per track.
  fb: {
    onFrame(it, stage) {
      const tr = stage.tracks;
      if (!tr) return;
      const pts = tr.frames[Math.max(0, stage.frame)];
      const e = pts.filter((p) => p.status === 'tracked' && typeof p.err === 'number').map((p) => p.err).sort((a, b) => a - b);
      const lost = pts.filter((p) => p.status === 'lost').length;
      const thr = tr.tracker?.fbThresh ?? 1;
      if (!e.length) return;
      setLive(it, `
        <table class="annot__table"><tbody>
          <tr><th>checked this frame</th><td>${e.length + lost}</td></tr>
          <tr><th>median ${inline('$e_{FB}$')}</th><td>${e[e.length >> 1].toFixed(2)} px</td></tr>
          <tr><th>largest kept</th><td>${e[e.length - 1].toFixed(2)} px</td></tr>
          <tr><th>${keyed('lost', 'dropped ×')} (${inline(`$e_{FB} \\ge ${thr}$`)} px, or corner too weak)</th><td>${lost}</td></tr>
        </tbody></table>
        <p class="annot__readout">ring radius = ${it.spec.scale ?? 40} × ${inline('$e_{FB}$')} · ${keyed('good', `green < ${thr / 2} px`)}, ${keyed('warn', `amber < ${thr} px`)}</p>`);
    },
    under(ctx, it, info) {
      const k = it.spec.scale ?? 40, thr = info.tracks.tracker?.fbThresh ?? 1;
      const pts = info.points.filter((p) => p.status === 'tracked' && typeof p.err === 'number');
      ctx.lineWidth = 1.5 * info.px;
      for (const p of pts) {
        ctx.strokeStyle = p.err < thr / 2 ? '#34d399' : '#f59e0b';
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4 * info.px, p.err * k), 0, Math.PI * 2); ctx.stroke();
        mark(it, p.err < thr / 2 ? 'good' : 'warn', p.x, p.y, Math.max(4 * info.px, p.err * k));
      }
      info.points.filter((p) => p.status === 'lost').forEach((p) => mark(it, 'lost', p.x, p.y));
      ctx.font = `600 ${11 * info.px}px ui-monospace, monospace`;
      ctx.fillStyle = '#fff';
      [...pts].sort((a, b) => b.err - a.err).slice(0, it.spec.labels ?? 4).forEach((p) => {
        const tx = p.x + Math.max(4 * info.px, p.err * k) + 4 * info.px, ty = p.y - 4 * info.px;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3 * info.px;
        ctx.strokeText(`${p.err.toFixed(2)} px`, tx, ty);
        ctx.fillText(`${p.err.toFixed(2)} px`, tx, ty);
      });
    },
  },

  // Replenishment: tracks lost over the last `lag` frames (×) and the corners
  // detected over the same frames to replace them (rings).
  replenish: {
    onFrame(it, stage) {
      const r = replenishData(stage.tracks, Math.max(0, stage.frame), it.spec);
      if (!r) return;
      it.data.r = r;
      setLive(it, `<p class="annot__readout">last ${r.lag} frames: ${keyed('lost', `${r.lost.length} tracks lost`)}, ${keyed('fresh', `${r.detected} corners detected`)}${r.relost ? ` (${r.relost} of them already lost again)` : ''} · ${r.count} tracks now</p>`);
    },
    under(ctx, it, info) {
      const r = it.data.r;
      if (!r) return;
      const s = 6 * info.px;
      ctx.strokeStyle = info.colors.lost;
      ctx.lineWidth = 2 * info.px;
      for (const p of r.lost) {
        mark(it, 'lost', p.x, p.y, s);
        ctx.beginPath(); ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); ctx.stroke();
      }
      ctx.strokeStyle = info.colors.fresh;
      for (const p of r.fresh) { ctx.beginPath(); ctx.arc(p.x, p.y, 9 * info.px, 0, Math.PI * 2); ctx.stroke(); mark(it, 'fresh', p.x, p.y, 9 * info.px); }
    },
  },

  // Inset: the anchored track's frame-to-frame motion at pyramid levels 0..3.
  pyramid: {
    reach: () => 16,
    draw(ctx, it, a, info) {
      mark(it, 'focus', a.x, a.y);
      renderOnce(it, a, async () => {
        const F = info.frame, prev = info.tracks.byId.get(a.id)?.get(F - 1);
        const [g] = await grays(it.stage, [F]);
        if (!prev || !g) return;
        const d = [a.x - prev.x, a.y - prev.y], L = it.spec.levels ?? 4, S = 20; // crop half-size per level
        const levels = [g];
        for (let l = 1; l < L; l++) levels.push(downsample2(levels[l - 1].gray, levels[l - 1].w, levels[l - 1].h));
        const mag = it.spec.scale ?? 2;
        setLive(it, insetHtml(levels.map((_, l) => [`l${l}`, `level ${l}: ${(Math.hypot(...d) / 2 ** l).toFixed(1)} px`]),
          `<p class="annot__readout">same ${2 * S + 1}×${2 * S + 1}-pixel crop at every level · arrows ×${mag} · ${keyed('good', 'green')}: ≤ 2 px, small enough for one linear step</p>`));
        levels.forEach((lv, l) => {
          const s = 2 ** l, cv = insetCanvas(it, `l${l}`);
          paintPatch(cv, samplePatch(lv.gray, lv.w, lv.h, a.x / s, a.y / s, S), 2 * S + 1, 'gray');
          const c = cv.getContext('2d'), k = (cv.width / (2 * S + 1)) * mag, m = cv.width / 2;
          const small = Math.hypot(...d) / s <= 2; // roughly the range of one linearised step
          c.strokeStyle = small ? '#34d399' : '#f59e0b';
          c.lineWidth = 2.5;
          arrow(c, m, m, m + (d[0] / s) * k, m + (d[1] / s) * k, 6);
          cv.style.outline = `2px solid ${c.strokeStyle}`;
        });
      });
    },
  },

  // Inset: patches around the anchored track (brightness constancy, gradients).
  patches: {
    reach: () => 16,
    draw(ctx, it, a, info) {
      mark(it, 'focus', a.x, a.y);
      renderOnce(it, a, async () => {
        const lag = it.spec.lag ?? 1, F = info.frame, prev = info.tracks.byId.get(a.id)?.get(F - lag);
        if (!prev) return;
        const [g0, g1] = await grays(it.stage, [F - lag, F]);
        if (!g0 || !g1) return;
        const half = it.spec.win ?? 10, n = 2 * half + 1, { w, h } = g0;
        const at = (g, x, y) => samplePatch(g.gray, w, h, x, y, half);
        const P = at(g0, prev.x, prev.y);
        const maps = {
          prev: [P, 'gray', `frame $t$ at $\\mathbf{x}$`],
          next: [at(g1, a.x, a.y), 'gray', `frame $t{+}${lag}$ at $\\mathbf{x}{+}\\mathbf{d}$`],
        };
        const grad = (dx, dy) => P.map((_, i) => {
          const x = prev.x + (i % n) - half, y = prev.y + Math.floor(i / n) - half;
          return (bilinear(g0.gray, w, h, x + dx, y + dy) - bilinear(g0.gray, w, h, x - dx, y - dy)) / 2;
        });
        maps.Ix = [grad(1, 0), 'signed', '$I_x$'];
        maps.Iy = [grad(0, 1), 'signed', '$I_y$'];
        maps.It = [at(g1, prev.x, prev.y).map((v, i) => v - P[i]), 'signed', '$I_t$ (same pixels, next frame − this)'];
        const keys = it.spec.maps ?? ['prev', 'next'];
        const range = maxAbs(keys.filter((k) => maps[k][1] === 'signed').map((k) => maps[k][0]));
        let foot = '';
        if (keys.includes('next')) {
          const N = maps.next[0], mad = N.reduce((s, v, i) => s + Math.abs(v - P[i]), 0) / N.length;
          foot = `mean |difference| = ${(mad * 255).toFixed(1)} of 255 grey levels`;
        }
        if (keys.includes('It')) { // how well does I_x u + I_y v + I_t = 0 hold here?
          const u = (a.x - prev.x) / lag, v = (a.y - prev.y) / lag;
          const pred = maps.Ix[0].map((gx, i) => -(gx * u + maps.Iy[0][i] * v)), obs = maps.It[0];
          const mean = (x) => x.reduce((s, q) => s + q, 0) / x.length, mp = mean(pred), mo = mean(obs);
          let sxy = 0, sxx = 0, syy = 0;
          pred.forEach((p, i) => { sxy += (p - mp) * (obs[i] - mo); sxx += (p - mp) ** 2; syy += (obs[i] - mo) ** 2; });
          foot = `${inline(`$\\mathbf{d} = (${u.toFixed(2)}, ${v.toFixed(2)})$`)} px/frame · correlation of ${inline('$I_t$')} with ${inline('$-(I_x u + I_y v)$')}: ${(sxy / Math.sqrt(sxx * syy || 1)).toFixed(2)}`;
        }
        setLive(it, insetHtml(keys.map((k) => [k, maps[k][2]]), `<p class="annot__readout">${n}×${n} px around this dot${keys.some((k) => maps[k][1] === 'signed') ? ' · blue −, red +' : ''}${foot ? ` · ${foot}` : ''}</p>`));
        keys.forEach((k) => paintPatch(insetCanvas(it, k), maps[k][0], n, maps[k][1], range));
      });
    },
  },
};

/** Template, warped patch, error before/after and the iterate path for `lk` (inset: true). */
function lkInset(it, gT, gI, x0, y0, half, r) {
  const n = 2 * half + 1, { w, h } = gT;
  const T = samplePatch(gT.gray, w, h, x0, y0, half);
  const [px0, py0] = r.iterates[0];
  const I0 = samplePatch(gI.gray, w, h, x0 + px0, y0 + py0, half);
  const Ip = samplePatch(gI.gray, w, h, x0 + r.p[0], y0 + r.p[1], half);
  const e0 = T.map((v, i) => v - I0[i]), e1 = T.map((v, i) => v - Ip[i]);
  const range = maxAbs([e0]);
  const reach = Math.max(0.5, ...r.iterates.map(([x, y]) => Math.hypot(x, y)));
  const zoom = Math.min(20, 40 / reach);
  const html = insetHtml([
    ['T', 'template $T$'], ['Ip', '$I(\\mathbf{x}+\\mathbf{p})$, final'],
    ['e0', 'error at $\\mathbf{p}_0$'], ['e1', 'error at final $\\mathbf{p}$'], ['path', `path of $\\mathbf{p}_k$ ×${zoom.toFixed(0)}`],
  ], '<p class="annot__readout">error images share one scale · blue −, red + · grid lines 1 px apart</p>');
  return {
    html,
    paint() {
      paintPatch(insetCanvas(it, 'T'), T, n, 'gray');
      paintPatch(insetCanvas(it, 'Ip'), Ip, n, 'gray');
      paintPatch(insetCanvas(it, 'e0'), e0, n, 'signed', range);
      paintPatch(insetCanvas(it, 'e1'), e1, n, 'signed', range);
      const cv = insetCanvas(it, 'path'), c = cv.getContext('2d'), m = cv.width / 2;
      c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height);
      c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 1;
      for (let g = m % zoom; g < cv.width; g += zoom) {
        c.beginPath(); c.moveTo(g, 0); c.lineTo(g, cv.height); c.moveTo(0, g); c.lineTo(cv.width, g); c.stroke();
      }
      c.strokeStyle = c.fillStyle = '#fbbf24'; c.lineWidth = 1.5;
      c.beginPath();
      r.iterates.forEach(([x, y], k) => (k ? c.lineTo(m + x * zoom, m + y * zoom) : c.moveTo(m + x * zoom, m + y * zoom)));
      c.stroke();
      r.iterates.forEach(([x, y]) => { c.beginPath(); c.arc(m + x * zoom, m + y * zoom, 2.5, 0, Math.PI * 2); c.fill(); });
    },
  };
}

function replenishData(tr, F, spec) {
  if (!tr) return null;
  const lag = spec.lag ?? 12;
  const now = tr.frames[F].filter((p) => p.status !== 'lost');
  const alive = new Set(now.map((p) => p.id));
  const lost = [], born = [];
  for (let f = Math.max(0, F - lag + 1); f <= F; f++) {
    for (const p of tr.frames[f]) (p.status === 'lost' ? lost : p.status === 'new' ? born : []).push(p);
  }
  const fresh = now.filter((p) => born.some((b) => b.id === p.id)); // detected in the window, still alive
  return { lag, lost, detected: born.length, relost: born.length - fresh.length, fresh, count: now.length };
}

/** Resolve { auto: 'corner'|'edge'|'flat', region? } once, inside the visible area. */
async function autoAnchor(it, stage, getSafeRect) {
  const kind = it.spec.at?.auto;
  if (!kind) return;
  const an = analyse(stage);
  if (!an) return;
  const s = getSafeRect();
  const half = it.spec.win ?? 7;
  const m = half + 6; // keep the window inside the visible area
  const [rx0, ry0, rx1, ry1] = it.spec.at.region ?? [0, 0, an.w, an.h];
  const box = [Math.max(s.x0 + m, rx0 + m), Math.max(s.y0 + m, ry0 + m), Math.min(s.x1 - m, rx1 - m), Math.min(s.y1 - m, ry1 - m)];
  const best = findExamples(an.gray, an.w, an.h, half, TAU, 5, box)[kind];
  if (best) it.data.auto = { x: best.x, y: best.y };
}
