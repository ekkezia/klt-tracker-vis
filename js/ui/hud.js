// HUD readouts: frame counter, tracked features, mean forward-backward error. All numbers come from the track file for the shown frame.

import { frameStats } from '../stage/tracks.js';

export function createHud(root, state, getFrameCount) {
  const el = (k) => root.querySelector(`[data-hud="${k}"]`);
  const frameEl = el('frame'), trackedEl = el('tracked'), errEl = el('err');

  state.subscribe((s, changed) => {
    if (!changed.includes('trackFrame') && !changed.includes('frame')) return;
    const st = frameStats(s.trackFrame ?? []);
    const total = getFrameCount();
    frameEl.textContent = `${String(s.frame ?? 0).padStart(4, '0')}${total ? ` / ${String(total - 1).padStart(4, '0')}` : ''}`;
    trackedEl.textContent = String(st.active);
    errEl.textContent = st.meanErr == null ? '—' : `${st.meanErr.toFixed(2)} px`;
  });
}

/** Short text summary for the screen-reader description of the stage. */
export function hudSummary(points) {
  const st = frameStats(points);
  return `${st.active} features tracked${st.lost ? `, ${st.lost} lost this frame` : ''}${st.meanErr != null ? `, mean error ${st.meanErr.toFixed(2)} pixels` : ''}.`;
}
