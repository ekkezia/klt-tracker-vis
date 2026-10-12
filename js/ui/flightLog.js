// Flight log: mission guidance in the HUD panel under the chapter header.
// It shows only the current chapter's brief (`chapter.failure`: the problem as a
// question, and one sentence on what the chapter establishes); earlier briefs
// are not kept, so there is never more than one problem on screen.
//   - On a chapter's opening step the panel expands to show the brief.
//   - When a character starts talking, it collapses to the header strip.
//   - The toggle (or L) opens and closes it by hand.

import { inline } from '../lib/markup.js';

export function createFlightLog(panel, state, steps) {
  const list = panel.querySelector('#flightlog');
  const toggle = panel.querySelector('#flightlog-toggle');
  const hint = panel.querySelector('#flightlog-hint');
  let open = false;

  function setOpen(next) {
    open = next;
    panel.dataset.state = open ? 'expanded' : 'collapsed';
    toggle.setAttribute('aria-expanded', String(open));
  }

  function entryHtml(chapter, current) {
    const draft = chapter.status === 'outline' ? '<span class="log-entry__draft">draft</span>' : '';
    return `
      <li class="log-entry${current ? ' is-current' : ''}">
        <p class="log-entry__head"><span class="log-entry__ch">CH${chapter.index}</span>Problem${draft}</p>
        <p class="log-entry__q">${inline(chapter.failure.title)}</p>
        <p class="log-entry__body">${inline(chapter.failure.text)}</p>
      </li>`;
  }

  let shown = null;
  function render(index) {
    const cur = steps[index].chapter;
    if (cur === shown) return;
    shown = cur;
    list.innerHTML = entryHtml(cur, true);
  }

  state.subscribe((s, changed) => {
    if (!changed.includes('stepIndex') || s.stepIndex < 0) return;
    render(s.stepIndex);
    const step = s.step;
    const opening = step.type === 'intro';
    hint.hidden = !opening;
    setOpen(opening); // brief on a chapter's opening step; minimise once someone talks
  });

  toggle.addEventListener('click', () => setOpen(!open));
  setOpen(false);
  return { toggle: () => setOpen(!open) };
}
