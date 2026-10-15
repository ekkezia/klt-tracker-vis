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

/**
 * Turn bracketed citations in the article text, e.g. "(Shi & Tomasi, 1994)", "(Lucas & Kanade 1981; Tomasi & Kanade 1991)",
 * "Harris and Stephens (1988)", into links to their entry in References. A citation matches a reference when its year
 * and an author surname both appear in the reference's `source`; anything that matches nothing stays plain text.
 */
function linkCitations(root, references) {
  const names = (s) => (s.match(/\b[A-Z][a-zà-ÿ'’]+(?:-[A-Z][a-zà-ÿ'’]+)?\b/g) ?? []).filter((w) => !['Part', 'Automatic', 'Learning'].includes(w));
  const years = (s) => s.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  const index = references.map((r, i) => ({ n: i + 1, names: names(r.source), years: years(r.source) }));
  const find = (text, context = '') => {
    const ys = years(text), ns = names(text).concat(names(context));
    let best = null;
    for (const r of index) {
      if (!ys.some((y) => r.years.includes(y))) continue;
      const hits = ns.filter((n) => r.names.includes(n)).length;
      if (hits && (!best || hits > best.hits)) best = { n: r.n, hits };
    }
    return best?.n ?? null;
  };
  const link = (n, text) => `<a class="cite" href="#ref-${n}" data-ref="${n}" title="Go to reference ${n}">${text}</a>`;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => (t.parentElement.closest('.katex, code, a, .nb-reflist, .nb-chapter__head, h4, button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (/\((?:[^()]*?\b)?(?:19|20)\d{2}/.test(t.data)) nodes.push(t);
  for (const t of nodes) {
    let changed = false;
    // Escape for HTML only at the end: "&amp;" would otherwise look like a ";" separator between citations.
    const html = t.data.replace(/[&<>]/g, (c) => ({ '&': '\u0001', '<': '\u0002', '>': '\u0003' }[c]))
      .replace(/\(([^()]*?\b(?:19|20)\d{2}[^()]*?)\)/g, (whole, inner, at, str) => {
        const parts = inner.split(/;\s*/).map((part) => {
          const before = /^\s*(?:19|20)\d{2}\s*$/.test(part) ? str.slice(Math.max(0, at - 60), at) : ''; // "Shi and Tomasi (1994)"
          const n = find(part, before);
          if (n) changed = true;
          return n ? link(n, part) : part;
        });
        return `(${parts.join('; ')})`;
      })
      .replace(/\u0001/g, '&amp;').replace(/\u0002/g, '&lt;').replace(/\u0003/g, '&gt;');
    if (!changed) continue;
    const span = document.createElement('span');
    span.innerHTML = html;
    t.replaceWith(...span.childNodes);
  }
}

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function createNotebook(root, state, api, { chapters, references = [], onGoToChapter, onGoToRef }) {
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
    nav.innerHTML = chapters.map((c) => `<button type="button" data-go="${c.id}" title="${attr(c.title)}"><b>${c.index}</b> ${c.short}</button>`).join('')
      + '<button type="button" data-go="refs" title="References">References</button>';
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
      </section>`).join('') + `
      <section class="nb-chapter nb-refs" data-ch="refs">
        <header class="nb-chapter__head"><div><p class="kicker">Sources</p><h3>References</h3></div></header>
        <a class="gh-inline" href="https://github.com/ekkezia/klt-tracker-vis" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg> Source code on GitHub</a>
        <ol class="nb-reflist">${references.map((r, i) => `
          <li id="ref-${i + 1}">${r.url ? `<a href="${attr(r.url)}" target="_blank" rel="noopener">${r.label}</a>` : `<cite>${r.label}</cite>`}
            <span class="ref-source">${r.source}</span></li>`).join('')}</ol>
      </section>`;
    linkCitations(body, references);
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
      const here = el.querySelector('.nb-here');
      if (here) here.hidden = el.dataset.ch !== cur;
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
    const cite = e.target.closest('a.cite');
    if (cite) { // in-text citation -> its entry in References, flashed
      e.preventDefault();
      const li = body.querySelector(`#ref-${cite.dataset.ref}`);
      if (li) { li.scrollIntoView({ block: 'center' }); li.classList.remove('is-target'); void li.offsetWidth; li.classList.add('is-target'); spyNow(); }
      return;
    }
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
