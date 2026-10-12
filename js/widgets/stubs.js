// Placeholder widgets. Each follows the same contract as the reference widget
// (structureTensor.js) and shows what it is meant to become.
// TODO(creative): implement each one; keep the ids, they are referenced by chapters.js.

const specs = {
  'briefing': {
    title: 'Mission briefing',
    plan: 'Animated map of the route (dock → lobby → wall → corridor → hall → atrium → bay C) with the four uses of tracking pinned to the legs where they appear.',
  },
  'flow-1d': {
    title: '1D optical flow',
    plan: 'Two editable 7-cell signals. Show I_x, I_t and the pointwise estimate −I_t/I_x per cell, and the window least-squares estimate −ΣI_xI_t / ΣI_x². Let the reader shift frame 2 by 0–3 cells and see the linear estimate break for large shifts.',
  },
  'lk-iterations': {
    title: 'Lucas–Kanade, one iteration at a time',
    plan: 'Pick a tracked feature in the current frame and the next. Step through Gauss–Newton: template, warped patch, error image, steepest-descent images, H, Δp, updated p. Plot E(p) per iteration and the path of p on an SSD surface.',
  },
  'pyramid': {
    title: 'Coarse-to-fine pyramid',
    plan: 'Show 4 pyramid levels of the current frame with one feature; slider for motion size; show single-level LK failing and pyramidal LK succeeding, with the guess g propagated between levels. Second tab: forward–backward error histogram and the drop threshold.',
  },
  'flow-field': {
    title: 'Flow field and time-to-contact',
    plan: 'Draw the sparse flow field for the current frame; let the reader drag a box around an object and fit expansion → τ. Toggle gyro de-rotation. Needs footage with forward motion.',
  },
  'servo': {
    title: 'Visual servoing loop',
    plan: 'Plot the tracked target corners s and desired s*; show e = s − s* over time and the commanded velocity v = −λ L⁺ e. Slider for gain λ.',
  },
  'pipeline-inspector': {
    title: 'Pipeline inspector',
    plan: 'Pick a start frame and n. For each module (detect, pyramid, track, FB check, re-detect) show its inputs and outputs on those n frames as a small multiples grid.',
  },
};

function makeStub(id, { title, plan }) {
  return (el, api) => {
    el.innerHTML = `
      <div class="widget widget--stub">
        <p class="widget__kicker">Widget · <code>${id}</code> · <span class="todo">TODO(creative)</span></p>
        <h3>${title}</h3>
        <p>${plan}</p>
        <p class="widget__meta" data-meta></p>
      </div>`;
    // Demonstrates the frame-access contract: report what grabFrame() returns.
    const meta = el.querySelector('[data-meta]');
    const show = () => {
      const img = api.stage.grabFrame();
      meta.textContent = img
        ? `Frame ${api.stage.frame}: ${img.width}×${img.height} pixels available via api.stage.grabFrame().`
        : 'Waiting for video frame…';
    };
    show();
    return api.stage.onFrame(show);
  };
}

export const stubs = Object.fromEntries(Object.entries(specs).map(([id, s]) => [id, makeStub(id, s)]));
