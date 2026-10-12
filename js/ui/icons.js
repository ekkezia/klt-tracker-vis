// Line-art symbols for the timeline checkpoints (chapter.icon). Stroke uses
// currentColor so CSS controls the colour.
// TODO(creative): replace with hand-drawn illustrations in the same 40x40 box.

const svg = (body) => `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  // sidewalk delivery robot: a rounded box on four wheels with a sensor dome (briefing)
  robot: svg(`<rect x="8" y="11" width="24" height="17" rx="5"/><path d="M8 19h24"/><path d="M14 15h3M23 15h3"/>
    <rect x="17" y="6" width="6" height="5" rx="1.5"/><circle cx="12.5" cy="31" r="3"/><circle cx="27.5" cy="31" r="3"/>`),
  // parallel motion arrows (optical flow)
  flow: svg(`<circle cx="6" cy="11" r="1.6"/><path d="M9 11h18m-4-4 4 4-4 4"/>
    <circle cx="6" cy="20" r="1.6"/><path d="M9 20h23m-4-4 4 4-4 4"/>
    <circle cx="6" cy="29" r="1.6"/><path d="M9 29h14m-4-4 4 4-4 4"/>`),
  // analysis window on a corner (aperture problem, Shi–Tomasi)
  corner: svg(`<rect x="7" y="7" width="26" height="26" rx="1" stroke-dasharray="3 3"/>
    <path d="M20 33V20h13"/><circle cx="20" cy="20" r="2.2"/><path d="M11 13l4 0M13 11l0 4" opacity=".6"/>`),
  // crosshair with converging iterates (Lucas–Kanade)
  lk: svg(`<circle cx="25" cy="16" r="8"/><path d="M25 4v5M25 23v5M13 16h5M32 16h5"/>
    <path d="M5 35l6-5 4 1 4-5 3-2 2-1" stroke-dasharray="1 2.5"/><circle cx="5" cy="35" r="1.6"/><circle cx="11" cy="30" r="1.3"/>
    <circle cx="15" cy="31" r="1.3"/><circle cx="19" cy="26" r="1.3"/>`),
  // the KLT loop: detect -> track -> verify -> replenish
  pipeline: svg(`<path d="M20 6a14 14 0 0 1 13.4 10"/><path d="M34 24A14 14 0 0 1 20 34"/><path d="M6 24A14 14 0 0 1 9 12"/>
    <path d="M31 13l2.4 3 3-2.6M22.6 31.4 20 34l2.7 2.3M6.4 15l2.6-3 2.7 2.4"/><circle cx="20" cy="20" r="3"/>`),
  // image pyramid
  pyramid: svg(`<rect x="5" y="29" width="30" height="6" rx="1"/><rect x="10" y="21" width="20" height="6" rx="1"/>
    <rect x="14" y="13" width="12" height="6" rx="1"/><rect x="17" y="5" width="6" height="6" rx="1"/>`),
  // expansion from a focus point (flow field, time-to-contact)
  expand: svg(`<circle cx="20" cy="20" r="2.2"/>
    <path d="M26 20h8M24.2 24.2l5.7 5.7M20 26v8M15.8 24.2l-5.7 5.7M14 20H6M15.8 15.8l-5.7-5.7M20 14V6M24.2 15.8l5.7-5.7"/>`),
  // docking target (visual servoing)
  target: svg(`<circle cx="20" cy="20" r="13"/><circle cx="20" cy="20" r="6.5"/><circle cx="20" cy="20" r="1.5"/>
    <path d="M20 3v6M20 31v6M3 20h6M31 20h6"/>`),
  // notebook (debrief)
  notebook: svg(`<rect x="10" y="5" width="22" height="30" rx="2"/><path d="M15 12h12M15 18h12M15 24h8"/>
    <path d="M10 9H7M10 15H7M10 21H7M10 27H7"/>`),
};
