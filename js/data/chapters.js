// =============================================================================
// ALL story + teaching content lives here. Code never hard-codes chapter text.
// Schema: see HANDOFF.md -> "Data contract". Quick reference:
//
// characters: { [speakerId]: { name, role, initials, accent } }
// clips:      { [clipId]: { src, tracks, fps?, width?, height? } }
// chapters[]: {
//   id, index,
//   title,                                 // what the chapter EXPLAINS (concept)
//   short, icon,                           // timeline label + symbol (js/ui/icons.js)
//   place,                                 // scene location, shown as the kicker
//   scene, sceneAlt,
//   status: 'written' | 'outline',
//   clip: { id, start, end },              // inclusive frame range in that clip
//   failure: { title, text },              // the chapter's problem (chapter brief; no longer shown in the UI)
//   dialogue: [{ speaker, text, math?, event?, hold?, focus?, say?, topic?, ref?, loop? }],
//      loop:   true | 'detect' | 'track' | 'verify' | 'replenish': shows the KLT-loop flowchart, lit at that step
//      event:  { call: speakerId | [speakerId] } | { hangup: true }
//      math:   optional derivation, shown on the footage as a "The math" card
//      hold:   the frame the footage travels to and stops on for this line
//              (otherwise frames are interpolated across the chapter's range)
//      focus:  annotation(s) drawn ON the footage, anchored to what the line
//              explains -- see js/annotations/annotations.js for kinds/anchors
//      say:    plain-English version for text-to-speech (needed when `text`
//              contains math); see tools/make_voices.mjs
//      topic:  what is being explained from this line on (headline on screen);
//              carries forward until another line sets it
//      ref:    title of this chapter's notebook section that covers `topic`;
//              the headline shows its Full-article number (§i.j) as a link
//   notebook: imported from ./notebook/<n>-<name>.js, an array of { title, level: 'story' | 'math', body },
//   widget: playground id(s) in the Lab Notebook (js/widgets/registry.js): a string, an array, or null
// }
//
// Markup in text/body: blank line = paragraph, $inline$, $$display$$,
// **bold**, *italic*, lines starting "- " = bullets, "1. " = numbered,
// "> " = callout, lines starting "|" = table rows (first row = header).
// Dialogue `text` supports the same inline markup ($, **, *).
// =============================================================================

import { ROUTE } from './route.js';

import nb_boot from './notebook/0-tracking-problem.js';
import nb_lobby from './notebook/1-optical-flow.js';
import nb_wall from './notebook/2-aperture-and-corners.js';
import nb_sprint from './notebook/3-pyramids-and-checks.js';
import nb_corridor from './notebook/4-lucas-kanade.js';
import nb_crowd from './notebook/5-klt-pipeline.js';
import nb_docking from './notebook/6-applications.js';
import nb_debrief from './notebook/7-debrief.js';

const R = String.raw;
const K = ROUTE.keys; // named frames of the recorded journey (e.g. K.truckStop)
const TRUCK = [0, 0, 900, 345]; // the truck's footprint (px) in the held frame K.truckStop + 24

export const characters = {
  // voice: ElevenLabs settings used by tools/make_voices.mjs. `name` is the voice's
  // name in your ElevenLabs library (resolved to an id at generation time); `id`
  // overrides it if set. List yours with: node tools/make_voices.mjs --list-voices
  // `brief` describes the intended sound, to help pick or design a voice.
  wren: { name: 'Wren', role: 'Delivery robot', initials: 'W', accent: 'var(--c-wren)',
    voice: { name: 'Wren - Robot', id: '', brief: 'young, bright, curious; slightly synthetic', stability: 0.5, similarity: 0.75, style: 0.25 } },
  lucas: { name: 'Dr Lucas', role: 'Optical flow', initials: 'L', accent: 'var(--c-lucas)',
    voice: { id: '', brief: 'warm, energetic teacher', stability: 0.45, similarity: 0.75, style: 0.3 } },
  kanade: { name: 'Dr Kanade', role: 'Image alignment', initials: 'K', accent: 'var(--c-kanade)',
    voice: { name: 'Kanade', id: '', brief: 'calm, mature professor; light Japanese accent', stability: 0.6, similarity: 0.75, style: 0.15 } },
  tomasi: { name: 'Dr Tomasi', role: 'Feature selection', initials: 'T', accent: 'var(--c-tomasi)',
    voice: { name: 'Tomasi', id: '', brief: 'gentle, thoughtful, a little wry', stability: 0.55, similarity: 0.75, style: 0.2 } },
};

// Stand-ins: lines written for one character are spoken by another (speaker,
// portrait, voice and call overlay all follow). Dr. Kanade covers Dr. Lucas
// until Lucas has artwork; delete the entry to bring Lucas back (and revert the
// few lines of Wren's text that name "Dr. Kanade" instead of "Dr. Lucas").
export const standIns = { lucas: 'kanade' };

export const clips = {
  // Three.js simulation of the real route (sim/), tracked with real KLT (tools/track_video.py).
  chinatown: {
    src: 'assets/clips/chinatown.mp4?v=sky1', // ?v= busts browser caches when the footage is re-recorded
    tracks: 'assets/tracks/chinatown.json.gz?v=sky1',
  },
};

const ch = (i) => ({ id: 'chinatown', start: ROUTE.chapters[i][0], end: ROUTE.chapters[i][1] });
const span = (start, end) => ({ id: 'chinatown', start, end });
// Chapters 3 (pyramids) and 4 (Lucas–Kanade) re-split the recording so the
// footage still runs forward: Ch 3 is the dash across Canal Street (fast
// motion), Ch 4 the calmer walk beside the park fence. Recorded route chapters
// 3–4 (ROUTE.chapters) are not used as-is; the Straus Square walk is skipped.
const SPRINT = span(K.sprintStart - 71, K.sprintStart + 189);           // 1380–1640
const ALONG_FENCE = span(K.sprintStart + 190, ROUTE.chapters[4][1]);    // 1641–2102
const LK_FRAME = K.sprintStart + 274; // 1725: window corners on the buildings across the road, clean LK fits

