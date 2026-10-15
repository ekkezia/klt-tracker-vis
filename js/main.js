import { characters, clips, chapters, references, disclaimer, standIns } from './data/chapters.js';
import { createState } from './engine/state.js';
import { buildSteps, createPlayer } from './engine/chapterEngine.js';
import { createStage } from './stage/stage.js';
import { createAnnotations } from './annotations/annotations.js';
import { createDialogue } from './ui/dialogue.js';
import { createPhoneCall } from './ui/phoneCall.js';
import { hudSummary } from './ui/hud.js';
import { icons } from './ui/icons.js';
import { ROUTE } from './data/route.js';
import { createNotebook, sectionNumbers } from './ui/notebook.js';
import { createVoice } from './ui/voice.js';
import { createTimeline } from './ui/timeline.js';
import { createSfx } from './ui/sfx.js';
import { createGreyscale } from './ui/greyscale.js';

const $ = (sel) => document.querySelector(sel);

const state = createState({
  stepIndex: -1, chapter: null, step: null,
  frame: 0, trackFrame: [], call: null, notebookOpen: false,
});

const live = $('#stage-live');
const announce = (msg) => { live.textContent = msg; };

const stageEl = $('#stage');
const stage = createStage(stageEl, state, clips);

/** Visible part of the footage (native px): below the top bar, above the dialogue box. */
function getSafeRect() {
  const top = $('.topbar').getBoundingClientRect().bottom + 8;
  const dlg = $('#dialogue');
  const bottom = (dlg.hidden ? $('#timeline') : dlg).getBoundingClientRect().top - 8;
  const [x0, y0] = stage.toNative(0, top);
  const [x1, y1] = stage.toNative(window.innerWidth, bottom);
  const t = stage.tracks;
  const W = t?.width ?? 640, H = t?.height ?? 480;
  return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(W, x1), y1: Math.min(H, y1) };
}

const greyscale = createGreyscale($('#grey-toggle'), stageEl);
const annotations = createAnnotations($('#annot-layer'), stage, {
  getSafeRect, onFocus: (specs) => greyscale.setFocus(specs),
  getWidgetApi: () => ({ state, stage, chapter: state.get().chapter }), // maximised "Try it" playgrounds
});
const numbers = sectionNumbers(chapters);
const steps = buildSteps(chapters, standIns, { endFrame: ROUTE.keys.skyEnd, revealFrame: ROUTE.keys.skyStart + 84 });
const dialogue = createDialogue(
  { box: $('#dialogue'), end: $('#endpanel') },
  { characters, references, disclaimer },
);
createPhoneCall($('#call'), state, characters, announce);
const notebook = createNotebook($('#notebook'), state, { state, stage }, {
  chapters, references, onGoToChapter: (n) => player.goToChapter(n),
  // Notebook -> story: jump to the first line whose topic this section covers.
  onGoToRef: (key) => {
    const i = steps.findIndex((st) => st.type === 'line' && st.line.ref && `${st.chapter.id}|${st.line.ref}` === key);
    if (i < 0) return false;
    player.goTo(i);
    return true;
  },
});
const voice = await createVoice($('#voice-toggle'), state);
const sfx = createSfx();
const player = createPlayer({ steps, state, stage, dialogue, annotations, voice, sfx, onChapterEnd: () => notebook.open() });

// Footage plays (muted) behind the start screen.
stage.setClip(chapters[0].clip.id).then(() => stage.playRange(chapters[0].clip.start, chapters[0].clip.end));

// ?debug exposes the player for browser tests (tools: Puppeteer).
if (new URLSearchParams(location.search).has('debug')) window.__klt = { player, steps, stage, state };

createTimeline($('#timeline'), { steps, chapters, state, onSeek: (i) => player.goTo(i) });

