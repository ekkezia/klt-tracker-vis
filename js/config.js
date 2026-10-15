// Global constants. Change STAGE to match your footage; everything else scales.
export const STAGE = Object.freeze({
  width: 960,   // native footage width (px)
  height: 540,  // native footage height (px) -> 16:9 (simulator recording size)
});


// Overlay drawing.
export const OVERLAY = Object.freeze({
  trailFrames: 10,      // how many previous frames to draw as a motion trail
  dotRadius: 3,
  dimAlpha: 0.22,       // focus mode: opacity of tracks the current annotation is not about
});


// Voice-over plays this much faster than recorded (pitch is preserved), so no audio has to be regenerated.
export const VOICE_RATE = 1.3;

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