export const chapters = [
  // ---------------------------------------------------------------------------
  {
    id: 'boot',
    index: 0,
    title: 'The tracking problem',
    short: 'Briefing',
    icon: 'robot',
    place: 'Happy Star Bakery, Canal St',
    scene: 'boot',
    sceneAlt: 'Robot-height camera view of the Happy Star Bakery shop front on Canal Street in Chinatown: a teal sign, a menu board and a display case of buns. The robot turns away and rolls onto the sidewalk. Small dots mark the corners being tracked.',
    status: 'written',
    clip: ch(0),
    failure: {
      title: 'How did I move?',
      text: 'GPS is unreliable between tall buildings, so Wren - the delivery robot - must estimate its own motion from the camera: from how image points move between consecutive frames.',
    },
    dialogue: [
      // OLD:
      // { topic: 'Mission briefing', ref: 'The tracking problem', hold: K.tartsView, speaker: 'wren', text: 'Good morning. I\'m Wren, a delivery robot. I\'m taking these egg tarts to my dock in Seward Park, finding my way with my camera alone.' },
      { topic: 'Mission briefing', ref: 'The tracking problem', hold: K.tartsView, speaker: 'wren', text: 'Hello, I\'m Wren. I\'m an autonomous robot who delivers egg tarts, and today I\'m finding my way to Seward Park using only my camera.' },
      // OLD:
      // { topic: 'Displacement between frames', ref: 'Why not just match descriptors?', speaker: 'wren', text: 'Between two frames, most points in view move only a few pixels. If I can measure that small shift for every point, I can work out how I moved.',
        // focus: { kind: 'flow', at: { track: 'auto' }, lag: 1, scale: 12, title: R`One point, one frame`, body: R`The {{focus|arrow}} is this point's displacement $\mathbf{d}$ from the previous frame to this one, drawn 12× longer.` },
        // math: R`Given frames $I_t, I_{t+1}$ and points $\mathbf{x}_i$, find $\mathbf{d}_i$ with $I_{t+1}(\mathbf{x}_i + \mathbf{d}_i) \approx I_t(\mathbf{x}_i)$.` },
      { topic: 'Displacement between frames', ref: 'Why not just match descriptors?',
        focus: { kind: 'flow', at: { track: 'auto' }, lag: 1, scale: 12, title: R`One point, one frame`, body: R`The {{focus|arrow}} is this point's displacement $\mathbf{d}$ from the previous frame to this one, drawn 12× longer.` },
        math: R`Given frames $I_t, I_{t+1}$ and points $\mathbf{x}_i$, find $\mathbf{d}_i$ with $I_{t+1}(\mathbf{x}_i + \mathbf{d}_i) \approx I_t(\mathbf{x}_i)$.`,
        speaker: 'wren', text: 'As I move, every point in my view shifts a little between frames. If I can measure that shift, I can work out how I moved. So I follow points. Tracking means picking a point and finding it again in every new frame, so it keeps one identity. Each dot you see is one tracked point, and its tail shows where it has been.' },
      // OLD:
      // { topic: 'Reading the tracks', ref: 'The tracking problem', hold: K.lobbyTurnEnd - 20,
        // focus: { kind: 'tracks', title: 'Tracks', body: 'Each {{tracked|dot}} is one point I follow from frame to frame. Its {{tail|tail}} shows the last 10 frames.' },
        // speaker: 'wren', text: 'Each dot is a point I follow from frame to frame: a **track**. I\'m turning in place, so every tail points the same way. Keeping these tracks alive is the job of the **KLT tracker**.' },
      { topic: 'Reading the tracks', ref: 'The tracking problem', hold: K.lobbyTurnEnd - 20,
        focus: { kind: 'tracks', title: 'Tracks', body: 'Each {{tracked|dot}} is one point I follow from frame to frame. Its {{tail|tail}} shows the last 10 frames.' },
        speaker: 'wren', text: 'Tracking breaks easily. Points leave the view, get blocked, or jump too far between frames. Some sit on a blank wall where nothing stands out. Lighting changes fool me too. And a lost point never comes back with its old identity.' },
      { speaker: 'wren', text: 'I don\'t yet know how to measure these shifts reliably. Read the article to understand the problem.' },
    ],
    notebook: nb_boot,
    widget: 'displacement',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'lobby',
    index: 1,
    title: 'Optical flow',
    short: 'Optical flow',
    icon: 'flow',
    place: 'East Broadway sidewalk',
    scene: 'lobby',
    sceneAlt: 'The robot turns out of the bakery doorway and rolls along the East Broadway sidewalk past Chinatown shop signs, shutters and fire escapes, then crosses Rutgers Street. Each tracked corner leaves a short trail.',
    status: 'written',
    clip: ch(1),
    failure: {
      title: 'How far did each point move?',
      text: 'Measure each point\'s displacement between two frames, without searching every possible shift.',
    },
    dialogue: [
      // OLD:
      // { topic: 'Every point has moved', ref: 'Brightness constancy', speaker: 'wren', text: 'Every point here has moved a little since the last frame. But how far, exactly? I\'m calling Dr Kanade.', event: { call: 'kanade' } },
      { topic: 'Every point has moved', ref: 'Brightness constancy', speaker: 'wren', text: 'I need to solve this: how far did each of my points move? Let me call Dr Kanade.', event: { call: 'kanade' } },
      // OLD:
      // { topic: 'Brightness constancy', ref: 'Brightness constancy',
        // focus: { kind: 'patches', at: { track: 'auto', near: [700, 150] }, maps: ['prev', 'next'], lag: 1, title: 'Same patch, two frames', body: R`Left: the window around {{focus|this dot}} in the previous frame. Right: the window at its new position. The pixel values barely change.` },
        // math: R`**Brightness constancy:** $I(x{+}u,\ y{+}v,\ t{+}1) = I(x,\ y,\ t)$. The shift $(u, v)$ is the **optical flow**.`,
        // speaker: 'kanade', text: 'Hello, Wren. Start from one assumption: as a point moves, its brightness stays the same. Then the small patch around it simply reappears, shifted. That shift is the **optical flow**.' },
      { topic: 'Optical flow', ref: 'Brightness constancy', speaker: 'kanade', text: 'Hello, Wren. As you roll, things in your view move. Either objects move, or you do. Either way, the same thing lands on a slightly different pixel in the next frame. That apparent motion of the picture is called **optical flow**. First, let me make a distinction clear. Some methods measure the motion of every pixel; that is dense optical flow. Others, like ours, measure it only at chosen points; that is sparse. Sparse is much cheaper.' },
      { topic: 'The three assumptions', ref: 'The three assumptions',
        focus: { kind: 'patches', at: { track: 'auto', near: [700, 150] }, maps: ['prev', 'next'], lag: 1, title: 'Same patch, two frames', body: R`Left: the window around {{focus|this dot}} in the previous frame. Right: the window at its new position. The pixel values barely change.` },
        math: R`**Brightness constancy:** $I(x{+}u,\ y{+}v,\ t{+}1) = I(x,\ y,\ t)$. The shift $(u, v)$ is the **optical flow**.`,
        speaker: 'kanade', text: 'Everything we do rests on three assumptions. One: a point keeps its brightness as it moves. Two: it moves only a little between frames. Three: its neighbors move with it.' },
      // OLD:
      // { topic: 'The optical flow constraint', ref: 'Linearising: the optical flow constraint',
        // focus: { kind: 'patches', at: { track: 'auto', near: [700, 150] }, maps: ['Ix', 'Iy', 'It'], lag: 1, title: 'The three terms', body: R`Gradients across ($I_x$), down ($I_y$) and over time ($I_t$) around {{focus|one dot}}.` },
        // math: R`One Taylor step: $\;I_x u + I_y v + I_t = 0$. One equation per pixel, two unknowns.`,
        // speaker: 'kanade', text: 'For small shifts we don\'t need to search. One Taylor step turns that assumption into a single linear equation per pixel. It links how the image changes across space to how it changes over time.' },
      { topic: 'The optical flow constraint', ref: 'Optical flow constraint',
        focus: { kind: 'patches', at: { track: 'auto', near: [700, 150] }, maps: ['Ix', 'Iy', 'It'], lag: 1, title: 'The three terms', body: R`Gradients across ($I_x$), down ($I_y$) and over time ($I_t$) around {{focus|one dot}}.` },
        math: R`One Taylor step: $\;I_x u + I_y v + I_t = 0$. One equation per pixel, two unknowns.`,
        speaker: 'kanade', text: 'The first assumption gives one equation per pixel. But the motion has two unknowns, across and down. One equation can\'t fix two unknowns. ' },
      { speaker: 'wren', text: 'So where do I get a second equation?' },
      // OLD:
      // { topic: 'Least squares over a window', ref: 'Least squares over a window',
        // focus: { kind: 'card', title: '1D: one pixel vs. the window', body: R`
// A bright pixel moves $+1$.
// 
// | pixel | 2 | 3 | 4 |
// | $I_x$ | $+4.5$ | $0$ | $-4.5$ |
// | $I_t$ | $0$ | $-9$ | $+9$ |
// | alone: $u = -I_t/I_x$ | $0$ | ? | $2$ |
// 
// Whole window: $u^\star = +1$ ✓` },
        // math: R`Minimise $\sum_{\mathcal{W}} (I_x u + I_t)^2 \;\Rightarrow\; u^\star = -\dfrac{\sum I_x I_t}{\sum I_x^2} = -\dfrac{-40.5}{40.5} = +1$.`,
        // speaker: 'kanade', text: 'One pixel alone cannot pin down the motion, and it can even give a wrong answer. So assume the whole small window moves together, and pick the one shift that fits all its pixels best. That is the **Lucas–Kanade** idea.', event: { hangup: true } },
      { topic: 'Least squares over a window', ref: 'Least squares over a window',
        focus: { kind: 'card', title: '1D: one pixel vs. the window', body: R`
A bright pixel moves $+1$.

| pixel | 2 | 3 | 4 |
| $I_x$ | $+4.5$ | $0$ | $-4.5$ |
| $I_t$ | $0$ | $-9$ | $+9$ |
| alone: $u = -I_t/I_x$ | $0$ | ? | $2$ |

Whole window: $u^\star = +1$ ✓` },
        math: R`Minimise $\sum_{\mathcal{W}} (I_x u + I_t)^2 \;\Rightarrow\; u^\star = -\dfrac{\sum I_x I_t}{\sum I_x^2} = -\dfrac{-40.5}{40.5} = +1$.`,
        speaker: 'kanade', text: 'From assumption three. Take a small window and let all its pixels share one motion. Now you have many equations, and you pick the shift that fits them all best. That is the **Lucas–Kanade** idea.', event: { hangup: true } },
      // OLD:
      // { topic: 'Optical flow, live', ref: 'The three assumptions', focus: { kind: 'flowfield', lag: 6, scale: 4, title: 'Flow while driving forward', body: 'The {{focus|arrows}} point outward from the spot I am driving toward; nearby points move faster.' },
        // speaker: 'wren', text: 'Driving forward, the arrows spread out from where I\'m heading. Each one is only a few pixels per frame, which is exactly what the method needs.' },
      { topic: 'Optical flow, live', ref: 'The three assumptions',
        focus: { kind: 'flowfield', lag: 6, scale: 4, title: 'Flow while driving forward', body: 'The {{focus|arrows}} point outward from the spot I am driving toward; nearby points move faster.' },
        speaker: 'wren', text: '' },
    ],
    notebook: nb_lobby,
    widget: ['flow-1d', 'aperture'],
  },

  // ---------------------------------------------------------------------------
  {
    id: 'wall',
    index: 2,
    title: 'The aperture problem and good features',
    short: 'Aperture & corners',
    icon: 'corner',
    place: 'Straus Square, by a box truck',
    scene: 'wall',
    sceneAlt: 'A parked white box truck fills the view at the Straus Square corner: a plain white side panel, a long straight rub rail and box edge, and wheels and the chassis underneath. Tracked dots gather on the wheels and corners; the blank panel has almost none.',
    status: 'written',
    clip: ch(2),
    failure: {
      title: 'Which points can be tracked?',
      text: 'On a plain surface, or along a straight edge, the motion of a small window cannot be determined. Wren needs a test that finds trackable points.',
    },
    dialogue: [
      // OLD:
      // { topic: 'Tracks fail on a blank panel', ref: 'The aperture problem', hold: K.truckStop + 24,
        // focus: { kind: 'tensor', at: { auto: 'flat', region: TRUCK }, title: 'Blank panel', body: 'Gradients are almost zero in {{flat|this window}}. There is nothing to lock onto.' },
        // speaker: 'wren', text: 'A truck has stopped in front of me. Points on its plain panel drift, and points on its edges slide along them. I\'m calling Dr Tomasi.', event: { call: 'tomasi' } },
      { topic: 'Tracks fail on a blank panel', ref: 'The aperture problem', hold: K.truckStop + 24,
        focus: { kind: 'tensor', at: { auto: 'flat', region: TRUCK }, title: 'Blank panel', body: 'Gradients are almost zero in {{flat|this window}}. There is nothing to lock onto.' },
        speaker: 'wren', text: 'A truck has stopped in front of me. Dots on its plain side drift, and dots on its edges slide along them. Let me call Dr Tomasi.', event: { call: 'tomasi' } },
      // OLD:
      // { topic: 'The aperture problem', ref: 'The aperture problem', hold: K.truckStop + 24,
        // focus: { kind: 'aperturelab', widget: 'aperture', at: { auto: 'edge', region: TRUCK }, title: 'The aperture problem: drag the true motion', body: '{{good|Across the edge (✓)}} a shift changes what the window sees. {{bad|Along it (?)}} nothing changes.' },
        // math: R`Only the **normal flow** is measurable: $\mathbf{d}_\perp = -\dfrac{I_t}{\|\nabla I\|}\dfrac{\nabla I}{\|\nabla I\|}$.`,
        // speaker: 'tomasi', text: 'Hello, Wren. Through a small window, a straight edge looks the same when it slides along itself. Only motion across the edge can be measured. This is the **aperture problem**.' },
      { topic: 'The aperture problem', ref: 'The aperture problem', hold: K.truckStop + 24,
        focus: { kind: 'aperturelab', widget: 'aperture', at: { auto: 'edge', region: TRUCK }, title: 'The aperture problem: drag the true motion', body: '{{good|Across the edge (✓)}} a shift changes what the window sees. {{bad|Along it (?)}} nothing changes.' },
        math: R`Only the **normal flow** is measurable: $\mathbf{d}_\perp = -\dfrac{I_t}{\|\nabla I\|}\dfrac{\nabla I}{\|\nabla I\|}$.`,
        speaker: 'tomasi', text: 'Look at a straight edge through a small window. Slide the edge along itself and the window sees no change. So only motion across the edge can be measured. That is the **aperture problem**.' },
      // OLD:
      // { topic: 'The structure tensor', ref: 'The structure tensor', hold: K.truckStop + 24,
        // focus: { kind: 'tensor', at: { auto: 'corner', region: TRUCK }, title: 'The structure tensor', body: R`The ellipse shows how strongly brightness changes in each direction inside {{corner|this window}}.` },
        // math: R`$H = \sum_{\mathcal{W}} \nabla I\,\nabla I^\top = \sum_{\mathcal{W}} \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix}$, eigenvalues $\lambda_1 \ge \lambda_2$.`,
        // speaker: 'tomasi', text: 'To test a window, gather all its gradients into one small matrix, the **structure tensor**. Its two eigenvalues say how strongly brightness changes in the strongest and in the weakest direction.' },
      { topic: 'The structure tensor', ref: 'The structure tensor', hold: K.truckStop + 24,
        focus: { kind: 'tensor', at: { auto: 'corner', region: TRUCK }, title: 'The structure tensor', body: R`The ellipse shows how strongly brightness changes in each direction inside {{corner|this window}}.` },
        math: R`$H = \sum_{\mathcal{W}} \nabla I\,\nabla I^\top = \sum_{\mathcal{W}} \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix}$, eigenvalues $\lambda_1 \ge \lambda_2$.`,
        speaker: 'tomasi', text: 'A window is trackable only if its brightness changes in two different directions. To test that, we collect all the brightness gradients in the window into one small matrix, the **structure tensor**.' },
      { topic: 'Flat, edge, corner', ref: 'Flat, edge, corner', hold: K.truckStop + 24, speaker: 'tomasi', text: 'Its two eigenvalues tell you how strongly brightness changes in the strongest direction, and in the weakest. If both are small, the patch is flat. If one is large and one is small, it is an edge. If both are large, it is a corner.' },
      { speaker: 'wren', text: 'Why does a corner work when an edge doesn\'t?' },
      // OLD:
      // { topic: 'Flat, edge, corner', ref: 'Flat, edge, corner', hold: K.truckStop + 24,
        // focus: { kind: 'tensorlab', widget: 'structure-tensor', at: { auto: 'corner', region: TRUCK }, title: 'Try it: flat, edge or corner?', body: 'Pick a kind of point, then change the **window** or the **threshold** and watch the two eigenvalues.' },
        // math: R`Shi–Tomasi: keep if $\lambda_{\min} > \tau$. Harris: $R = \det H - k\,(\operatorname{tr} H)^2$.`,
        // speaker: 'tomasi', text: 'Both small: a flat patch. One large: an edge. Both large: a corner, the only kind you can follow in every direction. So keep a window only when its smaller eigenvalue is large. The tracker will rely on that same matrix later.', event: { hangup: true } },
      { hold: K.truckStop + 24,
        focus: { kind: 'tensorlab', widget: 'structure-tensor', at: { auto: 'corner', region: TRUCK }, title: 'Try it: flat, edge or corner?', body: 'Pick a kind of point, then change the **window** or the **threshold** and watch the two eigenvalues.' },
        math: R`Shi–Tomasi: keep if $\lambda_{\min} > \tau$. Harris: $R = \det H - k\,(\operatorname{tr} H)^2$.`,
        speaker: 'tomasi', text: 'A corner changes the window whichever way you slide it, so the shift is pinned down in both directions. An edge pins down only one. So we keep a point only when the smaller eigenvalue is large enough. Remember this matrix. It comes back when we track. Try it: Now click Flat, Edge, then Corner in the panel: each dot on the right is one pixel\'s gradient, and watch the smaller eigenvalue λ₂ jump from near zero to large at a corner.', say: 'A corner changes the window whichever way you slide it, so the shift is pinned down in both directions. An edge pins down only one. So we keep a point only when the smaller eigenvalue is large enough. Remember this matrix. It comes back when we track. Try it: Now click Flat, Edge, then Corner in the panel: each dot on the right is one pixel\'s gradient, and watch the smaller eigenvalue, lambda two, jump from near zero to large at a corner.', event: { hangup: true } },
      // OLD:
      // { topic: 'Detecting good features', ref: 'Harris vs. Shi–Tomasi', hold: K.truckStop + 24,
        // focus: { kind: 'heatmap', spacing: true, title: 'Shi–Tomasi response', body: R`{{heat|Colour}} = $\lambda_{\min}$ of each pixel's window. Corners are the brightest peaks, kept a minimum distance apart.` },
        // speaker: 'wren', text: 'I\'m re-detecting with that rule. Points land on the wheels and corners, and none on the plain panel.' },
      { topic: 'Detecting good features', ref: 'Harris vs. Shi–Tomasi detectors', hold: K.truckStop + 24,
        focus: { kind: 'heatmap', spacing: true, title: 'Shi–Tomasi response', body: R`{{heat|Colour}} = $\lambda_{\min}$ of each pixel's window. Corners are the brightest peaks, kept a minimum distance apart.` },
        speaker: 'wren', text: 'Re-detecting with that rule, my points land on the wheels and corners, and none on the blank panel.' },
    ],
    notebook: nb_wall,
    widget: 'structure-tensor',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'sprint',
    index: 3,
    title: 'Large motion: pyramids and track checks',
    short: 'Pyramids & checks',
    icon: 'pyramid',
    place: 'Crossing Canal Street',
    scene: 'sprint',
    sceneAlt: 'The walk signal changes and the robot dashes across Canal Street with a few pedestrians, jolting over the curb. Near the edges of the view, points jump many pixels per frame; many dots vanish and new ones appear.',
    status: 'outline',
    clip: SPRINT,
    failure: {
      title: 'What if points move too far?',
      text: 'When the displacement between frames is large, the linear approximation fails and tracks are lost.',
    },
    dialogue: [
      // OLD:
      // { topic: 'Motion too large to linearise', ref: 'Image pyramids: coarse-to-fine tracking', speaker: 'wren', text: 'I\'m crossing Canal Street fast, and I\'m losing tracks. I\'m calling Dr Kanade.', event: { call: 'kanade' } },
      { topic: 'Motion too large to linearise', ref: 'Image pyramids: coarse-to-fine tracking', speaker: 'wren', text: 'I\'m hurrying across Canal Street and my points keep getting lost. Why, Dr Kanade?', event: { call: 'kanade' } },
      // OLD:
      // { topic: 'Image pyramids', ref: 'Image pyramids: coarse-to-fine tracking', hold: K.sprintStart + 26,
        // focus: { kind: 'pyramidlab', widget: ['pyramid-synth', 'pyramid'], at: { track: 'fastest' }, title: 'Try it: how far can one step reach?', body: R`Drag **frame gap** to make this point move farther, and **pyramid levels** to see how coarser levels shrink the shift.` },
        // math: R`At level $\ell$ the shift is $\mathbf{d}/2^{\ell}$. Solve at the top, then start the next level from $2\mathbf{d}^{\ell+1}$ and refine.`,
        // speaker: 'kanade', text: 'Points now jump too far for one linear step. So shrink the image by half a few times: an eight-pixel jump becomes one pixel at the coarsest level. Solve there first, then refine level by level.', event: { hangup: true } },
      { topic: 'Image pyramids', ref: 'Image pyramids: coarse-to-fine tracking', hold: K.sprintStart + 26,
        focus: { kind: 'pyramidlab', widget: ['pyramid-synth', 'pyramid'], at: { track: 'fastest' }, title: 'Try it: how far can one step reach?', body: R`Drag **frame gap** to make this point move farther, and **pyramid levels** to see how coarser levels shrink the shift.` },
        math: R`At level $\ell$ the shift is $\mathbf{d}/2^{\ell}$. Solve at the top, then start the next level from $2\mathbf{d}^{\ell+1}$ and refine.`,
        speaker: 'kanade', text: 'You\'ve broken the small-motion assumption. One linear step only works for about a pixel. Look at the panel. At the starting setting, this point jumps about thirteen pixels, and a single level misses by the full thirteen. Shrink the picture and the motion shrinks with it. Drag pyramid levels and watch the pyramid land on the right answer. So we solve at the top, where motion is small, then refine level by level.', event: { hangup: true } },
      // OLD:
      // { speaker: 'wren', text: 'The pyramid keeps up, but some of my tracks are now wrong. I\'m calling Dr Tomasi.', event: { call: 'tomasi' } },
      { speaker: 'wren', text: 'The pyramid keeps up, but some of my tracks are still wrong. Dr Tomasi, how do I catch them?', event: { call: 'tomasi' } },
      // OLD:
      // { topic: 'The forward–backward check', ref: 'The forward–backward test and re-detection',
        // focus: { kind: 'fb', title: 'Forward–backward error', body: R`{{good|Ring}} radius = how far a point misses its start after tracking forward and back. {{lost|Red ×}}: dropped.` },
        // math: R`$e_{FB} = \|\mathbf{x}_t - \tilde{\mathbf{x}}_t\|$, where $\tilde{\mathbf{x}}_t$ is $\mathbf{x}_t$ tracked to $t{+}1$ and back. Drop if $e_{FB} > 1$ px.`,
        // speaker: 'tomasi', text: 'Track each point forward, then back again. If it doesn\'t return to within about a pixel, drop it. The error number at the top of your screen is that round-trip distance, averaged over the tracks you keep.', event: { hangup: true } },
      { topic: 'The forward–backward check', ref: 'The forward–backward test and re-detection',
        focus: { kind: 'fb', title: 'Forward–backward error', body: R`{{good|Ring}} radius = how far a point misses its start after tracking forward and back. {{lost|Red ×}}: dropped.` },
        math: R`$e_{FB} = \|\mathbf{x}_t - \tilde{\mathbf{x}}_t\|$, where $\tilde{\mathbf{x}}_t$ is $\mathbf{x}_t$ tracked to $t{+}1$ and back. Drop if $e_{FB} > 1$ px.`,
        speaker: 'tomasi', text: 'Track each point forward, then back. A good match is reversible, so it should return to where it started. The ring shows how far it misses. The point that gets a red cross is dropped. The number at the top is the average round trip over the tracks, that is what we keep.', event: { hangup: true } },
    ],
    notebook: nb_sprint,
    widget: ['pyramid-synth', 'pyramid'],
  },

  // ---------------------------------------------------------------------------
  {
    id: 'corridor',
    index: 4,
    title: 'Lucas–Kanade tracking',
    short: 'Lucas–Kanade',
    icon: 'lk',
    place: 'Canal Street, by the park fence',
    scene: 'corridor',
    sceneAlt: 'Across Canal Street, the robot rolls along the sidewalk beside the black railings of Seward Park, with parked cars and storefronts across the road. Dozens of corner dots slide smoothly across the frame, each keeping its identity.',
    status: 'written',
    clip: ALONG_FENCE,
    failure: {
      title: 'Where exactly did each corner go?',
      text: 'Detecting corners does not say which corner is which. Each corner must be followed from frame to frame, to a fraction of a pixel.',
    },
    dialogue: [
      // OLD:
      // { topic: 'From detecting to tracking', ref: 'Tracking as image alignment', speaker: 'wren', text: 'The pyramid gets me close. But to follow each corner exactly, frame after frame, I need more. I\'m calling Dr Kanade.', event: { call: 'kanade' } },
      { topic: 'From detecting to tracking', ref: 'Tracking as image alignment', speaker: 'wren', text: 'The pyramid gets me close, but I want each corner exactly, frame after frame. Dr Kanade, how can I do it?', event: { call: 'kanade' } },
      // OLD:
      // { topic: 'Tracking as image alignment', ref: 'Tracking as image alignment', hold: LK_FRAME,
        // focus: { kind: 'window', at: { track: 'auto', near: [300, 215] }, title: 'Template T', body: 'The patch in {{focus|this window}} from the previous frame. Find the shift that makes the new frame match it.' },
        // math: R`Find $\mathbf{p}$ minimising $E(\mathbf{p}) = \sum_{\mathbf{x}} \big[I(\mathbf{x} + \mathbf{p}) - T(\mathbf{x})\big]^2$.`,
        // speaker: 'kanade', text: 'Treat it as alignment. The patch around the corner is a template. Find the shift that makes the new frame match it, measured by the sum of squared differences.' },
      { topic: 'Tracking as image alignment', ref: 'Tracking as image alignment', hold: LK_FRAME,
        focus: { kind: 'window', at: { track: 'auto', near: [300, 215] }, title: 'Template T', body: 'The patch in {{focus|this window}} from the previous frame. Find the shift that makes the new frame match it.' },
        speaker: 'kanade', text: 'Treat it as alignment. The patch in this window, from the previous frame, is a template T.' },
      { hold: LK_FRAME,
        math: R`Find $\mathbf{p}$ minimising $E(\mathbf{p}) = \sum_{\mathbf{x}} \big[I(\mathbf{x} + \mathbf{p}) - T(\mathbf{x})\big]^2$.`,
        speaker: 'kanade', text: 'Find the shift that makes the new frame match it, which is measured by the sum of squared differences.' },
      // OLD:
      // { topic: 'Solving H Δp = b', ref: 'Deriving H Δp = b', hold: LK_FRAME,
        // focus: { kind: 'lk', at: { track: 'auto', near: [300, 215] }, lag: 2, title: 'Lucas–Kanade on this corner (real pixels)', body: R`{{muted|Dashed}}: template. {{focus|Dots}}: each step. {{good|Green}}: result.` },
        // math: R`Linearise around $\mathbf{p}$: $\;H\,\Delta\mathbf{p} = \mathbf{b}$, $\;H = \sum \nabla I\,\nabla I^\top$, $\;\mathbf{b} = \sum \nabla I\,[T(\mathbf{x}) - I(\mathbf{x}{+}\mathbf{p})]$.`,
        // speaker: 'kanade', text: 'Instead of trying every shift, linearise around the current guess, for example the pyramid\'s. That gives a small two-by-two system, with the same matrix as Dr Tomasi\'s test. That is why corners are easy to track.' },
      { topic: 'Solving H Δp = b', ref: 'One step: H Δp = b', hold: LK_FRAME,
        math: R`Linearise around $\mathbf{p}$: $\;H\,\Delta\mathbf{p} = \mathbf{b}$, $\;H = \sum \nabla I\,\nabla I^\top$, $\;\mathbf{b} = \sum \nabla I\,[T(\mathbf{x}) - I(\mathbf{x}{+}\mathbf{p})]$.`,
        speaker: 'kanade', text: 'Instead of trying every shift, approximate the image as a straight line around the current guess. That gives a tiny two-by-two system.' },
      { hold: LK_FRAME,
        focus: { kind: 'lk', at: { track: 'auto', near: [300, 215] }, lag: 2, title: 'Lucas–Kanade on this corner (real pixels)', body: R`{{muted|Dashed}}: template. {{focus|Dots}}: each step. {{good|Green}}: result.` },
        speaker: 'kanade', text: 'Its matrix is the very one from Dr Tomasi\'s test. That is why corners are easy to track. Watch the dots: each is one step, and green is the result.' },
      // OLD:
      // { topic: 'Gauss–Newton iterations', ref: 'Gauss–Newton iteration', hold: LK_FRAME,
        // focus: { kind: 'lk', at: { track: 'auto', near: [300, 215] }, lag: 2, startOffset: [1.2, -0.9], inset: true, title: 'Step by step', body: R`Started from a deliberately wrong guess, 1.5 px from the answer. Watch the error image fade.` },
        // math: R`Repeat $\mathbf{p} \leftarrow \mathbf{p} + \Delta\mathbf{p}$ until $\|\Delta\mathbf{p}\| < 0.01$ px. Values between pixels come from **bilinear interpolation**, so $\mathbf{p}$ is sub-pixel.`,
        // speaker: 'kanade', text: 'One step lands close, not exactly. So repeat: move, resample, solve again. Three or four steps are usually enough, and because we sample between pixels, the answer is accurate to a fraction of a pixel.', event: { hangup: true } },
      { topic: 'Gauss–Newton iterations', ref: 'Gauss–Newton iteration', hold: LK_FRAME,
        focus: { kind: 'lk', at: { track: 'auto', near: [300, 215] }, lag: 2, startOffset: [1.2, -0.9], inset: true, title: 'Step by step', body: R`Started from a deliberately wrong guess, 1.5 px from the answer. Watch the error image fade.` },
        math: R`Repeat $\mathbf{p} \leftarrow \mathbf{p} + \Delta\mathbf{p}$ until $\|\Delta\mathbf{p}\| < 0.01$ px. Values between pixels come from **bilinear interpolation**, so $\mathbf{p}$ is sub-pixel.`,
        speaker: 'kanade', text: 'This run starts from a deliberately wrong guess, one and a half pixels off. Watch the error image fade as we repeat. Why not stop after one step? Because the picture isn\'t truly a straight line, so one step only gets close. After three or four steps we\'re within a fraction of a pixel.', event: { hangup: true } },
      // OLD:
      // { topic: 'KLT tracking, live', ref: 'Gauss–Newton iteration', focus: { kind: 'flow', at: { track: 'auto', near: [300, 215] }, lag: 6, scale: 4, title: 'Same corner, every frame', body: 'The {{focus|arrow}} follows one corner. Its ID never changes while it stays in view.' },
        // speaker: 'wren', text: 'Now I\'m tracking dozens of corners, each keeping its own ID from frame to frame.' },
      { topic: 'KLT tracking, live', ref: 'Knowing when to give up',
        focus: { kind: 'flow', at: { track: 'auto', near: [300, 215] }, lag: 6, scale: 4, title: 'Same corner, every frame', body: 'The {{focus|arrow}} follows one corner. Its ID never changes while it stays in view.' },
        speaker: 'wren', text: 'Now I\'m tracking dozens of corners. This arrow follows one, and its ID never changes while it stays in view.' },
    ],
    notebook: nb_corridor,
    widget: 'lk-iterations',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'crowd',
    index: 5,
    title: 'The KLT pipeline',
    short: 'KLT pipeline',
    icon: 'pipeline',
    place: 'Seward Park',
    scene: 'crowd',
    sceneAlt: 'The robot rolls along the hexagonal-paver paths of Seward Park under London plane trees. People cross ahead, a jogger passes, and points keep leaving and entering the view, yet the tracked count stays near one hundred.',
    status: 'written',
    clip: ch(5),
    failure: {
      title: 'How is the tracker organised?',
      text: 'Points leave the view and fail checks, yet about a hundred tracks remain: a three-step loop runs on every frame.',
    },
    dialogue: [
      // OLD:
      // { topic: 'Keeping a hundred points alive', ref: 'The KLT loop', speaker: 'wren', text: 'People cross my view and points leave the frame, yet I keep about a hundred tracks. How? I\'m calling Dr Tomasi.', event: { call: 'tomasi' } },
      { topic: 'Keeping a hundred points alive', ref: 'The KLT loop', loop: true, speaker: 'wren', text: 'People cross my view and points leave the frame, yet I keep about a hundred tracks. How am I capable of that, Dr Tomasi?', event: { call: 'tomasi' } },
      // OLD:
      // { topic: 'Step 1 · Detect', ref: 'One frame of the loop', focus: { kind: 'heatmap', spacing: true, title: 'Detect', body: R`Strongest corners ({{heat|colour}}) first, a minimum distance from existing tracks ({{muted|dashed circles}}).` },
        // speaker: 'tomasi', text: 'Every frame runs the same four-step loop. First, **detect**: take the strongest corners, spaced apart.' },
      { topic: 'Step 1 · Detect', ref: 'One frame of the loop', loop: 'detect',
        focus: { kind: 'heatmap', spacing: true, title: 'Detect', body: R`Strongest corners ({{heat|colour}}) first, a minimum distance from existing tracks ({{muted|dashed circles}}).` },
        speaker: 'tomasi', text: 'Every frame runs the same four-step loop. First, **detect**: take the strongest corners, shown in color. They must stay a minimum distance from existing tracks.' },
      // { loop: 'detect',
      //   focus: { kind: 'heatmap', spacing: true, title: 'Detect', body: R`Strongest corners ({{heat|colour}}) first, a minimum distance from existing tracks ({{muted|dashed circles}}).` },
      //   speaker: 'tomasi', text: 'They must stay a minimum distance from existing tracks, the dashed circles, so they don\'t bunch up.' },
      // OLD:
      // { topic: 'Step 2 · Track', ref: 'The KLT loop', focus: { kind: 'flowfield', lag: 4, scale: 3, title: 'Track', body: 'Every {{focus|arrow}} is one track\'s shift from pyramidal Lucas–Kanade.' },
        // speaker: 'tomasi', text: 'Second, **track** each one into the next frame with pyramidal Lucas–Kanade.' },
      { topic: 'Step 2 · Track', ref: 'One frame of the loop', loop: 'track',
        focus: { kind: 'flowfield', lag: 4, scale: 3, title: 'Track', body: 'Every {{focus|arrow}} is one track\'s shift from pyramidal Lucas–Kanade.' },
        speaker: 'tomasi', text: 'Second, **track**: every arrow is one point\'s shift into the next frame, found with pyramidal Lucas–Kanade.' },
      // OLD:
      // { topic: 'Step 3 · Verify', ref: 'The KLT loop', hold: K.parkStart + 325, focus: { kind: 'fb', title: 'Verify', body: R`{{good|Ring}} radius = forward–backward error. Failed tracks are dropped ({{lost|red ×}}).` },
        // speaker: 'tomasi', text: 'Third, **verify**: drop any track that fails the forward–backward check or stops being a corner.' },
      { topic: 'Step 3 · Verify', ref: 'One frame of the loop', loop: 'verify', hold: K.parkStart + 325,
        focus: { kind: 'fb', title: 'Verify', body: R`{{good|Ring}} radius = forward–backward error. Failed tracks are dropped ({{lost|red ×}}).` },
        speaker: 'tomasi', text: 'Third, **verify**: a bigger ring means a bigger forward–backward error. A failed track gets a red cross and is dropped, and so does one that stopped being a good corner.' },
      // OLD:
      // { topic: 'Step 4 · Replenish', ref: 'One frame of the loop', hold: K.parkStart + 345, focus: { kind: 'replenish', lag: 12, title: 'Replenish', body: 'Last half second: {{lost|red ×}} where tracks were lost, {{fresh|green rings}} where new corners were found.' },
        // speaker: 'tomasi', text: 'Fourth, **replenish**: detect new corners wherever tracks were lost. A lost point never gets its old ID back.', event: { hangup: true } },
      // { topic: 'Step 4 · Replenish', ref: 'One frame of the loop', loop: 'replenish', hold: K.parkStart + 345,
      //   focus: { kind: 'replenish', lag: 12, title: 'Replenish', body: 'Last half second: {{lost|red ×}} where tracks were lost, {{fresh|green rings}} where new corners were found.' },
      //   speaker: 'tomasi', text: 'Fourth, **replenish**: red crosses show where tracks were lost, and green rings show new corners. A lost point never gets its old ID back. Read the article to follow the math.', event: { hangup: true } },
    ],
    notebook: nb_crowd,
    widget: 'pipeline-inspector',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'docking',
    index: 6,
    title: 'What KLT is used for',
    short: 'Applications',
    icon: 'target',
    place: 'The Seward Park dock',
    scene: 'docking',
    sceneAlt: 'A teal “WREN DOCK” post with a black-and-white checkerboard target stands on the park path. The robot slows and stops in front of it, the checkerboard’s inner corners tracked.',
    status: 'outline',
    clip: ch(6),
    failure: {
      title: 'What are tracks used for?',
      text: 'Tracks are measurements. Robots turn them into motion estimates, collision warnings and steering commands.',
    },
    dialogue: [
      // OLD:
      // { topic: 'Tracks as a tool', ref: 'Why KLT suits these jobs', speaker: 'wren', text: 'I can see my dock. Dr Kanade, what are these tracks good for?', event: { call: 'kanade' } },
      { topic: 'Tracks as a tool', ref: 'Why KLT suits these jobs', speaker: 'wren', text: 'I can see my dock! Dr Kanade, I’m tracking all these points now. How can I actually use them?', event: { call: 'kanade' } },
      // OLD:
      // { topic: 'Visual odometry', ref: 'Visual odometry (outline)', focus: { kind: 'flow', at: { track: 'auto' }, lag: 6, scale: 4, title: 'Motion from tracks', body: 'Fit one camera motion to all tracks at once. The {{focus|arrow}} is one of them.' },
        // speaker: 'kanade', text: 'First, **odometry**: fit one camera motion to all the tracks, and you get your path without GPS.' },
      { topic: 'Visual odometry', ref: 'Visual odometry (outline)',
        focus: { kind: 'flow', at: { track: 'auto' }, lag: 6, scale: 4, title: 'Motion from tracks', body: 'Fit one camera motion to all tracks at once. The {{focus|arrow}} is one of them.' },
        speaker: 'kanade', text: 'First, **odometry**. One single camera motion has to explain all the arrows at once. Add it up frame by frame and you have your path.' },
      // OLD:
      // { topic: 'Time-to-contact', ref: 'Expansion and time-to-contact (outline)',
        // math: R`Time to contact $\tau = r / \dot r$: image size over its growth rate. No distance or speed needed.`,
        // speaker: 'kanade', text: 'Second, **warnings**: when something grows in your view, how fast it grows tells you how soon you\'ll meet it, without knowing its distance.' },
      { topic: 'Time-to-contact', ref: 'Expansion and time-to-contact (outline)',
        math: R`Time to contact $\tau = r / \dot r$: image size over its growth rate. No distance or speed needed.`,
        speaker: 'kanade', text: 'Second, **time-to-contact**. When something grows in your view, its size divided by its growth rate gives you the time for you reach it. You need neither its distance nor your speed.' },
      // OLD:
      // { topic: 'Visual servoing', ref: 'Image-based visual servoing (outline)', focus: { kind: 'tracks', title: 'Corner farm', body: R`Every inner corner of the target is a strong corner, so each gets a {{tracked|dot}}.` },
        // speaker: 'kanade', text: 'Third, **docking**: track the target\'s corners and steer until they sit where they should. That is what you\'re doing now.', event: { hangup: true } },
      { topic: 'Visual servoing', ref: 'Image-based visual servoing (outline)',
        focus: { kind: 'tracks', title: 'Corner farm', body: R`Every inner corner of the target is a strong corner, so each gets a {{tracked|dot}}.` },
        speaker: 'kanade', text: 'Third, **Visual servoing**. Every inner corner of this target is a strong corner, so each gets a dot.' },
      { speaker: 'kanade', text: 'Steer until the dots sit where they should in the image. That\'s what you\'re doing now.', event: { hangup: true } },
      // OLD:
      // { speaker: 'wren', text: 'Corners lined up. Docked and charging. Order 0428 delivered.' },
      { speaker: 'wren', text: 'Corners lined up. Egg tarts delivered.' },
    ],
    notebook: nb_docking,
    widget: 'servo',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'debrief',
    index: 7,
    title: 'Strengths, limits and what came next',
    short: 'Debrief',
    icon: 'notebook',
    place: 'Docked in Seward Park',
    scene: 'debrief',
    sceneAlt: 'The robot sits at its dock in Seward Park, facing the checkerboard target.',
    status: 'outline',
    clip: ch(7),
    failure: {
      title: 'How good is KLT?',
      text: 'The method in one paragraph, its strengths and limits, and what came after it.',
    },
    dialogue: [
      // OLD:
      // { topic: 'Recap', ref: 'Strengths', speaker: 'wren', text: 'Delivered, with no GPS. KLT in one breath: follow small windows at corners, refine each shift to a fraction of a pixel, use pyramids for big jumps, and check every track.' },
      { topic: 'Recap', ref: 'Strengths', speaker: 'wren', text: 'Delivered, with no GPS. In conclusion, follow small windows at corners, refine each shift to a fraction of a pixel, use pyramids for big jumps, and check every track.' },
      // OLD:
      // { topic: 'Strengths and limits', ref: 'Limits', speaker: 'wren', text: 'It is fast and precise, but it needs small motion and steady lighting, and it forgets a point once it is lost. The Article shows what came next.' },
      { topic: 'Strengths and limits', ref: 'Limits', speaker: 'wren', text: 'KLT only works while its three assumptions hold: steady brightness, small motion, and neighbours that move together. Break one and the tracks drift.' },
      { speaker: 'wren', text: 'Newer methods listed in the article overcome these limitations' },
    ],
    notebook: nb_debrief,
    widget: null,
  },
];

