// Full-screen robot-POV stage: <video> (object-fit: cover) + a canvas overlay
// that uses the same cover transform, so everything is drawn in the footage's
// native pixel grid (STAGE) and lands exactly on the video pixels.
//
// Playback model (see chapterEngine): playSegment(from, to) plays forward once
// and pauses on `to`; hold(frame) shows one frame; playRange loops (used only
// behind the start screen). Each returns a promise that resolves once the
// footage has come to rest; a newer command resolves older promises early.

import { STAGE, OVERLAY, prefersReducedMotion } from '../config.js';
import { loadTracks } from './tracks.js';
import { renderScene } from './scenes.js';

export function createStage(root, state, clips) {
  const video = root.querySelector('video');
  const canvas = root.querySelector('canvas.overlay');
  const ctx = canvas.getContext('2d');

  const grab = document.createElement('canvas');
  grab.width = STAGE.width;
  grab.height = STAGE.height;
  const grabCtx = grab.getContext('2d', { willReadFrequently: true });

  let clipId = null, tracks = null, fps = 24;
  let mode = { kind: 'hold', frame: 0 };   // or { kind: 'loop', start, end }
  let shown = -1;                          // frame currently presented
  let seeking = false, pendingSeek = null;
  let sceneId = null, sceneRange = [0, 1];
  let busy = null;                         // promise while grabFramesAt runs
  let xf = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  const drawHooks = new Set();
  const underHooks = new Set();             // drawn beneath the track dots (heat maps)
  let focusFn = null;                      // () => Set of track ids to keep bright, or null
  let holdWaiters = [];
  const frameListeners = new Set();

  // --- colours from CSS ------------------------------------------------------
  const readColors = () => {
    const cs = getComputedStyle(root);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      accent: v('--overlay-accent'), fresh: v('--overlay-new'), lost: v('--overlay-lost'),
      hairline: v('--overlay-hairline'), label: v('--overlay-label'), halo: v('--overlay-halo'),
      focus: v('--overlay-focus'),
    };
  };
  let palette = readColors();

  // --- cover transform ---------------------------------------------------------
  function layout() {
    const w = root.clientWidth, h = root.clientHeight, dpr = window.devicePixelRatio || 1;
    const scale = Math.max(w / STAGE.width, h / STAGE.height);
    xf = { scale, ox: (w - STAGE.width * scale) / 2, oy: (h - STAGE.height * scale) / 2, dpr, w, h };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    draw();
  }
  new ResizeObserver(layout).observe(root);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { palette = readColors(); draw(); });

  const toScreen = (x, y) => [xf.ox + x * xf.scale, xf.oy + y * xf.scale];
  const toNative = (sx, sy) => [(sx - xf.ox) / xf.scale, (sy - xf.oy) / xf.scale];

  // --- clip + playback -----------------------------------------------------------
  async function setClip(id) {
    if (id === clipId) return;
    const def = clips[id];
    if (!def) throw new Error(`Unknown clip "${id}"`);
    clipId = id;
    tracks = null;
    shown = -1;
    video.src = def.src;
    const t = await loadTracks(def.tracks).catch((e) => { console.error(e); return null; });
    if (clipId !== id) return;
    tracks = t;
    fps = def.fps ?? t?.fps ?? 24;
    apply();
  }

  function settleWaiters() {
    const w = holdWaiters; holdWaiters = [];
    w.forEach((res) => res());
  }

  function playRange(start, end) {
    if (prefersReducedMotion()) return hold(Math.round((start + end) / 2));
    settleWaiters();
    mode = { kind: 'loop', start, end };
    apply();
    return Promise.resolve();
  }

  /** Play forward from `from` to `to` once, then pause there. */
  function playSegment(from, to) {
    if (prefersReducedMotion() || to <= from) return hold(to);
    settleWaiters();
    mode = { kind: 'segment', from: Math.round(from), to: Math.round(to) };
    const p = new Promise((res) => holdWaiters.push(res));
    apply();
    return p;
  }

  /** Freeze on a frame. Resolves once that frame is on screen. */
  function hold(frame) {
    settleWaiters();
    mode = { kind: 'hold', frame: Math.round(frame) };
    const p = new Promise((res) => holdWaiters.push(res));
    apply();
    return p;
  }

  function arrive(frame) {
    video.pause();
    mode = { kind: 'hold', frame };
    seekTo(frame); // lands exactly on `frame`; present() then settles waiters
  }

  function apply() {
    if (busy || video.readyState < 1) return; // loadedmetadata / grab completion re-applies
    if (mode.kind === 'hold') {
      video.pause();
      seekTo(mode.frame);
    } else if (mode.kind === 'segment') {
      if (shown < mode.from || shown >= mode.to || video.seeking) seekTo(mode.from); // else carry on from where it is
      video.play().catch(() => arrive(mode.to)); // can't play: jump to the destination
      tick();
    } else {
      if (shown < mode.start || shown > mode.end) seekTo(mode.start);
      video.play().catch(() => { /* autoplay blocked until a gesture; start screen provides one */ });
      tick();
    }
  }

  function seekTo(frame) {
    if (seeking) { pendingSeek = frame; return; }
    if (frame === shown && !video.seeking) { present(); return; }
    seeking = true;
    video.currentTime = (frame + 0.5) / fps;
  }

  video.addEventListener('loadedmetadata', apply);
  video.addEventListener('seeked', () => {
    seeking = false;
    shown = Math.floor(video.currentTime * fps + 1e-4);
    if (pendingSeek != null) { const f = pendingSeek; pendingSeek = null; seekTo(f); return; }
    present();
  });
  video.addEventListener('error', () => { root.classList.add('stage--no-video'); draw(); });

  // Per-frame callback while playing (requestVideoFrameCallback, rAF fallback).
  let ticking = false;
  function tick() {
    if (ticking) return;
    ticking = true;
    const step = (_, meta) => {
      if (mode.kind === 'hold' || video.paused || busy) { ticking = false; return; }
      const f = meta ? Math.round(meta.mediaTime * fps) : Math.floor(video.currentTime * fps + 1e-4);
      if (mode.kind === 'segment' && f >= mode.to) { ticking = false; arrive(mode.to); return; }
      if (f !== shown) { shown = f; present(); }
      if (mode.kind === 'loop' && f >= mode.end) video.currentTime = (mode.start + 0.5) / fps;
      schedule(step);
    };
    const schedule = (fn) => ('requestVideoFrameCallback' in video
      ? video.requestVideoFrameCallback(fn) : requestAnimationFrame(() => fn(0, null)));
    schedule(step);
  }

  function present() {
    draw();
    frameListeners.forEach((fn) => fn(shown));
    if (mode.kind === 'hold' && shown === mode.frame && holdWaiters.length) {
      const w = holdWaiters; holdWaiters = [];
      w.forEach((res) => res());
    }
  }

  function setScene(id, range) {
    sceneId = id;
    sceneRange = range;
  }

  // --- drawing ---------------------------------------------------------------
  function draw() {
    const { dpr, scale, ox, oy } = xf;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const frame = Math.max(0, shown);
    const points = tracks?.frames[frame] ?? [];
    if (tracks) {
      const sx = STAGE.width / tracks.width, sy = STAGE.height / tracks.height;
      ctx.setTransform(dpr * scale * sx, 0, 0, dpr * scale * sy, dpr * ox, dpr * oy);
      const px = 1 / (scale * sx); // one screen pixel, in track units
      const info = {
        frame, points, tracks, width: tracks.width, height: tracks.height, colors: palette, px,
      };
      underHooks.forEach((fn) => fn(ctx, info));
      const keep = focusFn?.() ?? null;
      drawTrails(points, frame, px, keep);
      drawPoints(points, px, keep);
      const [a, b] = sceneRange;
      renderScene(sceneId, (frame - a) / Math.max(1, b - a), ctx, info);
      drawHooks.forEach((fn) => fn(ctx, info));
    }
    state.set({ frame, trackFrame: points });
  }

  // `keep`: optional Set of ids; every other track is dimmed (focus mode).
  function drawTrails(points, frame, px, keep) {
    ctx.strokeStyle = palette.hairline;
    ctx.lineWidth = 1.25 * px;
    for (const p of points) {
      if (p.status === 'lost') continue;
      const hist = tracks.byId.get(p.id);
      ctx.globalAlpha = keep && !keep.has(p.id) ? OVERLAY.dimAlpha : 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (let k = 1; k <= OVERLAY.trailFrames; k++) {
        const q = hist.get(frame - k);
        if (!q) break;
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPoints(points, px, keep) {
    const r = OVERLAY.dotRadius * px;
    for (const p of points) {
      ctx.globalAlpha = keep && !keep.has(p.id) ? OVERLAY.dimAlpha : 1;
      if (p.status === 'lost') {
        ctx.strokeStyle = palette.lost;
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r);
        ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = palette.halo;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.5 * px, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.status === 'new' ? palette.fresh : palette.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- pixel access for widgets and annotations -------------------------------
  function grabFrame() {
    if (video.readyState < 2) return null;
    try {
      grabCtx.drawImage(video, 0, 0, STAGE.width, STAGE.height);
      return grabCtx.getImageData(0, 0, STAGE.width, STAGE.height);
    } catch (e) {
      console.warn('grabFrame failed (cross-origin video?)', e);
      return null;
    }
  }

  /** Seek to each frame in turn and grab it; then restore the playback mode. */
  function grabFramesAt(frames) {
    if (busy) return busy.then(() => grabFramesAt(frames));
    busy = (async () => {
      video.pause();
      const back = shown; // where the story was: return there afterwards, so a playing segment carries on
      const out = [];
      for (const f of frames) {
        if (!Number.isFinite(f) || !Number.isFinite(fps)) { out.push(null); continue; } // never seek to NaN: it would stall the queue
        await new Promise((res) => {
          const done = () => { video.removeEventListener('seeked', done); res(); };
          video.addEventListener('seeked', done);
          seeking = true;
          video.currentTime = (f + 0.5) / fps;
        });
        out.push(grabFrame());
      }
      if (Number.isFinite(back) && back >= 0) {
        await new Promise((res) => {
          const done = () => { video.removeEventListener('seeked', done); res(); };
          video.addEventListener('seeked', done);
          seeking = true;
          video.currentTime = (back + 0.5) / fps;
        });
      }
      return out;
    })();
    return busy.finally(() => { busy = null; apply(); });
  }

  return {
    setClip, playRange, playSegment, hold, setScene, grabFrame, grabFramesAt, redraw: draw,
    toScreen, toNative,
    onDraw(fn) { drawHooks.add(fn); return () => drawHooks.delete(fn); },
    onUnderlay(fn) { underHooks.add(fn); return () => underHooks.delete(fn); },
    setFocusProvider(fn) { focusFn = fn; },
    onFrame(fn) { frameListeners.add(fn); return () => frameListeners.delete(fn); },
    get frame() { return shown; },
    get tracks() { return tracks; },
    get transform() { return xf; },
  };
}
