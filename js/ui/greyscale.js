// Greyscale footage, so coloured tracks and annotations stand out.
// Modes (button / G key cycles them): 'auto' -> 'on' -> 'off'.
//   auto  grey while an annotation points at something on the footage
//         (any focus kind except a plain floating card), colour otherwise
//   on    always grey
//   off   always colour
// Only the <video> is filtered (CSS), so pixels read by grabFrame() are unaffected.

const MODES = ['auto', 'on', 'off'];
const LABEL = { auto: 'Greyscale: auto (G)', on: 'Greyscale: always (G)', off: 'Greyscale: off (G)' };
const ICON = (mode) => `<svg viewBox="0 0 16 16" aria-hidden="true">
  <circle cx="8" cy="8" r="6"/>${mode === 'off' ? '' : '<path d="M8 2a6 6 0 0 1 0 12z" class="fill"/>'}
  ${mode === 'auto' ? '<text x="3.2" y="10.6" font-size="6.5" font-weight="700" class="fill" style="font-family:ui-sans-serif,system-ui">A</text>' : ''}
</svg>`;

export function createGreyscale(button, stageEl) {
  let mode = 'auto';
  try { mode = MODES.includes(localStorage.getItem('klt-grey')) ? localStorage.getItem('klt-grey') : 'auto'; } catch { /* ignore */ }
  let pointing = false; // an annotation is explaining specific points right now

  function sync() {
    const grey = mode === 'on' || (mode === 'auto' && pointing);
    stageEl.classList.toggle('stage--grey', grey);
    button.innerHTML = ICON(mode);
    button.title = LABEL[mode];
    button.setAttribute('aria-label', LABEL[mode].replace(' (G)', ''));
    button.setAttribute('aria-pressed', String(mode !== 'off'));
    button.dataset.mode = mode;
  }

  function cycle() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try { localStorage.setItem('klt-grey', mode); } catch { /* ignore */ }
    sync();
  }

  button.addEventListener('click', cycle);
  sync();
  return {
    cycle,
    /** Called with the focus specs being shown (or [] when annotations clear). */
    setFocus(specs) {
      pointing = specs.some((f) => f.kind && f.kind !== 'card');
      sync();
    },
  };
}
