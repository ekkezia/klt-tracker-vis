// Turns chapters.js into an ordered list of steps and plays them one at a
// time, like a visual novel: advance with Space / Enter / click.
//
// Journey model: the footage moves forward only when the reader advances.
// Each step owns a stretch of the chapter's frames [from, to]; pressing Next
// plays that stretch once and then pauses on `to`. Stretches are consecutive,
// so the trip never loops or jumps back. A line's `hold` frame marks where the
// journey stops for it; steps without one are spread evenly between stops.

/** Flatten chapters into steps: intro (the chapter brief), then one per dialogue line. */
export function buildSteps(chapters, standIns = {}) {
  const cast = (id) => standIns[id] ?? id;
  const steps = [];
  for (const chapter of chapters) {
    const local = [
      { type: 'intro' },
      ...chapter.dialogue.map((line, lineIndex) => ({
        type: 'line', lineIndex, line: { ...line, speaker: cast(line.speaker) },
      })),
    ];
    // Call state and topic carry forward through the chapter.
    let call = null;
    let topic = chapter.title;
    let ref = chapter.notebook[0]?.title ?? null;
    for (const s of local) {
      const ev = s.line?.event;
      s.ringing = Boolean(ev?.call); // this line places the call; it rings after the line
      if (ev?.call) call = [...new Set([].concat(ev.call).map(cast))];
      if (s.line?.topic) { topic = s.line.topic; ref = s.line.ref ?? null; }
      s.call = call;
      s.topic = s.type === 'intro' ? chapter.title : topic;
      s.ref = ref; // notebook section title -> Full-article subsection
      if (ev?.hangup) call = null;
    }
    planJourney(local, chapter.clip);
    local.forEach((s) => steps.push({ ...s, chapter }));
  }
  const lastStep = steps[steps.length - 1];
  steps.push({
    type: 'end', chapter: chapters[chapters.length - 1], call: null, topic: 'References',
    from: lastStep.to, to: lastStep.to,
  });
  return steps;
}

/** Assign each step a monotonic frame stretch [from, to] within the clip range. */
function planJourney(local, { start, end }) {
  // Stops: the intro sits at the chapter start, held lines at their frame,
  // the last step at the chapter end. Everything else is interpolated.
  const stops = new Map([[0, start], [local.length - 1, end]]);
  local.forEach((s, k) => {
    const h = s.line?.hold;
    if (h != null && k > 0) stops.set(k, Math.min(end, Math.max(start, h)));
  });
  const keys = [...stops.keys()].sort((a, b) => a - b);
  const to = new Array(local.length);
  for (let j = 0; j + 1 < keys.length; j++) {
    const [ka, kb] = [keys[j], keys[j + 1]];
    const [fa, fb] = [stops.get(ka), Math.max(stops.get(ka), stops.get(kb))];
    for (let k = ka; k <= kb; k++) to[k] = Math.round(fa + ((fb - fa) * (k - ka)) / (kb - ka || 1));
  }
  let cursor = start;
  local.forEach((s, k) => {
    s.from = cursor;
    s.to = Math.max(cursor, to[k]);
    cursor = s.to;
  });
}

/**
 * Plays steps. Each step:
 *   - footage: plays [from, to] once when advancing, then pauses (jumps show `to`)
 *   - dialogue box / title card, with the speaker's portrait talking
 *   - on-footage annotations from `line.focus` (once the footage has stopped)
 *   - voice-over, if available
 */
export function createPlayer({ steps, state, stage, dialogue, annotations, voice, sfx }) {
  let index = -1;
  let token = 0;

  async function goTo(i, { travel = false } = {}) {
    const idx = Math.max(0, Math.min(steps.length - 1, i));
    const step = steps[idx];
    const my = ++token;
    const prev = steps[index];
    index = idx;
    const { chapter } = step;
    sfx?.stop();

    await stage.setClip(chapter.clip.id);
    stage.setScene(chapter.scene, [chapter.clip.start, chapter.clip.end]);
    dialogue.show(step);
    state.set({ stepIndex: idx, step, chapter, call: step.call, callState: step.ringing ? 'ringing' : 'connected' });
    const speaking = voice?.play(step) ?? null;
    dialogue.talk(speaking);
    // Phone: ring once Wren has said "Calling…"; chirp when the doctor picks up.
    if (step.ringing && voice?.soundOn) {
      // Keeps ringing until the reader moves on and the doctor picks up.
      (speaking ?? new Promise((r) => setTimeout(r, 900))).then(() => { if (my === token) sfx?.ringLoop(); });
    } else if (prev?.ringing && step.call && travel && voice?.soundOn) {
      sfx?.connect();
    }

    annotations.clear();
    if (travel && step.to > step.from) await stage.playSegment(step.from, step.to);
    else await stage.hold(step.to);
    if (my !== token) return;
    // A line's `math` note is shown on the footage as a floating card.
    const math = step.line?.math ? [{ kind: 'card', title: 'The math', body: step.line.math }] : [];
    const focus = [].concat(step.line?.focus ?? []);
    annotations.show(focus.length || math.length ? [...focus, ...math] : null);
  }

  return {
    start: (i = 0) => goTo(i, { travel: true }),
    goTo,
    next() {
      if (dialogue.skipReveal()) return;
      if (index < steps.length - 1) goTo(index + 1, { travel: true });
    },
    prev: () => goTo(index - 1),
    goToChapter(n) {
      const i = steps.findIndex((s) => s.type === 'intro' && s.chapter.index === n);
      if (i >= 0) goTo(i);
    },
    get index() { return index; },
  };
}
