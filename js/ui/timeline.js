// Bottom timeline: a rail through every step of the story, with a checkpoint
// (dot + symbol + label) at the start of each chapter. The coral fill shows
// progress; the ring is the current step.
//
// Interaction
//   drag / click on the rail   scrub; a tooltip previews the topic, release jumps there
//   wheel / trackpad over it   one step per notch
//   click a checkpoint         jump to that chapter
//   keyboard (rail focused)    ←/→ step, PageUp/PageDown chapter, Home/End

import { icons } from './icons.js';

const WHEEL_STEP = 60;    // accumulated wheel delta per step
const WHEEL_GAP_MS = 180; // minimum time between wheel steps

export function createTimeline(root, { steps, chapters, state, onSeek }) {
  const last = steps.length - 1;
  const pos = (i) => (i / last) * 100;
  const chapterStart = chapters.map((c) => steps.findIndex((s) => s.type === 'intro' && s.chapter === c));

  // Subtopics: a small tick where a chapter's topic changes, numbered within the chapter ("4: Replenish").
  const subs = [], subOf = new Array(steps.length).fill(null);
  for (const c of chapters) {
    let n = 0, prev = c.title;
    steps.forEach((s, i) => {
      if (s.chapter !== c || s.type !== 'line') return;
      if (s.topic !== prev) { n++; prev = s.topic; subs.push({ i, n, topic: s.topic }); }
      subOf[i] = n ? { n, topic: prev } : null;
    });
  }
  const tipText = (i) => { const sb = subOf[i], ch = steps[i].chapter; return sb ? `Ch ${ch.index} · ${sb.n}: ${sb.topic}` : `Ch ${ch.index} · ${ch.title}`; };

  root.innerHTML = `
    <div class="timeline__checkpoints">
      ${subs.map((sb) => `<span class="tl-tick" style="--x:${pos(sb.i)}%" aria-hidden="true"></span>`).join('')}
      ${chapters.map((c, k) => `
        <button type="button" class="cp${pos(chapterStart[k]) > 96 ? ' cp--flip' : ''}" data-ch="${c.index}" style="--x:${pos(chapterStart[k])}%"
          aria-label="Chapter ${c.index}: ${c.title} (${c.place})">
          <span class="cp__icon">${icons[c.icon] ?? ''}</span>
          <span class="cp__label">${c.short}</span>
          <span class="cp__stem" aria-hidden="true"></span>
        </button>
        <span class="cp__dot" style="--x:${pos(chapterStart[k])}%" aria-hidden="true"></span>
        <span class="cp__num" style="--x:${pos(chapterStart[k])}%" aria-hidden="true">${String(c.index).padStart(2, '0')}</span>`).join('')}
    </div>
    <div class="timeline__slider" role="slider" tabindex="0" aria-label="Story timeline"
         aria-valuemin="0" aria-valuemax="${last}" aria-valuenow="0">
      <span class="timeline__rail"></span>
      <span class="timeline__fill"></span>
      <span class="timeline__handle" aria-hidden="true"></span>
    </div>
    <p class="timeline__tip" hidden></p>`;

  const slider = root.querySelector('.timeline__slider');
  const fill = root.querySelector('.timeline__fill');
  const handle = root.querySelector('.timeline__handle');
  const tip = root.querySelector('.timeline__tip');
  const cps = [...root.querySelectorAll('.cp')];
  const dots = [...root.querySelectorAll('.cp__dot')];
  const ticks = [...root.querySelectorAll('.tl-tick')];
  let current = 0;

  function render(i, preview = false) {
    fill.style.width = `${pos(i)}%`;
    handle.style.left = `${pos(i)}%`;
    const ch = steps[i].chapter.index;
    cps.forEach((b, k) => {
      b.classList.toggle('is-current', k === ch);
      b.classList.toggle('is-past', chapterStart[k] <= i);
    });
    dots.forEach((d, k) => {
      d.classList.toggle('is-current', k === ch);
      d.classList.toggle('is-past', chapterStart[k] <= i);
    });
    ticks.forEach((t, k) => t.classList.toggle('is-past', subs[k].i <= i));
    root.classList.toggle('is-previewing', preview);
  }

  function valueText(i) {
    const s = steps[i];
    return `Chapter ${s.chapter.index}, ${s.chapter.place}: ${subOf[i] ? `${subOf[i].n}: ` : ''}${s.topic}`;
  }

  // --- state → view ----------------------------------------------------------
  state.subscribe((s, changed) => {
    if (!changed.includes('stepIndex') || s.stepIndex < 0) return;
    current = s.stepIndex;
    render(current);
    slider.setAttribute('aria-valuenow', String(current));
    slider.setAttribute('aria-valuetext', valueText(current));
  });

  // --- drag / click to scrub ---------------------------------------------------
  const indexAt = (clientX) => {
    const r = slider.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(t * last);
  };
  let dragging = null;
  function showTip(i, clientX) {
    const r = root.getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = tipText(i);
    const x = Math.min(r.width - tip.offsetWidth / 2 - 8, Math.max(tip.offsetWidth / 2 + 8, clientX - r.left));
    tip.style.left = `${x}px`;
  }
  slider.addEventListener('pointerdown', (e) => {
    slider.setPointerCapture(e.pointerId);
    dragging = indexAt(e.clientX);
    render(dragging, true);
    showTip(dragging, e.clientX);
  });
  slider.addEventListener('pointermove', (e) => {
    const i = indexAt(e.clientX);
    if (dragging != null) { dragging = i; render(i, true); }
    showTip(i, e.clientX);
  });
  slider.addEventListener('pointerleave', () => { if (dragging == null) tip.hidden = true; });
  const release = () => {
    if (dragging == null) return;
    const i = dragging;
    dragging = null;
    tip.hidden = true;
    if (i !== current) onSeek(i); else render(current);
  };
  slider.addEventListener('pointerup', release);
  slider.addEventListener('pointercancel', () => { dragging = null; tip.hidden = true; render(current); });

  // --- checkpoints ---------------------------------------------------------------
  cps.forEach((b, k) => b.addEventListener('click', () => onSeek(chapterStart[k])));

  // --- wheel / trackpad --------------------------------------------------------
  let acc = 0, lastWheel = 0;
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const now = performance.now();
    if (Math.abs(acc) < WHEEL_STEP || now - lastWheel < WHEEL_GAP_MS) return;
    const dir = Math.sign(acc);
    acc = 0;
    lastWheel = now;
    const i = Math.min(last, Math.max(0, current + dir));
    if (i !== current) onSeek(i);
  }, { passive: false });

  // --- keyboard ------------------------------------------------------------------
  slider.addEventListener('keydown', (e) => {
    const chNow = steps[current].chapter.index;
    const map = {
      ArrowRight: current + 1, ArrowUp: current + 1, ArrowLeft: current - 1, ArrowDown: current - 1,
      PageDown: chapterStart[chNow + 1] ?? last, PageUp: chapterStart[Math.max(0, chNow - (steps[current].type === 'intro' ? 1 : 0))],
      Home: 0, End: last,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    e.stopPropagation();
    const i = Math.min(last, Math.max(0, map[e.key]));
    if (i !== current) onSeek(i);
  });

  render(0);
}
