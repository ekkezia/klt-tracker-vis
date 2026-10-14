// Shared bits for the Lab Notebook playgrounds (one per chapter).
// Each playground follows the widget contract in registry.js.

import { inline } from '../lib/markup.js';

/** Playground frame: kicker, title, one-paragraph intro (markup), then `body` HTML. */
export function shell(el, { id, title, intro, body }) {
  el.innerHTML = `
<div class="widget pg pg--${id}">
  <p class="widget__kicker">Playground</p>
  <h3>${inline(title)}</h3>
  <p class="pg__intro">${inline(intro)}</p>
  ${body}
</div>`;
  texIn(el.firstElementChild);
  return el.firstElementChild;
}

/** Render $…$ inside captions and table headers written as raw HTML in `body`. */
export function texIn(root) {
  if (!window.katex) return;
  root.querySelectorAll('figcaption, th').forEach((n) => {
    n.innerHTML = n.innerHTML.replace(/\$([^$]+)\$/g, (_, m) =>
      window.katex.renderToString(m, { throwOnError: false }));
  });
}

/** A labelled range input: <label>name <output/> <input type=range/></label>. */
export const slider = ({ key, label, min, max, step = 1, value }) => `
  <label class="pg__ctl"><span>${inline(label)} <output data-o="${key}"></output></span>
    <input type="range" data-i="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

export const check = ({ key, label, checked = false }) => `
  <label class="pg__ctl pg__ctl--check"><input type="checkbox" data-i="${key}" ${checked ? 'checked' : ''}> ${inline(label)}</label>`;

/**
 * Wire inputs: `fmt[key](value)` fills the matching <output>. Calls onChange()
 * after every input (debounced by `wait` ms for expensive playgrounds).
 * Returns get(key) → number | boolean.
 */
export function controls(root, fmt, onChange, wait = 0) {
  const inputs = [...root.querySelectorAll('[data-i]')];
  const get = (k) => {
    const i = root.querySelector(`[data-i="${k}"]`);
    return i.type === 'checkbox' ? i.checked : +i.value;
  };
  const show = () => inputs.forEach((i) => {
    const o = root.querySelector(`[data-o="${i.dataset.i}"]`);
    if (o && fmt[i.dataset.i]) o.textContent = fmt[i.dataset.i](get(i.dataset.i));
  });
  let t = 0;
  inputs.forEach((i) => i.addEventListener('input', () => {
    show();
    clearTimeout(t);
    if (wait) t = setTimeout(onChange, wait); else onChange();
  }));
  // Keys typed into a playground must not drive the story (Space, arrows, N…).
  root.addEventListener('keydown', (e) => e.stopPropagation());
  show();
  return get;
}

/** Size a canvas for crisp drawing at devicePixelRatio; returns its 2D context in CSS px. */
export function crisp(canvas, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.aspectRatio = `${w} / ${h}`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Theme colours for drawing inside the (paper-coloured) notebook. */
export function palette(el) {
  const cs = getComputedStyle(el);
  const v = (n, d) => cs.getPropertyValue(n).trim() || d;
  return { ink: v('--ink', '#222'), muted: v('--muted', '#888'), rule: v('--rule', '#ddd'), paper: v('--paper', '#fff'),
    blue: '#0e7490', green: '#15803d', orange: '#c2410c', red: '#b91c1c', amber: '#b45309' };
}

/** Grey patch (row-major, n×n, values 0..1) into a canvas, nearest-neighbour scaled. */
export function drawGray(canvas, vals, n, signed = false, range = 1) {
  const c = canvas.getContext('2d');
  const img = c.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    let r, g, b;
    if (signed) { // blue - white - red
      const t = Math.max(-1, Math.min(1, vals[i] / range));
      const end = t < 0 ? [59, 76, 192] : [180, 4, 38];
      [r, g, b] = end.map((e) => 245 + (e - 245) * Math.abs(t));
    } else r = g = b = Math.max(0, Math.min(255, vals[i] * 255));
    img.data.set([r, g, b, 255], i * 4);
  }
  const tmp = Object.assign(document.createElement('canvas'), { width: n, height: n });
  tmp.getContext('2d').putImageData(img, 0, 0);
  c.imageSmoothingEnabled = false;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

export const fmt2 = (v) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(1) : v.toFixed(2));
