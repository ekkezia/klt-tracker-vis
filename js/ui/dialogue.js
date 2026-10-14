// Game-style dialogue box at the bottom of the screen
// and the closing references panel. One step is shown at a time.
// Step types (built by chapterEngine): 'intro' | 'line' | 'end'.

import { inline, render } from '../lib/markup.js';
import { prefersReducedMotion } from '../config.js';
import { expressions, frameSrc } from '../data/expressions.js';

const SPEECH_WORD_MS = 230; // simulated speaking pace while there is no voice recording

/** How long a line takes to "say": the text reveal, the mouth and the overlay delay all follow it. */
const speechMs = (words) => Math.min(6000, Math.max(900, words * SPEECH_WORD_MS));

/** Portrait: the character's expression frame if it has art, else a monogram. */
export function portrait(speakerId, characters, size = 'md', frame = null) {
  const c = characters[speakerId];
  const ex = expressions[speakerId];
  if (ex) {
    return `<span class="portrait portrait--img portrait--${size}" style="--accent:${c.accent}" aria-hidden="true">`
      + `<img src="${frameSrc(speakerId, frame ?? ex.rest)}" alt="" draggable="false"></span>`;
  }
  // TODO(creative): art for Dr. Tomasi / Dr. Lucas (4x3 sheet -> tools/split_sprites.py).
  return `<span class="portrait portrait--${size}" style="--accent:${c.accent}" aria-hidden="true">${c.initials}</span>`;
}

/**
 * Stop-motion talking: swap expression frames on the portrait image while the
 * line is spoken (until `until` settles, or for an estimate from the word count),
 * then settle on the rest frame.
 */
function createTalker() {
  let timer = 0, stopTimer = 0, img = null, who = null, rest = null, token = 0;
  const pick = (list, not) => {
    const opts = list.filter((f) => f !== not);
    return (opts.length ? opts : list)[Math.floor(Math.random() * (opts.length || list.length))];
  };
  function stop() {
    clearTimeout(timer); clearTimeout(stopTimer);
    token++;
    if (img && who) img.src = frameSrc(who, rest);
  }
  function start(el, speaker, restFrame, until, ms) {
    stop();
    const ex = expressions[speaker];
    img = el?.querySelector('img');
    who = speaker;
    rest = restFrame ?? ex?.rest;
    if (!ex || !img || prefersReducedMotion()) return;
    const my = ++token;
    let mouthOpen = false, current = rest;
    const tickFrame = () => {
      if (my !== token) return;
      mouthOpen = !mouthOpen;
      const set = mouthOpen ? (Math.random() < 0.18 && ex.talk.wide.length ? ex.talk.wide : ex.talk.open) : ex.talk.closed;
      current = pick(set, current);
      img.src = frameSrc(speaker, current);
      timer = setTimeout(tickFrame, 95 + Math.random() * 70);
    };
    tickFrame();
    if (until) until.then(() => { if (my === token) stop(); });
    else stopTimer = setTimeout(stop, ms);
  }
  return { start, stop };
}

export function createDialogue({ box, end }, { characters, references, disclaimer }) {
  const els = {
    portrait: box.querySelector('[data-d="portrait"]'),
    name: box.querySelector('[data-d="name"]'),
    role: box.querySelector('[data-d="role"]'),
    text: box.querySelector('[data-d="text"]'),
  };
  let revealTimer = 0;
  let revealing = false;
  const talker = createTalker();
  let current = null;
  // "Ready": the line was said and its overlay is up, so the reader should press
  // Next (markReady). `.dialogue.is-ready` highlights the Space ▶ button and the ▼ arrow.
  let talkToken = 0;
  let revealDone = Promise.resolve();
  let resolveReveal = () => {};
  let spoken = Promise.resolve();
  let skipSpoken = () => {};

  // References panel is static; render once.
  end.querySelector('[data-end="refs"]').innerHTML = references.map((r) => {
    const label = r.url ? `<a href="${r.url}" rel="noopener" target="_blank">${r.label}</a>` : `<cite>${r.label}</cite>`;
    return `<li>${label} <span class="ref-source">${r.source}</span>${r.note ? ` <span class="todo">${r.note}</span>` : ''}</li>`;
  }).join('');
  end.querySelector('[data-end="disclaimer"]').innerHTML = render(disclaimer);

  function show(step) {
    clearTimeout(revealTimer);
    revealing = false;
    talker.stop();
    talkToken++;
    box.classList.remove('is-ready');
    current = step;
    // Intro steps show no dialogue box (the HUD headline names the chapter).
    box.hidden = step.type !== 'line';
    end.hidden = step.type !== 'end';
    if (step.type !== 'line') return;

    const { speaker, text } = step.line;
    const c = characters[speaker];
    box.dataset.speaker = speaker;
    box.style.setProperty('--accent', c.accent);
    els.portrait.innerHTML = portrait(speaker, characters, 'lg', step.line?.expression);
    els.name.textContent = c.name;
    els.role.textContent = c.role;
    els.text.innerHTML = inline(text);
    reveal();
  }

  // Word-by-word reveal. KaTeX blocks count as one word.
  function reveal() {
    revealDone = new Promise((res) => { resolveReveal = res; });
    spoken = new Promise((res) => { skipSpoken = res; });
    if (prefersReducedMotion()) { box.classList.add('is-revealed'); resolveReveal(); return; }
    box.classList.remove('is-revealed');
    let n = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(part); continue; }
            const s = document.createElement('span');
            s.className = 'w';
            s.style.setProperty('--i', n++);
            s.textContent = part;
            frag.append(s);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.classList.contains('katex') || child.tagName === 'CODE') {
            child.classList.add('w');
            child.style.setProperty('--i', n++);
          } else walk(child);
        }
      }
    };
    walk(els.text);
    revealing = true;
    const total = speechMs(current.line.text.split(/\s+/).length);
    box.style.setProperty('--word-ms', `${total / Math.max(1, n)}ms`);
    revealTimer = setTimeout(finish, total + 250);
  }

  function finish() {
    clearTimeout(revealTimer);
    revealing = false;
    box.classList.add('is-revealed');
    resolveReveal();
  }

  /** Animate the current speaker's mouth; `until` is the voice promise (or null). */
  function talk(until) {
    if (current?.type !== 'line') return;
    const words = current.line.text.split(/\s+/).length;
    talker.start(els.portrait, current.line.speaker, current.line.expression, until, speechMs(words));
  }

  return {
    show,
    talk,
    /** The scene has finished explaining (text, voice and overlay): point the reader at Next. */
    markReady() { if (current?.type === 'line') box.classList.add('is-ready'); },
    /** Resolves once the line has been fully "said" (text shown and voice/simulated speech over), or skipped. */
    whenSpoken(until) {
      return Promise.race([spoken, Promise.all([revealDone, until ?? null])]);
    },
    /** If text is still appearing, complete it and return true. */
    skipReveal() { if (!revealing) return false; finish(); skipSpoken(); return true; },
  };
}
