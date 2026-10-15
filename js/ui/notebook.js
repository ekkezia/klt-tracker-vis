// Article drawer (the Lab Notebook): every chapter's notes in one scroll. Each chapter has a
// sticky header, so the reader always knows which chapter they are in. Opening
// the notebook scrolls to the chapter the story is at (or to the section a
// dialogue line points at). Chapter playgrounds mount lazily, as they scroll in.

import { render } from '../lib/markup.js';
import { getWidget } from '../widgets/registry.js';
import { prefersReducedMotion } from '../config.js';

/** "i.j" for each notebook section: chapter index . position in the chapter, keyed `${chapterId}|${title}`. */
export const sectionNumbers = (chapters) => new Map(chapters.flatMap((c) =>
  c.notebook.map((s, j) => [`${c.id}|${s.title}`, `${c.index}.${j + 1}`])));

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function createNotebook(root, state, api, { chapters, onGoToChapter, onGoToRef }) {
  const body = root.querySelector('[data-nb="body"]');
  const nav = root.querySelector('[data-nb="nav"]');
  const scroller = root.querySelector('.notebook__scroll');
  const closeBtn = root.querySelector('[data-nb="close"]');
  const maxBtn = root.querySelector('[data-nb="max"]');
  let built = false;
  let returnFocus = null;
  const mounted = new Set();

  const chapterEl = (id) => body.querySelector(`.nb-chapter[data-ch="${id}"]`);

  function build() {
    if (built) return;
    built = true;
    nav.innerHTML = chapters.map((c) => `<button type="button" data-go="${c.id}" title="${attr(c.title)}"><b>${c.index}</b> ${c.short}</button>`).join('');
    body.innerHTML = chapters.map((c) => `
      <section class="nb-chapter" data-ch="${c.id}">
        <header class="nb-chapter__head">
          <div>
            <p class="kicker">Chapter ${c.index} · ${c.place}</p>
            <h3>${c.title}</h3>
          </div>
          <span class="nb-here" hidden>● you are here</span>
          <button type="button" class="nb-play" data-play="${c.index}">▶ In the story</button>
        </header>
        <div class="notebook__widget" data-widgets></div>
        ${c.notebook.map((sec, j) => `
          <section class="nb-section ${sec.level === 'math' ? 'is-math' : ''}" data-sec="${attr(sec.title)}">
            <h4><span class="nb-num">${c.index}.${j + 1}</span> ${sec.title}${sec.level === 'math' ? ' <span class="tag">math</span>' : ''}</h4>
            ${render(sec.body)}
            <button type="button" class="nb-see" data-see="${attr(`${c.id}|${sec.title}`)}" data-play="${c.index}">▶ See this in the story</button>
          </section>`).join('')}
      </section>`).join('');
    markHere();
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { mountWidgets(e.target.closest('.nb-chapter').dataset.ch); io.unobserve(e.target); }
      }), { root: scroller, rootMargin: '300px' });
      body.querySelectorAll('[data-widgets]').forEach((el) => io.observe(el));
    } else chapters.forEach((c) => mountWidgets(c.id));
  }

  /** A chapter may have several playgrounds (`widget` can be an array). */
  function mountWidgets(id) {
    if (mounted.has(id)) return;
    mounted.add(id);
    const chapter = chapters.find((c) => c.id === id);
    const host = chapterEl(id).querySelector('[data-widgets]');
    for (const wid of [].concat(chapter.widget ?? [])) {
      const slot = host.appendChild(document.createElement('div'));
      slot.className = 'notebook__playground';
      try { getWidget(wid)(slot, { ...api, chapter }); } catch (err) { console.warn(`widget ${wid}`, err); }
    }
  }

  function markHere() {
    const cur = state.get().chapter?.id;
    body.querySelectorAll('.nb-chapter').forEach((el) => {
      el.classList.toggle('is-here', el.dataset.ch === cur);
      el.querySelector('.nb-here').hidden = el.dataset.ch !== cur;
    });
  }

  // Which chapter is at the top of the scroll: highlight it in the chapter strip.
  let spy = 0;
  function spyNow() {
    spy = 0;
    const top = scroller.getBoundingClientRect().top + 90;
    let at = chapters[0].id;
    for (const el of body.querySelectorAll('.nb-chapter')) if (el.getBoundingClientRect().top <= top) at = el.dataset.ch;
    nav.querySelectorAll('[data-go]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.go === at);
      if (b.dataset.go === at) b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }
  scroller.addEventListener('scroll', () => { if (!spy) spy = requestAnimationFrame(spyNow); });

  function scrollToChapter(id) {
    chapterEl(id)?.scrollIntoView({ block: 'start' });
    spyNow();
  }

  function open(target = null) {
    clearTimeout(closeTimer);
    root.classList.remove('is-closing');
    returnFocus = document.activeElement;
    build();
    markHere();
    root.hidden = false;
    document.body.classList.add('notebook-open');
    state.set({ notebookOpen: true });
    closeBtn.focus();
    const here = state.get().chapter?.id ?? chapters[0].id;
    mountWidgets(here); // first, so the chapter's playground is in place before we scroll to it
    if (!target) scrollToChapter(here);
    return true;
  }

  let closeTimer = 0;
  function close() {
    if (root.hidden || root.classList.contains('is-closing')) return;
    document.body.classList.remove('notebook-open');
    state.set({ notebookOpen: false });
    returnFocus?.focus?.();
    // Slide back out to the right, then hide.
    if (prefersReducedMotion()) { root.hidden = true; return; }
    root.classList.add('is-closing');
    closeTimer = setTimeout(() => { root.hidden = true; root.classList.remove('is-closing'); }, 360);
  }

  closeBtn.addEventListener('click', close);
  maxBtn.addEventListener('click', () => {
    const on = root.classList.toggle('notebook--max');
    maxBtn.textContent = on ? '⤡' : '⤢';
    maxBtn.title = on ? 'Back to side panel' : 'Maximise';
    maxBtn.setAttribute('aria-pressed', String(on));
    maxBtn.setAttribute('aria-label', on ? 'Restore the side panel' : 'Maximise the article');
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });

  root.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { scrollToChapter(go.dataset.go); return; }
    const see = e.target.closest('[data-see]');
    if (see) { close(); if (!onGoToRef?.(see.dataset.see)) onGoToChapter(+see.dataset.play); return; }
    const play = e.target.closest('.nb-play');
    if (play) { close(); onGoToChapter(+play.dataset.play); }
  });

  state.subscribe((s, changed) => { if (changed.includes('chapter') && built) markHere(); });

  /** Open scrolled to the section titled `secTitle` (default: in the chapter the story is at), briefly highlighted. */
  function openSection(secTitle, chapterId = state.get().chapter?.id) {
    open(secTitle);
    mountWidgets(chapterId);
    const sec = [...(chapterEl(chapterId) ?? body).querySelectorAll('[data-sec]')].find((el) => el.dataset.sec === secTitle);
    if (!sec) { scrollToChapter(chapterId); return; }
    sec.scrollIntoView({ block: 'start' });
    sec.classList.remove('is-target');
    void sec.offsetWidth;
    sec.classList.add('is-target');
    spyNow();
  }

  return { open, openSection, close, toggle: () => (root.hidden || root.classList.contains('is-closing') ? open() : close()) };
}
