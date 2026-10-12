// Small synthesized sound effects (Web Audio; no audio files).
//   ring()     a phone ringing: two double-rings of a 400 + 450 Hz tone
//   connect()  a short rising two-note chirp when the call is picked up
// Browsers only allow audio after a user gesture; the start screen provides one.

export function createSfx() {
  let ctx = null;
  let out = null;
  let active = [];
  let timer = 0;
  let loop = 0;

  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.18;
      out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  function tone(freqs, t0, dur, { attack = 0.015, release = 0.04, type = 'sine', gain = 1 } = {}) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + dur - release);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    g.connect(out);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
      o.onended = () => { active = active.filter((x) => x !== o); };
      active.push(o);
    }
  }

  function burst() { // one "ring-ring"
    const t = ctx.currentTime + 0.05;
    tone([400, 450], t, 0.4, { gain: 0.9 });
    tone([400, 450], t + 0.6, 0.4, { gain: 0.9 });
  }

  function stop() {
    clearTimeout(timer);
    clearInterval(loop);
    active.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
    active = [];
  }

  return {
    /** Ring twice (~2.4 s). Resolves when the ringing ends. */
    ring() {
      if (!ensure()) return Promise.resolve();
      stop();
      const t = ctx.currentTime + 0.05;
      for (const start of [0, 1.4]) {                 // two "ring-ring"s
        tone([400, 450], t + start, 0.4, { gain: 0.9 });
        tone([400, 450], t + start + 0.6, 0.4, { gain: 0.9 });
      }
      return new Promise((res) => { timer = setTimeout(res, 2450); });
    },
    /** Ring until stop() (or connect()) is called: a double ring every 3 s. */
    ringLoop() {
      if (!ensure()) return;
      stop();
      burst();
      loop = setInterval(burst, 3000);
    },
    connect() {
      if (!ensure()) return;
      stop();
      const t = ctx.currentTime + 0.02;
      tone([660], t, 0.09, { type: 'triangle', gain: 0.8 });
      tone([990], t + 0.1, 0.12, { type: 'triangle', gain: 0.8 });
    },
    stop,
  };
}