export const references = [
  { label: 'Kanade–Lucas–Tomasi feature tracker', source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Kanade%E2%80%93Lucas%E2%80%93Tomasi_feature_tracker' },
  { label: 'KLT tracker', source: 'cv-learn.com', url: 'https://cv-learn.com' , note: 'TODO: exact article URL' },
  { label: 'Optical flow', source: 'cv-learn.com', url: 'https://cv-learn.com', note: 'TODO: exact article URL' },
  { label: '16-385 Computer Vision: Tracking (KLT) slides', source: 'Carnegie Mellon University', url: 'https://www.cs.cmu.edu/~16385/s17/Slides/15.1_Tracking__KLT.pdf' },
  { label: 'KLT-Feature-Tracking', source: 'ZheyuanXie (GitHub)', url: 'https://github.com/ZheyuanXie/KLT-Feature-Tracking' },
  { label: 'An Iterative Image Registration Technique with an Application to Stereo Vision', source: 'B. D. Lucas & T. Kanade, IJCAI 1981' },
  { label: 'Detection and Tracking of Point Features', source: 'C. Tomasi & T. Kanade, CMU-CS-91-132, 1991' },
  { label: 'Good Features to Track', source: 'J. Shi & C. Tomasi, CVPR 1994' },
  { label: 'A Combined Corner and Edge Detector', source: 'C. Harris & M. Stephens, Alvey Vision Conference 1988' },
  { label: 'Lucas-Kanade 20 Years On: A Unifying Framework', source: 'S. Baker & I. Matthews, IJCV 2004' },
  { label: 'Pyramidal Implementation of the Lucas Kanade Feature Tracker', source: 'J.-Y. Bouguet, Intel, 2000' },
  { label: 'Forward-Backward Error: Automatic Detection of Tracking Failures', source: 'Z. Kalal, K. Mikolajczyk & J. Matas, ICPR 2010' },
  { label: 'Visual Servo Control, Part I: Basic Approaches', source: 'F. Chaumette & S. Hutchinson, IEEE RAM 2006' },
  { label: 'Determining Optical Flow', source: 'B. K. P. Horn & B. G. Schunck, Artificial Intelligence 17, 1981' },
  { label: 'FlowNet: Learning Optical Flow with Convolutional Networks', source: 'A. Dosovitskiy et al., ICCV 2015' },
  { label: 'PWC-Net: CNNs for Optical Flow Using Pyramid, Warping, and Cost Volume', source: 'D. Sun et al., CVPR 2018' },
  { label: 'RAFT: Recurrent All-Pairs Field Transforms for Optical Flow', source: 'Z. Teed & J. Deng, ECCV 2020', url: 'https://arxiv.org/abs/2003.12039' },
  { label: 'Particle Video Revisited: Tracking Through Occlusions Using Point Trajectories', source: 'A. W. Harley, Z. Fang & K. Fragkiadaki, ECCV 2022', url: 'https://arxiv.org/abs/2204.04153' },
  { label: 'TAP-Vid: A Benchmark for Tracking Any Point in a Video', source: 'C. Doersch et al., NeurIPS 2022 Datasets and Benchmarks', url: 'https://arxiv.org/abs/2211.03726' },
  { label: 'TAPIR: Tracking Any Point with Per-Frame Initialization and Temporal Refinement', source: 'C. Doersch et al., ICCV 2023' },
  { label: 'CoTracker: It is Better to Track Together', source: 'N. Karaev et al., ECCV 2024', url: 'https://arxiv.org/abs/2307.07635' },
  { label: 'SuperPoint: Self-Supervised Interest Point Detection and Description', source: 'D. DeTone, T. Malisiewicz & A. Rabinovich, CVPR Workshops 2018' },
  { label: 'SuperGlue: Learning Feature Matching with Graph Neural Networks', source: 'P.-E. Sarlin et al., CVPR 2020' },
  { label: 'LightGlue: Local Feature Matching at Light Speed', source: 'P. Lindenberger, P.-E. Sarlin & M. Pollefeys, ICCV 2023' },
  { label: 'A Multi-State Constraint Kalman Filter for Vision-aided Inertial Navigation', source: 'A. I. Mourikis & S. I. Roumeliotis, ICRA 2007' },
  { label: 'VINS-Mono: A Robust and Versatile Monocular Visual-Inertial State Estimator', source: 'T. Qin, P. Li & S. Shen, IEEE T-RO 2018' },
  { label: 'ORB-SLAM: A Versatile and Accurate Monocular SLAM System', source: 'R. Mur-Artal, J. M. M. Montiel & J. D. Tardós, IEEE T-RO 2015' },
  { label: 'EKLT: Asynchronous Photometric Feature Tracking Using Events and Frames', source: 'D. Gehrig, H. Rebecq, G. Gallego & D. Scaramuzza, IJCV 2020' },
];

export const disclaimer = 'Dr Lucas, Dr Kanade and Dr Tomasi are fictional characters named in honour of the researchers behind the KLT tracker. Their lines are written for this story and are not quotes. The footage is a Three.js simulation of the real route from Happy Star Bakery to Seward Park: street layout and buildings from OpenStreetMap (© OpenStreetMap contributors, ODbL), photo textures CC0 from Poly Haven; storefront interiors and generic signs are invented.';
