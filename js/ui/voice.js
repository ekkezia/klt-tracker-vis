// Voice-over playback. Audio is generated ahead of time by
// tools/make_voices.mjs (ElevenLabs) into assets/voice/, listed in
// assets/voice/manifest.json as { "<chapterId>:<lineIndex>": "assets/voice/....mp3" }.
// The browser never talks to ElevenLabs, so no API key is ever exposed.

const MANIFEST = 'assets/voice/manifest.json';

export async function createVoice(button, state) {
  let manifest = {};
  try {
    const r = await fetch(MANIFEST, { cache: 'no-store' });
    if (r.ok) manifest = await r.json();
  } catch { /* no voice files yet */ }
  const available = Object.keys(manifest).length > 0;

  const audio = new Audio();
  audio.preload = 'auto';
  let enabled = readPref();
  const listeners = new Set();
  audio.addEventListener('ended', () => listeners.forEach((fn) => fn()));

  const ICON_ON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" class="fill"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" class="fill"/><path d="M11 6l4 4M15 6l-4 4"/></svg>';
  function sync() {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Sound on' : 'Sound off');
    button.title = (enabled ? 'Sound on (V)' : 'Sound off (V)')
      + (available ? '' : ' · no voice files yet: run tools/make_voices.mjs');
    button.innerHTML = enabled ? ICON_ON : ICON_OFF;
  }

  /** Play a step's line. Returns a promise that settles when it stops, or null if nothing plays. */
  let finishCurrent = null;
  function play(step) {
    audio.pause();
    finishCurrent?.();
    if (!enabled || step?.type !== 'line') return null;
    const src = manifest[`${step.chapter.id}:${step.lineIndex}`];
    if (!src) return null;
    audio.src = src;
    audio.currentTime = 0;
    return new Promise((resolve) => {
      const done = () => {
        audio.removeEventListener('ended', done);
        audio.removeEventListener('error', done);
        finishCurrent = null;
        resolve();
      };
      finishCurrent = done;
      audio.addEventListener('ended', done);
      audio.addEventListener('error', done);
      audio.play().catch(done);
    });
  }

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem('klt-voice', enabled ? '1' : '0'); } catch { /* ignore */ }
    if (!enabled) { audio.pause(); finishCurrent?.(); }
    else play(state.get().step);
    sync();
  }

  button.addEventListener('click', toggle);
  sync();
  return {
    play, stop: () => audio.pause(), toggle, onEnded: (fn) => listeners.add(fn),
    get enabled() { return enabled; },
    get soundOn() { return enabled; },
  };
}

function readPref() {
  try { return localStorage.getItem('klt-voice') !== '0'; } catch { return true; }
}
