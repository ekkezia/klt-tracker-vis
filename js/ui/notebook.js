// Lab Notebook drawer with two tabs:
//   "This chapter"  the current chapter's sections (story + math) and its widget
//   "Full article"  every chapter's notes as one linear academic write-up
//                   (js/data/article.js), with numbered sections and contents

import { render, inline } from '../lib/markup.js';
import { getWidget } from '../widgets/registry.js';
import { article } from '../data/article.js';

/**
 * Inside the Full article, story chapter k is article section k+1. Rewrite
 * "Chapter 2", "Ch 3", "Ch 3–4" as section references.
 */
export function chaptersToSections(md) {
  return md
    .replace(/\bCh(?:apters?)? ?(\d)\s*[–-]\s*(\d)\b/g, (_, a, b) => `Sections ${+a + 1}–${+b + 1}`)
    .replace(/\bChapter (\d)\b/g, (_, a) => `Section ${+a + 1}`)
    .replace(/\bCh (\d)\b/g, (_, a) => `Section ${+a + 1}`)
    .replace(/\bthe next chapter\b/g, 'the next section');
}

export function createNotebook(root, state, api, { chapters, references, onGoToChapter, onGoToRef }) {
  const title = root.querySelector('[data-nb="title"]');
  const kicker = root.querySelector('[data-nb="kicker"]');
  const body = root.querySelector('[data-nb="body"]');
  const widgetHost = root.querySelector('[data-nb="widget"]');
  const articleHost = root.querySelector('[data-nb="article"]');
  const scroller = root.querySelector('.notebook__scroll');
  const closeBtn = root.querySelector('[data-nb="close"]');
  const tabs = [...root.querySelectorAll('[data-tab]')];
  let renderedFor = null;
  let unmount = null;
  let returnFocus = null;
  let tab = 'chapter';
  let articleBuilt = false;

  function fill(chapter) {
    if (renderedFor === chapter.id) return;
    renderedFor = chapter.id;
    if (tab === 'chapter') setHeader(chapter);
    body.innerHTML = chapter.notebook.map((sec) => `
      <section class="nb-section ${sec.level === 'math' ? 'is-math' : ''}">
        <h3>${sec.title}${sec.level === 'math' ? ' <span class="tag">math</span>' : ''}</h3>
        ${render(sec.body)}
      </section>`).join('');
    unmount?.();
    widgetHost.innerHTML = '';
    unmount = getWidget(chapter.widget)(widgetHost, { ...api, chapter }) ?? null;
  }

  function setHeader(chapter) {
    if (tab === 'article') {
      kicker.textContent = 'Lab Notebook · Full article';
      title.textContent = article.title;
    } else {
      kicker.textContent = `Lab Notebook · Chapter ${chapter.index} · ${chapter.place}`;
      title.textContent = chapter.title;
    }
  }

  // --- the linear article --------------------------------------------------------
  function buildArticle() {
    if (articleBuilt) return;
    articleBuilt = true;
    const byId = Object.fromEntries(chapters.map((c) => [c.id, c]));
    const toc = article.sections.map((sec, i) => `
      <li><a href="#art-${i + 1}" data-jump="art-${i + 1}">${i + 1}. ${sec.heading}</a></li>`).join('');
    const sections = article.sections.map((sec, i) => {
      const parts = sec.parts.map(([id, t], j) => {
        const ch = byId[id];
        const n = ch?.notebook.find((x) => x.title === t);
        if (!n) return '';
        const outline = /^outline:|\(outline\)|\(placeholder\)/i.test(t);
        const clean = t.replace(/^Outline:\s*/i, '').replace(/\s*\((outline|placeholder)\)$/i, '');
        return `
          <section class="art-sub" id="art-${i + 1}-${j + 1}">
            <h4><span class="art-num">${i + 1}.${j + 1}</span> ${clean}${outline ? ' <span class="tag tag--muted">draft</span>' : ''}</h4>
            ${render(chaptersToSections(n.body))}
            <button type="button" class="art-see" data-chapter="${ch.index}" data-ref="${ch.id}|${t}">See it in Chapter ${ch.index}: ${ch.place} →</button>
          </section>`;
      }).join('');
      return `<section class="art-sec" id="art-${i + 1}"><h3><span class="art-num">${i + 1}</span> ${sec.heading}</h3>${parts}</section>`;
    }).join('');
    const refs = references.map((r) => `<li>${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${r.label}</a>` : `<cite>${r.label}</cite>`}. ${r.source}.</li>`).join('');
    articleHost.innerHTML = `
      <header class="art-head">
        <p class="art-subtitle">${article.subtitle}</p>
        <p class="art-abstract"><strong>Abstract.</strong> ${inline(article.abstract)}</p>
        <nav class="art-toc" aria-label="Contents"><p class="kicker">Contents</p><ol>${toc}
          <li><a href="#art-refs" data-jump="art-refs">References</a></li></ol></nav>
      </header>
      ${sections}
      <section class="art-sec" id="art-refs"><h3>References</h3><ol class="refs">${refs}</ol></section>`;
  }

  articleHost.addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); articleHost.querySelector(`#${j.dataset.jump}`)?.scrollIntoView({ block: 'start' }); return; }
    const see = e.target.closest('[data-chapter]');
    if (see) { close(); if (!onGoToRef?.(see.dataset.ref)) onGoToChapter(+see.dataset.chapter); }
  });

  function setTab(next) {
    tab = next;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    root.classList.toggle('notebook--article', tab === 'article');
    body.hidden = widgetHost.hidden = tab !== 'chapter';
    articleHost.hidden = tab !== 'article';
    if (tab === 'article') buildArticle();
    const ch = state.get().chapter;
    if (ch) setHeader(ch);
    scroller.scrollTop = 0;
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  root.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.dataset.tab === tab);
    const nxt = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setTab(nxt.dataset.tab); nxt.focus();
  });

  function open(which = null) {
    const s = state.get();
    if (!s.chapter) return;
    returnFocus = document.activeElement;
    fill(s.chapter);
    if (which) setTab(which); else setHeader(s.chapter);
    root.hidden = false;
    document.body.classList.add('notebook-open');
    state.set({ notebookOpen: true });
    closeBtn.focus();
  }

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    document.body.classList.remove('notebook-open');
    state.set({ notebookOpen: false });
    returnFocus?.focus?.();
  }

  closeBtn.addEventListener('click', close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });

  // Keep contents in sync if the reader moves to another chapter while open.
  state.subscribe((s, changed) => {
    if (changed.includes('chapter') && !root.hidden) fill(s.chapter);
  });

  /** Open the Full article scrolled to subsection "i.j". */
  function openAt(num) {
    open('article');
    articleHost.querySelector(`#art-${num.replace('.', '-')}`)?.scrollIntoView({ block: 'start' });
  }

  return { open, openAt, close, toggle: () => (root.hidden ? open() : close()) };
}