// Chrome reacting to state.
// Headline: location as the kicker, the current topic as the title.
let lastChapter = null;
let lastTopic = null;
const headline = $('#headline-title');
state.subscribe((s, changed) => {
  const key = s.step && `${s.step.topic}|${s.step.ref}`;
  if (changed.includes('step') && s.step && key !== lastTopic) {
    lastTopic = key;
    headline.classList.remove('is-in');
    headline.textContent = s.step.topic;
    void headline.offsetWidth; // restart the entrance animation
    headline.classList.add('is-in');
  }
  // "Article §i.j" in the dialogue box: the section that explains this line in depth.
  if (changed.includes('step') && s.step) {
    const more = $('#dialogue-more');
    const ref = s.step.type === 'line' ? s.step.ref : null;
    const num = ref && numbers.get(`${s.step.chapter.id}|${ref}`);
    more.hidden = !ref;
    if (ref) {
      more.dataset.ref = ref;
      more.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 5h4M6 8h4M6 11h2"/></svg> Article${num ? ` §${num}` : ''} <kbd>N</kbd>`;
      more.title = `Read more: ${ref.replace(/\s*\((outline|placeholder)\)$/, '')}`;
    }
  }
  if (changed.includes('chapter') && s.chapter && s.chapter !== lastChapter) {
    lastChapter = s.chapter;
    $('#stage-place').textContent = `Chapter ${s.chapter.index} · ${s.chapter.place}`;
    $('#stage-icon').innerHTML = icons[s.chapter.icon] ?? '';
    $('#stage-desc').textContent = s.chapter.sceneAlt;
    announce(`Chapter ${s.chapter.index}, ${s.chapter.place}. ${s.chapter.sceneAlt} ${hudSummary(s.trackFrame)}`);
  }
});

// Start screen: the click is also the gesture that unlocks audio playback.
const startEl = $('#start');
let started = false;
function begin() {
  if (started) return;
  started = true;
  startEl.hidden = true;
  player.start(0);
  $('#nav-next').focus();
}
$('#start-btn').addEventListener('click', begin);
$('#start-btn').focus();

// Clicks: anywhere on the footage / dialogue advances; buttons do their own thing.
stageEl.addEventListener('click', (e) => {
  if (!started) return;
  if (e.target.closest('button, a, select, input, label, .annot, .topbar, .endpanel, .timeline')) return;
  player.next();
});
document.addEventListener('click', (e) => {
  // These buttons open the notebook; drop their focus so that Space, once it closes, goes to the story
  // (a focused button would be "clicked" by Space and reopen the notebook).
  if (e.target.closest('[data-open-notebook], #dialogue-more, [data-nbref]')) e.target.closest('button')?.blur();
  if (e.target.closest('[data-open-notebook]')) notebook.open();
  const more = e.target.closest('#dialogue-more');
  if (more) notebook.openSection(more.dataset.ref);
  const nbref = e.target.closest('[data-nbref]');
  if (nbref) { const [id, ...t] = nbref.dataset.nbref.split('|'); notebook.openSection(t.join('|'), id); }
  if (e.target.closest('[data-restart]')) player.start(0);
});
$('#nav-prev').addEventListener('click', () => player.prev());
$('#nav-next').addEventListener('click', () => player.next());

// Keyboard.
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.classList.contains('tryit-open')) return; // a maximised playground owns the keyboard
  if (e.target.closest?.('input, textarea, select, [contenteditable], [role="slider"]')) return;
  if (!started) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); begin(); }
    return;
  }
  if (state.get().notebookOpen && !['n', 'N', 'Escape'].includes(e.key)) return;
  const onButton = e.target.closest?.('button');
  switch (e.key) {
    case ' ': case 'Enter':
      if (onButton && onButton.id !== 'nav-next') return; // let buttons activate normally
      player.next(); break;
    case 'ArrowRight': case 'j': player.next(); break;
    case 'ArrowLeft': case 'k': player.prev(); break;
    case 'n': case 'N': { // open at the section the current line is about
      const ref = state.get().step?.ref;
      if (state.get().notebookOpen || !ref) notebook.toggle(); else notebook.openSection(ref);
      break;
    }
    case 'v': case 'V': voice.toggle(); break;
    case 'g': case 'G': greyscale.cycle(); break;
    case 'Escape': notebook.close(); break;
    default:
      if (/^[0-7]$/.test(e.key)) player.goToChapter(+e.key);
      else return;
  }
  e.preventDefault();
});
