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
//   failure: { title, text },              // the chapter's problem (flight-log brief)
//   dialogue: [{ speaker, text, math?, event?, hold?, focus?, say?, topic?, ref? }],
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
//   notebook: [{ title, level: 'story' | 'math', body }],
//   widget: widgetId (see js/widgets/registry.js)
// }
//
// Markup in text/body: blank line = paragraph, $inline$, $$display$$,
// **bold**, *italic*, lines starting "- " = bullets, "1. " = numbered,
// "> " = callout, lines starting "|" = table rows (first row = header).
// Dialogue `text` supports the same inline markup ($, **, *).
// =============================================================================

import { ROUTE } from './route.js';

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
  lucas: { name: 'Dr. Lucas', role: 'Optical flow', initials: 'L', accent: 'var(--c-lucas)',
    voice: { id: '', brief: 'warm, energetic teacher', stability: 0.45, similarity: 0.75, style: 0.3 } },
  kanade: { name: 'Dr. Kanade', role: 'Image alignment', initials: 'K', accent: 'var(--c-kanade)',
    voice: { name: 'Kanade', id: '', brief: 'calm, mature professor; light Japanese accent', stability: 0.6, similarity: 0.75, style: 0.15 } },
  tomasi: { name: 'Dr. Tomasi', role: 'Feature selection', initials: 'T', accent: 'var(--c-tomasi)',
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
    src: 'assets/clips/chinatown.mp4',
    tracks: 'assets/tracks/chinatown.json.gz',
  },
};

const ch = (i) => ({ id: 'chinatown', start: ROUTE.chapters[i][0], end: ROUTE.chapters[i][1] });

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
      { topic: 'Mission briefing', ref: 'The tracking problem', hold: K.tartsView, speaker: 'wren', text: 'Good morning. I\'m Wren, a sidewalk delivery robot. I\'m taking this box of egg tarts to my dock in Seward Park, navigating with my camera alone.' },
      { topic: 'Displacement between frames', ref: 'Why not just match descriptors?', speaker: 'wren', text: 'My camera records 24 frames per second. Between two consecutive frames, most points in the scene move only a few pixels. For every point I can see, I estimate that small displacement: where the point was in the previous frame and where it is now. From those displacements I can work out how I moved.',
        focus: { kind: 'flow', at: { track: 'auto' }, lag: 1, scale: 12, title: R`One point, one frame`, body: R`The {{focus|arrow}} is this point's displacement $\mathbf{d}$ from the previous frame to this one, drawn 12× longer.` },
        math: R`Given frames $I_t$ and $I_{t+1}$ and points $\mathbf{x}_i$, find displacements $\mathbf{d}_i$ such that $I_{t+1}(\mathbf{x}_i + \mathbf{d}_i) \approx I_t(\mathbf{x}_i)$.` },
      { topic: 'Reading the tracks', ref: 'The tracking problem', hold: K.lobbyTurnEnd - 20, focus: [
          { kind: 'tracks', title: 'Tracks', body: 'Each {{tracked|dot}} is one feature I follow from frame to frame. The thin {{tail|tail}} shows where it was over the last 10 frames.' },
        ],
        speaker: 'wren', text: 'The dots on the screen are the points I am following. A point followed from frame to frame is called a **track**. The Kanade–Lucas–Tomasi tracker, or KLT, is a method for creating and maintaining these tracks. Right now I am turning in place at the bakery door, so every tail points the same way: rotating the camera shifts the whole image at once.' },
    ],
    notebook: [
      { title: 'The tracking problem', level: 'story', body: R`
A **feature tracker** takes a video and a set of interesting points in the first frame, and returns where each point is in every later frame, until it can no longer follow it.

- **Input:** consecutive frames $I_t, I_{t+1}$ and point locations $\mathbf{x}_i$ in $I_t$.
- **Output:** new locations $\mathbf{x}_i + \mathbf{d}_i$ in $I_{t+1}$, plus a flag saying whether each track is still trustworthy.

The **Kanade–Lucas–Tomasi (KLT)** tracker is the classic answer. It combines three ideas you will meet one per chapter: optical flow (Lucas & Kanade, 1981), iterative image alignment (Lucas & Kanade 1981; Tomasi & Kanade 1991), and choosing points that are *trackable* (Shi & Tomasi, 1994).

![**Figure 1. Sparse optical flow.** KLT tracks on Wren's footage as it turns left at the park entrance. Each arrow is a feature's motion over 6 frames, drawn 4× longer. During a pure rotation every point shifts by about the same amount, near or far; under forward motion (Chapter 6) the arrows would instead fan out from the heading.](assets/figures/flow-field.jpg)` },
      { title: 'Why not just match descriptors?', level: 'story', body: R`
Another way to follow points is to **detect and match** in every frame: find keypoints, describe each with a vector (SIFT, ORB, ...), and match vectors between frames.

KLT takes a different bet: between two consecutive video frames, most points move only a few pixels. How far a point moves depends on the camera, its motion, and the point's depth. For a point at depth $Z$, seen by a camera with focal length $f$ (in pixels) moving sideways at speed $v_\perp$ and recording at a given frame rate,

$$\|\mathbf{d}\| \approx \frac{f\, v_\perp}{Z \cdot \text{fps}}.$$

For this robot ($f \approx 579$ px for a 960 px wide image with a 79° horizontal field of view, $v_\perp = 1.3$ m/s, 24 fps) a point 3 m away moves about 10 px between frames, and a point 1 m away about 30 px. Near points and sideways motion are the hard cases; distant points and points close to the direction of travel move least. So instead of searching the whole image, KLT starts at the old position and *slides* a small patch until it lines up. That bet gives three advantages:

- **Sub-pixel accuracy:** the answer is a continuous shift such as 3.27 px, not a whole pixel.
- **No descriptors:** nothing to compute, store, or match.
- **Speed:** a few small linear solves per point. It runs on microcontrollers.

The price: when motion is large or the image changes appearance, the bet fails. Chapter 4 is about paying that price.` },
      { title: 'Notation used throughout', level: 'math', body: R`
| Symbol | Meaning |
| $I(x, y, t)$ | image brightness at pixel $(x, y)$ and time $t$ |
| $\mathbf{x} = (x, y)^\top$ | a pixel location |
| $\nabla I = (I_x, I_y)^\top$ | spatial gradient, $I_x = \partial I / \partial x$ |
| $I_t$ | temporal derivative, in practice $I(\mathbf{x}, t{+}1) - I(\mathbf{x}, t)$ |
| $\mathbf{d} = (u, v)^\top$ | displacement (flow) of a point between frames |
| $\mathcal{W}$ | a small window (patch) around a feature, e.g. $15 \times 15$ px |
| $T(\mathbf{x})$ | the template: the patch from the earlier frame |

Images are treated as continuous functions; derivatives are approximated with finite differences, and values between pixels with bilinear interpolation.

We write $\mathbf{d} = (u, v)$ for the flow of a point. When tracking is posed as image alignment (Chapter 3), the same displacement is called $\mathbf{p}$, the parameters of a warp.` },
    ],
    widget: 'briefing',
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
      { topic: 'Every point has moved', ref: 'Brightness constancy', speaker: 'wren', text: 'This street has a lot of texture: shop signs, shutters, fire escapes. Every tracked point has moved a little since the last frame. I\'m calling Dr. Kanade.', event: { call: 'lucas' } },
      { topic: 'Brightness constancy', ref: 'Brightness constancy', focus: { kind: 'patches', at: { track: 'auto', near: [700, 150] }, maps: ['prev', 'next'], lag: 1, title: 'Same patch, two frames', body: R`Left: the window around {{focus|this dot}} in the previous frame. Right: the window at the dot's new position. The pixel values barely change.` }, speaker: 'lucas', text: 'Hello, Wren. Everything starts from one assumption: when a point on a surface moves across the image, its brightness stays the same. This is called **brightness constancy**.' },
      { topic: 'Optical flow', ref: 'Brightness constancy', focus: { kind: 'flow', at: { track: 'auto' }, lag: 4, scale: 5, title: 'Optical flow at one point', body: R`The patch around this dot reappears shifted by $(u, v)$. {{focus|Arrow}} magnified 5×.` },
        say: 'As an equation: the image at x plus u, y plus v, in frame t plus one, equals the image at x, y in frame t. The pixel at x, y in one frame appears at x plus u, y plus v in the next frame, with the same brightness. The displacement u, v of each pixel is called the optical flow.',
        speaker: 'lucas', text: 'As an equation: $I(x+u,\\,y+v,\\,t+1) = I(x,\\,y,\\,t)$. The pixel at $(x, y)$ in frame $t$ appears at $(x+u, y+v)$ in frame $t+1$ with the same brightness. The displacement $(u, v)$ of each pixel is called the **optical flow**.' },
      { speaker: 'wren', say: 'To find u and v, could I compare the patch at every possible shift? That would be far too slow for every point in every frame.',
        text: 'To find $(u, v)$, could I compare the patch at every possible shift? That would be far too slow for every point in every frame.' },
      { topic: 'The optical flow constraint', ref: 'Linearising: the optical flow constraint', focus: { kind: 'patches', at: { track: 'auto', near: [700, 150] }, maps: ['Ix', 'Iy', 'It'], lag: 1, title: 'The optical flow constraint', body: R`$$I_x u + I_y v + I_t = 0$$ One equation for each pixel, with two unknowns $(u, v)$. Here are the three terms around {{focus|one dot}}.` },
        say: 'There is a faster way, as long as the displacement is small. Approximate the left side with a first order Taylor expansion. The equation becomes linear in u and v: I x times u, plus I y times v, plus I t, equals zero. Here I x and I y are the image gradients in x and y, and I t is the change in brightness between the two frames.',
        speaker: 'lucas', text: 'There is a faster way, as long as the displacement is small. Approximate the left side with a first-order Taylor expansion. The equation becomes linear in $u$ and $v$: $I_x u + I_y v + I_t = 0$. Here $I_x$ and $I_y$ are the image gradients in $x$ and $y$, and $I_t$ is the change in brightness between the two frames.',
        math: R`$I(x{+}u, y{+}v, t{+}1) \approx I(x,y,t) + I_x u + I_y v + I_t$. Setting this equal to $I(x,y,t)$ gives the **optical flow constraint** $\nabla I^\top \mathbf{d} + I_t = 0$.` },
      { topic: 'A one-dimensional example', ref: 'Worked example: a blob moves one pixel', focus: { kind: 'card', title: '1D example', body: R`
| pixel | 1 | 2 | 3 | 4 | 5 |
| $f_1$ | 0 | 0 | 9 | 0 | 0 |
| $f_2$ | 0 | 0 | 0 | 9 | 0 |

True motion: $+1$ pixel.` },
        say: 'Let\'s test it in one dimension. Frame one is zero, zero, zero, nine, zero, zero, zero. Frame two is zero, zero, zero, zero, nine, zero, zero. The bright pixel moved one position to the right, so the true flow is plus one. In one dimension the equation is I x times u plus I t equals zero, so each pixel gives u equals minus I t over I x.',
        speaker: 'lucas', text: 'Let\'s test it in one dimension. Frame one is `0 0 0 9 0 0 0`; frame two is `0 0 0 0 9 0 0`. The bright pixel moved one position to the right, so the true flow is $u = +1$. In one dimension the equation is $I_x u + I_t = 0$, so each pixel gives $u = -I_t / I_x$.' },
      { focus: { kind: 'card', title: 'Ask each pixel alone', body: R`
| pixel | 2 | 3 | 4 |
| $I_x$ | $+4.5$ | $0$ | $-4.5$ |
| $I_t$ | $0$ | $-9$ | $+9$ |
| $u = -I_t / I_x$ | $0$ | ? | $2$ |

Three pixels, three answers. None of them is $+1$.` },
        say: 'Compute it at each pixel. Left of the peak, I x is plus four point five and I t is zero, so u is zero. At the peak, I x is zero, so u is undefined. Right of the peak, I x is minus four point five and I t is plus nine, so u is two. Three pixels give three different answers, and none of them is correct.',
        speaker: 'lucas', text: 'Compute it at each pixel. Left of the peak: $I_x = +4.5$ and $I_t = 0$, so $u = 0$. At the peak: $I_x = 0$, so $u$ is undefined. Right of the peak: $I_x = -4.5$ and $I_t = +9$, so $u = 2$. Three pixels give three different answers, and none of them is correct.' },
      { topic: 'Least squares over a window', ref: 'Least squares over a window', focus: { kind: 'card', title: 'Ask the whole window', body: R`$$u^\star = -\frac{\sum I_x I_t}{\sum I_x^2} = -\frac{-40.5}{40.5} = +1$$ Least squares over the window recovers the true motion.` },
        say: 'One pixel does not contain enough information. The fix is to assume that all pixels in a small window move together, and to solve for the single u that fits all of them best in the least squares sense: u equals minus the sum of I x times I t, divided by the sum of I x squared. That is minus minus forty point five over forty point five, which is plus one: the correct answer. This window based least squares estimate is the core of the Lucas Kanade method.',
        speaker: 'lucas', text: 'One pixel does not contain enough information. The fix is to assume that all pixels in a small window move together, and to solve for the single $u$ that fits all of them best in the least-squares sense: $u = -\\sum I_x I_t \\,/\\, \\sum I_x^2 = -(-40.5)/40.5 = +1$. That is the correct answer. This window-based least-squares estimate is the core of the **Lucas–Kanade method**.',
        math: R`Minimise $E(u) = \sum_{\mathcal{W}} (I_x u + I_t)^2$. Then $dE/du = 2\sum I_x (I_x u + I_t) = 0 \Rightarrow u = -\sum I_x I_t / \sum I_x^2$.` },
      { topic: 'When the linear step holds', ref: 'The three assumptions', speaker: 'lucas', text: 'One limitation to remember: the linear approximation is only accurate when the displacement is small, a few pixels at most. This is why the frame rate matters. At 24 frames per second, points usually move only a few pixels between consecutive frames. When they move more, we need extra tools, which we will meet in Chapter 4.', event: { hangup: true } },
      { topic: 'Optical flow, live', ref: 'The three assumptions', focus: { kind: 'flowfield', lag: 6, scale: 4, title: 'Flow while driving forward', body: 'The {{focus|arrows}} point outward from the spot I am driving toward, and nearby points move faster than distant ones.' },
        speaker: 'wren', text: 'The arrows show each point\'s motion over the last six frames. At the bakery door I turned in place and every point shifted the same way. Now that I am driving forward, the points move outward from the spot I am driving toward, and nearby points move faster than distant ones.' },
    ],
    notebook: [
      { title: 'Brightness constancy', level: 'story', body: R`
Optical flow rests on one assumption: **as a surface point moves through the image, its brightness stays the same.**

$$I(x + u,\; y + v,\; t + 1) = I(x,\; y,\; t)$$

This holds well for matte surfaces under steady light over a short time. It breaks for shiny surfaces (highlights move differently from the surface), flickering or changing lights, auto-exposure jumps, and shadows passing over. Chapter 4 returns to these.` },
      { title: 'Linearising: the optical flow constraint', level: 'math', body: R`
Take a first-order Taylor expansion of the left-hand side around $(x, y, t)$:

$$I(x{+}u, y{+}v, t{+}1) \approx I(x, y, t) + I_x u + I_y v + I_t.$$

Substituting into brightness constancy and cancelling $I(x, y, t)$:

$$I_x u + I_y v + I_t = 0 \quad\Longleftrightarrow\quad \nabla I^\top \mathbf{d} = -I_t.$$

One equation, two unknowns $(u, v)$ per pixel. Chapter 2 explains why this matters.

**Validity:** dropping the higher-order terms is fine only when $\mathbf{d}$ is small relative to the scale over which $\nabla I$ changes. As a rule of thumb, motions above 1–2 px need the pyramid of Chapter 4.` },
      { title: 'Worked example: a blob moves one pixel', level: 'math', body: R`
Frames $f_1 = [0,0,0,9,0,0,0]$ and $f_2 = [0,0,0,0,9,0,0]$, indices $0..6$. Central differences on $f_1$: $I_x[i] = (f_1[i{+}1] - f_1[i{-}1]) / 2$; time difference $I_t[i] = f_2[i] - f_1[i]$.

| $i$ | $I_x$ | $I_t$ | pointwise $u = -I_t/I_x$ | $I_x I_t$ | $I_x^2$ |
| 2 | $+4.5$ | $0$ | $0$ | $0$ | $20.25$ |
| 3 | $0$ | $-9$ | undefined | $0$ | $0$ |
| 4 | $-4.5$ | $+9$ | $2$ | $-40.5$ | $20.25$ |
| others | $0$ | $0$ | undefined | $0$ | $0$ |

Least squares over the window:

$$u^\star = -\frac{\sum I_x I_t}{\sum I_x^2} = -\frac{-40.5}{40.5} = +1.$$

> The exact $+1$ comes partly from the symmetry of this example. In general one linear solve gets *close*, and Chapter 3 iterates to finish the job.` },
      { title: 'Least squares over a window', level: 'math', body: R`
Assume every pixel in a window $\mathcal{W}$ shares the same $\mathbf{d}$. Each pixel contributes one constraint; stack them:

$$A = \begin{bmatrix} I_x(\mathbf{x}_1) & I_y(\mathbf{x}_1) \\ \vdots & \vdots \\ I_x(\mathbf{x}_n) & I_y(\mathbf{x}_n) \end{bmatrix}, \qquad A\,\mathbf{d} = -\begin{bmatrix} I_t(\mathbf{x}_1) \\ \vdots \\ I_t(\mathbf{x}_n) \end{bmatrix}.$$

The least-squares solution satisfies the normal equations

$$\underbrace{A^\top A}_{H}\,\mathbf{d} = \underbrace{-A^\top \mathbf{I}_t}_{\mathbf{b}}, \qquad H = \sum_{\mathcal{W}} \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix}, \quad \mathbf{b} = -\sum_{\mathcal{W}} \begin{bmatrix} I_x I_t \\ I_y I_t \end{bmatrix}.$$

So $H\mathbf{d} = \mathbf{b}$: a $2 \times 2$ system per feature. Whether $H$ can be inverted is the subject of the next chapter.

**Local versus global methods.** Lucas & Kanade (1981) resolve the one-equation, two-unknowns problem *locally*: they assume constant flow inside a small window. In the same year Horn & Schunck (1981) proposed a *global* alternative: they solve for the flow at every pixel at once, adding a smoothness term that penalises differences between neighbouring flow vectors,
$$\min_{u, v} \iint (I_x u + I_y v + I_t)^2 + \alpha^2 \left(\|\nabla u\|^2 + \|\nabla v\|^2\right) dx\, dy.$$
The global method fills in textureless regions (dense flow); the local method gives an answer only where the image has structure, which is exactly what a sparse tracker needs.` },
      { title: 'Computing image gradients', level: 'math', body: R`
Every formula above needs $I_x$, $I_y$ and $I_t$. On a digital image they are estimated with small filters.

- **Central differences:** $I_x \approx \tfrac{1}{2}\,[I(x{+}1, y) - I(x{-}1, y)]$. Simple, but it amplifies pixel noise.
- **Smooth first, then differentiate.** Convolve with a small Gaussian (or use the Sobel or Scharr filters, which combine smoothing and differencing). This suppresses noise and makes the gradient vary smoothly between pixels, which the linearisation relies on.
- **Temporal derivative:** $I_t \approx I_{t+1}(\mathbf{x}) - I_t(\mathbf{x})$. Some implementations average the spatial gradient of both frames for a more symmetric estimate.

The amount of smoothing is a trade-off: more smoothing gives cleaner gradients and a wider range of convergence, less smoothing keeps fine detail and precise localisation.` },
      { title: 'The three assumptions', level: 'story', body: R`
1. **Brightness constancy**: a point looks the same in both frames.
2. **Small motion**: the shift is small enough for the linear approximation.
3. **Spatial coherence**: all pixels in the window move together. This is violated when a window straddles a depth boundary (foreground edge over a far background).

Choose the window size as a trade-off: larger windows average out noise and handle bigger motion, but are more likely to violate coherence.` },
    ],
    widget: 'flow-1d',
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
      { topic: 'Tracks fail on a blank panel', ref: 'The aperture problem', hold: K.truckStop + 24,
        focus: { kind: 'tensor', at: { auto: 'flat', region: TRUCK }, title: 'Blank panel', body: 'Gradients are almost zero in {{flat|this window}}. There is nothing to lock onto.' },
        speaker: 'wren', text: 'A delivery truck has stopped in front of me. Points on its plain side panel drift randomly, and points on its straight edges slide along them. I\'m calling Dr. Tomasi.', event: { call: 'tomasi' } },
      { topic: 'The aperture problem', ref: 'The aperture problem', hold: K.truckStop + 24,
        focus: { kind: 'aperture', at: { auto: 'edge', region: TRUCK }, title: 'The aperture problem', body: '{{good|Across the edge (✓)}} a shift changes what the window sees. {{bad|Along it (?)}} nothing changes, so that motion is invisible.' },
        speaker: 'tomasi', text: 'Hello, Wren. This is the **aperture problem**. Look at a straight edge through a small window. If the edge moves along its own direction, the window looks exactly the same, so that motion cannot be detected. Only motion perpendicular to the edge changes what the window sees.' },
      { topic: 'Normal flow', ref: 'One equation, two unknowns', hold: K.truckStop + 24,
        focus: { kind: 'aperture', at: { auto: 'edge', region: TRUCK }, title: 'Only the normal flow', body: R`$$\mathbf{d}_\perp = -\frac{I_t}{\|\nabla I\|}\,\frac{\nabla I}{\|\nabla I\|}$$ {{good|Green}}: recoverable. {{bad|Red}}: unknown.` },
        say: 'The equation shows the same thing. One pixel gives one equation with two unknowns, u and v. All of its solutions lie on a line. The only component we can recover is the one along the gradient direction, called the normal flow.',
        speaker: 'tomasi', text: 'The equation shows the same thing. One pixel gives one equation, $I_x u + I_y v = -I_t$, with two unknowns, $u$ and $v$. All of its solutions lie on a line. The only component we can recover is the one along the gradient direction, called the **normal flow**.',
        math: R`Normal flow: $\mathbf{d}_\perp = -\dfrac{I_t}{\|\nabla I\|}\,\dfrac{\nabla I}{\|\nabla I\|}$. The tangential component is unobservable.` },
      { topic: 'Pooling a window', ref: 'One equation, two unknowns', hold: K.truckStop + 24,
        focus: { kind: 'tensor', at: { auto: 'edge', region: TRUCK }, title: 'A whole window on an edge', body: 'Every gradient in {{edge|this window}} points the same way, so pooling them still gives one direction.' },
        speaker: 'wren', text: 'But Dr. Kanade told me to use a whole window of pixels, not just one.' },
      { topic: 'The structure tensor', ref: 'The structure tensor', hold: K.truckStop + 24,
        focus: { kind: 'tensor', at: { auto: 'corner', region: TRUCK }, title: 'The structure tensor', body: R`$$H = \sum_{\mathcal{W}} \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix}$$ The ellipse shows how strongly brightness changes in each direction.` },
        say: 'A window only helps if its gradients point in different directions. On an edge, every pixel\'s gradient points the same way, so the extra pixels add no new information. To measure this, sum the outer products of the gradients over the window. This two by two matrix, H, is the structure tensor. Its two eigenvalues tell us how much the brightness changes in the strongest direction and in the weakest direction.',
        speaker: 'tomasi', text: 'A window only helps if its gradients point in different directions. On an edge, every pixel\'s gradient points the same way, so the extra pixels add no new information. To measure this, sum the outer products of the gradients over the window: $H = \\sum \\nabla I\\,\\nabla I^\\top$. This $2\\times2$ matrix is the **structure tensor**. Its two eigenvalues tell us how much the brightness changes in the strongest direction and in the weakest direction.' },
      { topic: 'Flat, edge, corner', ref: 'Flat, edge, corner', hold: K.truckStop + 24,
        focus: [
          { kind: 'tensor', compact: true, at: { auto: 'flat', region: TRUCK }, title: 'Both small' },
          { kind: 'tensor', compact: true, at: { auto: 'edge', region: TRUCK }, title: 'One large, one small' },
          { kind: 'tensor', compact: true, at: { auto: 'corner', region: TRUCK }, title: 'Both large' },
        ],
        speaker: 'tomasi', text: 'There are three cases. Both eigenvalues small: a flat region, like the plain panel, with no usable information. One large and one small: an edge, where motion along the edge cannot be measured. Both large: a corner or a textured region, where motion is constrained in every direction.' },
      { topic: 'Harris vs. Shi–Tomasi', ref: 'Harris vs. Shi–Tomasi', hold: K.truckStop + 24,
        focus: { kind: 'tensor', at: { auto: 'corner', region: TRUCK }, title: 'Two scores for the same H', body: R`Harris: $R = \det H - k\,(\operatorname{tr} H)^2$

Shi–Tomasi: $\min(\lambda_1, \lambda_2) > \tau$` },
        say: 'Two common scores turn this into a detector. Harris and Stephens use the determinant of H minus k times the trace of H squared, which avoids computing the eigenvalues. Shi and Tomasi, in Good Features to Track, keep a window only if the smaller eigenvalue, lambda min, is above a threshold.',
        speaker: 'tomasi', text: 'Two common scores turn this into a detector. Harris and Stephens use $R = \\det H - k\\,(\\operatorname{tr} H)^2$, which avoids computing the eigenvalues. Shi and Tomasi, in *Good Features to Track*, keep a window only if the **smaller eigenvalue** $\\lambda_{\\min}$ is above a threshold.',
        math: R`$\det H = \lambda_1\lambda_2$, $\operatorname{tr} H = \lambda_1 + \lambda_2$. Harris: $R = \lambda_1\lambda_2 - k(\lambda_1+\lambda_2)^2$, $k \approx 0.04$–$0.06$. Shi–Tomasi: $\min(\lambda_1, \lambda_2) > \tau$.` },
      { topic: 'Good features are trackable features', ref: 'Harris vs. Shi–Tomasi', hold: K.truckStop + 24,
        focus: { kind: 'tensor', at: { auto: 'corner', region: TRUCK }, title: 'Detection = trackability', body: R`The tracker solves $H\,\mathbf{d} = \mathbf{b}$. A large $\lambda_{\min}$ means $H$ is safely invertible.` },
        say: 'This connects directly to tracking: when the tracker solves for the motion, it has to invert almost the same matrix H, built from the same patch. If lambda min is large, that inversion is numerically stable. So choosing points with a large lambda min means choosing the points the tracker can follow reliably.',
        speaker: 'tomasi', text: 'This connects directly to tracking: when the tracker solves for the motion, it has to invert almost the same matrix $H$, built from the same patch. If $\\lambda_{\\min}$ is large, that inversion is numerically stable. So choosing points with a large $\\lambda_{\\min}$ means choosing the points the tracker can follow reliably.', event: { hangup: true } },

      { topic: 'Detecting good features', ref: 'Harris vs. Shi–Tomasi', hold: K.truckStop + 24,
        focus: { kind: 'heatmap', spacing: true, title: 'Shi–Tomasi response', body: R`{{heat|Colour}} = $\lambda_{\min}$ of each pixel's window. The detector keeps the brightest peaks above $\tau$, at least a minimum distance apart. The plain panel stays dark and the straight edges stay dim.` },
        speaker: 'wren', text: 'I\'m re-detecting points with the Shi–Tomasi criterion. Points are found on the wheels, the bumper and the truck\'s corners. The plain panel and the straight edges get no points, as expected.' },
    ],
    notebook: [
      { title: 'The aperture problem', level: 'story', body: R`
Look at a moving straight edge through a small hole (an *aperture*) and you can only tell how fast it moves **perpendicular** to itself. Motion along the edge is invisible. The classic demo is the barber-pole illusion: the stripes move sideways, but you see them climb.

For a tracker the lesson is that **some patches cannot be tracked, no matter how clever the algorithm**. A blank patch has no information. An edge patch has information in only one direction.

![**Figure 2. The aperture problem on the truck's side panel.** Through the 15×15 window (blue box), a shift across the edge (green) changes the pixels and can be measured. A shift along the edge (red) leaves them unchanged, so that component of motion is invisible.](assets/figures/aperture.jpg)` },
      { title: 'One equation, two unknowns', level: 'math', body: R`
The optical flow constraint $I_x u + I_y v = -I_t$ is a line in the $(u, v)$ plane. Any $\mathbf{d}$ on that line agrees with the data. The only recoverable part is the component along $\nabla I$:

$$\mathbf{d}_\perp = -\frac{I_t}{\|\nabla I\|}\,\frac{\nabla I}{\|\nabla I\|}.$$

Pooling a window gives $H\mathbf{d} = \mathbf{b}$ (Chapter 1). That system has a unique, stable solution only if $H$ is well-conditioned, which needs the window to contain gradients in at least two directions.` },
      { title: 'The structure tensor', level: 'math', body: R`
$$H = \sum_{\mathbf{x} \in \mathcal{W}} w(\mathbf{x}) \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix} = \sum_{\mathcal{W}} w\, \nabla I\, \nabla I^\top$$

with weights $w$ either uniform or Gaussian. It is a sum of outer products, so $H$ is **symmetric positive semi-definite**: eigenvalues $\lambda_1 \ge \lambda_2 \ge 0$, orthogonal eigenvectors $\mathbf{e}_1, \mathbf{e}_2$.

**What the eigenvalues mean.** Shift the window by a small $\boldsymbol{\Delta}$ and compare it with itself:

$$E(\boldsymbol{\Delta}) = \sum_{\mathcal{W}} w\,[I(\mathbf{x} + \boldsymbol{\Delta}) - I(\mathbf{x})]^2 \approx \boldsymbol{\Delta}^\top H\, \boldsymbol{\Delta}.$$

So $\lambda_1$ is how fast the patch changes when shifted along $\mathbf{e}_1$ (the steepest direction), and $\lambda_2$ along $\mathbf{e}_2$ (the flattest). Picture the level set $\boldsymbol{\Delta}^\top H \boldsymbol{\Delta} = 1$ as an ellipse with semi-axes $1/\sqrt{\lambda_1}$ and $1/\sqrt{\lambda_2}$: a long thin ellipse is an edge, a small round one is a corner.

**Two ellipses, one matrix.** The inspector and the on-screen overlays draw a different ellipse: the *spread of the gradients*, with semi-axes proportional to $\sqrt{\lambda_1 / n}$ and $\sqrt{\lambda_2 / n}$ (the root-mean-square gradient along each eigenvector, over the $n$ pixels of the window). For an edge it is a thin line *across* the edge, while the iso-error ellipse above is long *along* it. Both describe the same $H$; the overlays are labelled "gradient spread (∝√λ)".` },
      { title: 'Flat, edge, corner', level: 'story', body: R`
| Patch | $\lambda_1$ | $\lambda_2$ | Gradients look like | Trackable? |
| Flat (plain panel) | small | small | tiny cloud at the origin | no |
| Edge | large | small | a line through the origin | only across the edge |
| Corner / texture | large | large | spread in all directions | yes |

![**Figure 3. Three 15×15 windows from the truck frame.** Top: the window, magnified. Bottom: each pixel's gradient $(I_x, I_y)$ as a dot, with the gradient-spread ellipse. Flat: every dot at the origin ($\lambda_1 = \lambda_2 \approx 0$). Edge: dots on a line across the edge ($\lambda_1 = 2.07$, $\lambda_2 \approx 0$). Corner: dots spread in two directions ($\lambda_1 = 1.02$, $\lambda_2 = 0.86$).](assets/figures/flat-edge-corner.png)

"Large" and "small" are relative to the image noise. With noise of variance $\sigma^2$, even a perfectly flat patch has $\lambda \approx \sigma^2 \cdot |\mathcal{W}| \cdot (\text{gradient-filter gain})$, so thresholds must sit above that floor.` },
      { title: 'Harris vs. Shi–Tomasi', level: 'math', body: R`
Both score each pixel from the eigenvalues of $H$ computed over its window.

**Harris & Stephens (1988)** avoid the square root of an eigen-decomposition:

$$R = \det H - k\,(\operatorname{tr} H)^2 = \lambda_1 \lambda_2 - k\,(\lambda_1 + \lambda_2)^2, \qquad k \in [0.04, 0.06].$$

$R > 0$ and large → corner; $R < 0$ → edge; $|R|$ small → flat.

**Shi & Tomasi (1994)** keep a window when

$$\min(\lambda_1, \lambda_2) > \tau.$$

Their argument is that the tracker solves $H\mathbf{d} = \mathbf{b}$, so the features to keep are those for which $H$ is far from singular and dominates noise. The smallest eigenvalue measures exactly that. The condition number $\lambda_1 / \lambda_2$ tells you how unevenly constrained the solution is; under a simple noise model the uncertainty of $\mathbf{d}$ is proportional to $H^{-1}$.

**In practice** (e.g. OpenCV's goodFeaturesToTrack): compute $\lambda_{\min}$ at every pixel, set $\tau$ as a fraction (*quality level*, e.g. 0.01) of the best score in the image, apply non-maximum suppression, enforce a minimum distance between features, and keep the top $N$.` },
      { title: 'Try it: the patch inspector', level: 'story', body: R`
The widget below reads the **current video frame** and computes $H$ in a window you choose.

- Click the frame (or use the arrow keys) to move the window.
- **Flat / Edge / Corner** jump to the best example of each in this frame.
- The scatter plot shows every pixel’s gradient $(I_x, I_y)$; the ellipse shows $H$’s eigen-directions, scaled by $\sqrt{\lambda}$.
- Drag the threshold $\tau$ and watch the classification change.` },
    ],
    widget: 'structure-tensor',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'corridor',
    index: 3,
    title: 'Lucas–Kanade tracking',
    short: 'Lucas–Kanade',
    icon: 'lk',
    place: 'Across Straus Square',
    scene: 'corridor',
    sceneAlt: 'The robot rolls across Straus Square toward the Canal Street crosswalk, with storefronts, fire escapes and parked cars ahead. Dozens of corner dots slide smoothly across the frame, each keeping its identity.',
    status: 'written',
    clip: ch(3),
    failure: {
      title: 'Where exactly did each corner go?',
      text: 'Detecting corners does not say which corner is which. Each corner must be followed from frame to frame, to a fraction of a pixel.',
    },
    dialogue: [
      { topic: 'From detecting to tracking', ref: 'Tracking as image alignment', speaker: 'wren', text: 'I have plenty of corners now, but I need to follow each one from frame to frame. I\'m calling Dr. Kanade again.', event: { call: ['lucas', 'kanade'] } },
      { topic: 'Tracking as image alignment', ref: 'Tracking as image alignment', hold: K.lkFrame,
        focus: { kind: 'window', at: { track: 'auto', near: [300, 215] }, title: 'Template T', body: 'The patch in {{focus|this window}}, around a corner in the previous frame. In the next frame, find the shift that makes the image look like it again.' },
        say: 'To track a feature, treat it as an image alignment problem. Take a small patch around the feature in the old frame; this is the template, T. In the new frame, I, find the shift p such that the patch at x plus p matches T.',
        speaker: 'kanade', text: 'To track a feature, treat it as an **image alignment** problem. Take a small patch around the feature in the old frame; this is the template $T$. In the new frame $I$, find the shift $\\mathbf{p}$ such that the patch at $\\mathbf{x} + \\mathbf{p}$ matches $T$.' },
      { topic: 'The SSD objective', ref: 'The SSD objective', hold: K.lkFrame,
        focus: { kind: 'window', at: { track: 'auto', near: [300, 215] }, title: 'Sum of squared differences', body: R`$$E(\mathbf{p}) = \sum_{\mathbf{x}} \big[I(\mathbf{x} + \mathbf{p}) - T(\mathbf{x})\big]^2$$` },
        say: 'We measure the mismatch with the sum of squared differences: for every pixel in the patch, subtract the template from the new image at x plus p, square it, and add up the results. The best shift is the p that minimises this error, E.',
        speaker: 'kanade', text: 'We measure the mismatch with the sum of squared differences: $E(\\mathbf{p}) = \\sum_{\\mathbf{x}} [I(\\mathbf{x} + \\mathbf{p}) - T(\\mathbf{x})]^2$. The best shift is the $\\mathbf{p}$ that minimises $E$.' },
      { topic: 'Linearising the error', ref: 'Deriving H Δp = b', hold: K.lkFrame,
        focus: { kind: 'window', at: { track: 'auto', near: [300, 215] }, title: 'Linearise around the current guess', body: R`$$I(\mathbf{x}{+}\mathbf{p}{+}\Delta\mathbf{p}) \approx I(\mathbf{x}{+}\mathbf{p}) + \nabla I^\top \Delta\mathbf{p}$$` },
        say: 'As with optical flow, we avoid searching. Starting from the current estimate p, approximate the image with a first order Taylor expansion around it. Then the error is a quadratic function of the update, delta p. Setting its derivative to zero gives a two by two linear system.',
        speaker: 'lucas', text: 'As with optical flow, we avoid searching. Starting from the current estimate $\\mathbf{p}$, approximate the image with a first-order Taylor expansion: $I(\\mathbf{x} + \\mathbf{p} + \\Delta\\mathbf{p}) \\approx I(\\mathbf{x} + \\mathbf{p}) + \\nabla I^\\top \\Delta\\mathbf{p}$. Then $E$ is a quadratic function of the update $\\Delta\\mathbf{p}$. Setting its derivative to zero gives a $2\\times2$ linear system.',
        math: R`$\dfrac{\partial E}{\partial \Delta\mathbf{p}} = 2\sum \nabla I\,[I(\mathbf{x}{+}\mathbf{p}) + \nabla I^\top \Delta\mathbf{p} - T(\mathbf{x})] = \mathbf{0}$.` },
      { topic: 'Solving H Δp = b', ref: 'Deriving H Δp = b', hold: K.lkFrame,
        focus: { kind: 'lk', at: { track: 'auto', near: [300, 215] }, lag: 2, title: 'Lucas–Kanade on this corner (real pixels)', body: R`$H\,\Delta\mathbf{p} = \mathbf{b}$, solved between the previous two frames. {{muted|Dashed}}: template. {{focus|Dots}}: iterates. {{good|Green}}: result.` },
        say: 'The system is H times delta p equals b, where H is the sum of the gradient outer products, and b is the sum of the gradient times the difference between the template and the current image. Near the solution, H is essentially the structure tensor from Chapter 2. That is why corners are easy to track: their H is well conditioned.',
        speaker: 'kanade', text: 'The system is $H\\,\\Delta\\mathbf{p} = \\mathbf{b}$, with $H = \\sum \\nabla I\\,\\nabla I^\\top$ and $\\mathbf{b} = \\sum \\nabla I\\,[T(\\mathbf{x}) - I(\\mathbf{x} + \\mathbf{p})]$. Near the solution, $H$ is essentially the structure tensor from Chapter 2. That is why corners are easy to track: their $H$ is well conditioned.' },
      { topic: 'Gauss–Newton iterations', ref: 'Gauss–Newton iteration', hold: K.lkFrame,
        focus: { kind: 'lk', at: { track: 'auto', near: [300, 215] }, lag: 2, start: [2, -1.5], inset: true, title: 'Gauss–Newton iterations', body: R`Same corner, but started from a deliberately wrong guess $\mathbf{p}_0 = (2, -1.5)$ px. $\mathbf{p} \leftarrow \mathbf{p} + \Delta\mathbf{p}$ until $\|\Delta\mathbf{p}\| < 0.01$ px. Watch the error image fade.` },
        say: 'Because the Taylor expansion is only an approximation, one update does not land exactly on the answer. So we iterate: add delta p to p, sample the new image at the updated position, and solve again. This is the Gauss Newton method. It typically converges in a few iterations.',
        speaker: 'lucas', text: 'Because the Taylor expansion is only an approximation, one update does not land exactly on the answer. So we iterate: update $\\mathbf{p} \\leftarrow \\mathbf{p} + \\Delta\\mathbf{p}$, sample the new image at the updated position, and solve again. This is the **Gauss–Newton** method. It typically converges in a few iterations.' },
      { topic: 'Sub-pixel accuracy', ref: 'Sub-pixel sampling', speaker: 'wren', text: 'How can the result be more precise than a pixel? My camera only measures whole pixels.' },
      { topic: 'Bilinear interpolation', ref: 'Sub-pixel sampling', hold: K.lkFrame,
        focus: { kind: 'window', at: { track: 'auto', near: [300, 215] }, win: 2, title: 'Between pixels', body: R`Blend the 4 nearest pixels, weighted by the fractional position: $$I(x, y) \approx \sum_{i,j \in \{0,1\}} w_{ij}\, I_{ij}$$` },
        say: 'We use bilinear interpolation: the image value between pixels is estimated from the four nearest pixels. Because the image can then be evaluated at any real valued shift, the solution can be three point two seven pixels, not just three. This is how KLT achieves sub pixel accuracy.',
        speaker: 'kanade', text: 'We use **bilinear interpolation**: the image value between pixels is estimated from the four nearest pixels. Because $I(\\mathbf{x} + \\mathbf{p})$ can then be evaluated at any real-valued $\\mathbf{p}$, the solution can be $3.27$ pixels, not just $3$. This is how KLT achieves sub-pixel accuracy.' },
      { topic: 'General warps', ref: 'General warps: the algorithm step by step', say: 'So far the warp is a pure translation, x plus p. The same method works for a general warp, for example an affine warp with six parameters, which can also model rotation, scaling and shear. Baker and Matthews describe the general algorithm step by step; it is in the Lab Notebook.',
        speaker: 'kanade', text: 'So far the warp is a pure translation, $\\mathbf{x} + \\mathbf{p}$. The same method works for a general warp $W(\\mathbf{x}; \\mathbf{p})$, for example an affine warp with six parameters, which can also model rotation, scaling and shear. Baker and Matthews describe the general algorithm step by step; it is in the Lab Notebook.' },
      { topic: 'When to stop, when to give up', ref: 'Knowing when to give up', say: 'The iteration stops when the update, delta p, becomes very small, or after a maximum number of iterations. If the final error is still large, the patch has probably changed appearance or been occluded, and the track should be discarded.',
        speaker: 'lucas', text: 'The iteration stops when the update $\\|\\Delta\\mathbf{p}\\|$ becomes very small, or after a maximum number of iterations. If the final error $E$ is still large, the patch has probably changed appearance or been occluded, and the track should be discarded.', event: { hangup: true } },
      { topic: 'KLT tracking, live', ref: 'Knowing when to give up', focus: { kind: 'flow', at: { track: 'auto', near: [300, 215] }, lag: 6, scale: 4, title: 'Same corner, every frame', body: 'The {{focus|arrow}} follows one corner. Its id never changes while it stays in view.' },
        speaker: 'wren', text: 'I\'m now tracking more than fifty corners with a mean error below a quarter of a pixel. Each point keeps the same ID from frame to frame, which is what makes it a track.' },
    ],
    notebook: [
      { title: 'Tracking as image alignment', level: 'story', body: R`
For each feature, cut a small **template** $T$ around it. In each new frame, find the **warp parameters** $\mathbf{p}$ that best align the new image with $T$. For pure translation, $\mathbf{p} = (p_x, p_y)$ is simply where the feature went.

**Which frame does the template come from?** There are two choices. A template from the *previous frame* adapts to slow changes in appearance (lighting, viewpoint, scale), but small errors add up over time, so the track **drifts**. A template from the *first frame* does not drift, but it fails once the feature's appearance has changed too much. Shi & Tomasi (1994) combine the two: they track frame-to-frame with a translation model, and periodically compare the feature with its first-frame template using an affine warp, dropping it if the *dissimilarity* becomes too large. The tracker used for this story's footage (OpenCV) tracks frame-to-frame.

The algorithm starts from a guess (the previous position), measures the mismatch, computes a correction from local gradients, and repeats. No search, no descriptors. Each iteration is one small linear solve.` },
      { title: 'The SSD objective', level: 'math', body: R`
$$E(\mathbf{p}) = \sum_{\mathbf{x} \in \mathcal{W}} \big[\, I(W(\mathbf{x}; \mathbf{p})) - T(\mathbf{x}) \,\big]^2$$

For translation $W(\mathbf{x}; \mathbf{p}) = \mathbf{x} + \mathbf{p}$. The sum runs over the template's pixels. $E$ is non-linear in $\mathbf{p}$ because the image $I$ is an arbitrary function of position.` },
      { title: 'Deriving H Δp = b', level: 'math', body: R`
Given a current estimate $\mathbf{p}$, look for an increment $\Delta\mathbf{p}$. Expand to first order:

$$I(\mathbf{x} + \mathbf{p} + \Delta\mathbf{p}) \approx I(\mathbf{x} + \mathbf{p}) + \nabla I(\mathbf{x} + \mathbf{p})^\top \Delta\mathbf{p}.$$

Substitute into $E$:

$$E(\Delta\mathbf{p}) \approx \sum_{\mathbf{x}} \big[\, I(\mathbf{x}{+}\mathbf{p}) + \nabla I^\top \Delta\mathbf{p} - T(\mathbf{x}) \,\big]^2.$$

This is quadratic in $\Delta\mathbf{p}$. Set the gradient to zero:

$$\frac{\partial E}{\partial \Delta\mathbf{p}} = 2 \sum_{\mathbf{x}} \nabla I \,\big[\, I(\mathbf{x}{+}\mathbf{p}) + \nabla I^\top \Delta\mathbf{p} - T(\mathbf{x}) \,\big] = \mathbf{0}$$

$$\Longrightarrow\quad \underbrace{\Big(\sum_{\mathbf{x}} \nabla I\, \nabla I^\top\Big)}_{H}\, \Delta\mathbf{p} \;=\; \underbrace{\sum_{\mathbf{x}} \nabla I \,\big[\, T(\mathbf{x}) - I(\mathbf{x}{+}\mathbf{p}) \,\big]}_{\mathbf{b}}.$$

$\nabla I$ is evaluated at $\mathbf{x} + \mathbf{p}$. With $I_t := I(\mathbf{x}{+}\mathbf{p}) - T(\mathbf{x})$ this is exactly the Chapter 1 system, $\mathbf{b} = -\sum \nabla I\, I_t$.

**Is this $H$ the structure tensor?** Almost. Here $H$ is built from gradients of the *new image* at the current estimate, while the detector (Chapter 2) computes the structure tensor of the *template* frame. Near convergence the two patches coincide, so the two matrices are nearly equal, which is why a good corner is also easy to track. The *inverse compositional* variant (below) builds $H$ from the template's gradients, so there it is exactly the template's structure tensor, and it is computed only once.` },
      { title: 'Gauss–Newton iteration', level: 'math', body: R`
$$\Delta\mathbf{p} = H^{-1}\mathbf{b}, \qquad \mathbf{p} \leftarrow \mathbf{p} + \Delta\mathbf{p}, \qquad \text{repeat until } \|\Delta\mathbf{p}\| < \varepsilon \text{ or } k = k_{\max}.$$

**Why "Gauss–Newton".** Write the residuals $r_\mathbf{x}(\mathbf{p}) = I(W(\mathbf{x};\mathbf{p})) - T(\mathbf{x})$ and their Jacobian $J$. Newton's method would use the true Hessian of $E$, $2(J^\top J + \sum r\, \nabla^2 r)$. Gauss–Newton drops the second term, using $J^\top J$. That is accurate near the solution, where residuals are small, and it is guaranteed positive semi-definite. $H$ above is exactly $J^\top J$.

Typical settings: $\varepsilon = 0.01$–$0.03$ px, $k_{\max} = 10$–$30$, window $15 \times 15$ to $31 \times 31$. Convergence is usually fast (a few iterations) when the initial error is smaller than about half the dominant spatial wavelength in the window: the distance over which the linear approximation of the image holds. Image pyramids (Chapter 4) enlarge this basin of attraction.` },
      { title: 'General warps: the algorithm step by step', level: 'math', body: R`
Following Baker & Matthews (2004), *forward-additive* Lucas–Kanade. Iterate:

1. **Warp** $I$ with $W(\mathbf{x}; \mathbf{p})$ to compute $I(W(\mathbf{x}; \mathbf{p}))$.
2. **Error image:** $T(\mathbf{x}) - I(W(\mathbf{x}; \mathbf{p}))$.
3. **Warp the gradient** $\nabla I$ with $W(\mathbf{x}; \mathbf{p})$.
4. **Jacobian** $\dfrac{\partial W}{\partial \mathbf{p}}$ evaluated at $(\mathbf{x}; \mathbf{p})$.
5. **Steepest-descent images** $\nabla I \dfrac{\partial W}{\partial \mathbf{p}}$ (one image per parameter).
6. **Hessian** $H = \sum_{\mathbf{x}} \Big[\nabla I \dfrac{\partial W}{\partial \mathbf{p}}\Big]^\top \Big[\nabla I \dfrac{\partial W}{\partial \mathbf{p}}\Big]$, and its inverse.
7. **Update** $\Delta\mathbf{p} = H^{-1} \sum_{\mathbf{x}} \Big[\nabla I \dfrac{\partial W}{\partial \mathbf{p}}\Big]^\top \big[T(\mathbf{x}) - I(W(\mathbf{x}; \mathbf{p}))\big]$.
8. **Apply** $\mathbf{p} \leftarrow \mathbf{p} + \Delta\mathbf{p}$; stop when $\|\Delta\mathbf{p}\| \le \varepsilon$.

> Steps 3–6 use the gradient of the **image** $I$, so $H$ is recomputed every iteration. The *inverse compositional* variant swaps roles and uses the gradient of the **template** $\nabla T$, so $H$ is computed once per feature. Same answer to first order, much cheaper.` },
      { title: 'Jacobians for common warps', level: 'math', body: R`
**Translation**, $\mathbf{p} = (p_1, p_2)$:
$$W(\mathbf{x};\mathbf{p}) = \begin{bmatrix} x + p_1 \\ y + p_2 \end{bmatrix}, \qquad \frac{\partial W}{\partial \mathbf{p}} = \begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}.$$
The steepest-descent images are just $I_x, I_y$, and $H$ is the structure tensor.

**Affine**, $\mathbf{p} = (p_1, \dots, p_6)$ (Baker–Matthews parameterisation):
$$W(\mathbf{x};\mathbf{p}) = \begin{bmatrix} (1 + p_1)\,x + p_3\, y + p_5 \\ p_2\, x + (1 + p_4)\, y + p_6 \end{bmatrix}, \qquad \frac{\partial W}{\partial \mathbf{p}} = \begin{bmatrix} x & 0 & y & 0 & 1 & 0 \\ 0 & x & 0 & y & 0 & 1 \end{bmatrix}.$$
$H$ becomes $6 \times 6$. KLT implementations usually track with translation frame-to-frame (robust, cheap) and use affine only to *check* a feature against its original template (Shi & Tomasi's dissimilarity monitoring).` },
      { title: 'Sub-pixel sampling', level: 'math', body: R`
To read $I$ at a non-integer point $(x, y)$, let $x_0 = \lfloor x \rfloor$, $y_0 = \lfloor y \rfloor$, $\alpha = x - x_0$, $\beta = y - y_0$:

$$I(x, y) \approx (1{-}\alpha)(1{-}\beta)\,I_{00} + \alpha(1{-}\beta)\,I_{10} + (1{-}\alpha)\beta\,I_{01} + \alpha\beta\,I_{11}.$$

Bilinear interpolation makes $E$ continuous in $\mathbf{p}$, so Gauss–Newton can settle between pixel centres. Its derivative, however, jumps at pixel boundaries. Practical trackers therefore compute smoothed derivative images once (e.g. Sobel or Scharr filters of a slightly blurred image) and interpolate *those* bilinearly, which gives a well-behaved gradient. Typical accuracy on good features: 0.05–0.1 px.` },
      { title: 'Knowing when to give up', level: 'story', body: R`
A track should be dropped when:

- the iteration hits $k_{\max}$ without converging;
- the final residual $E$ per pixel is above a threshold (appearance changed or occlusion);
- $\lambda_{\min}$ of $H$ at the new location falls below $\tau$ (the feature turned into an edge or blank);
- the window leaves the image.

Lost features are replaced by detecting new ones in empty regions (Chapter 4).` },
    ],
    widget: 'lk-iterations',
  },

  // ---------------------------------------------------------------------------
  {
    id: 'sprint',
    index: 4,
    title: 'Large motion: pyramids and track checks',
    short: 'Pyramids & checks',
    icon: 'pyramid',
    place: 'Crossing Canal Street',
    scene: 'sprint',
    sceneAlt: 'The walk signal changes and the robot dashes across Canal Street with a few pedestrians, jolting over the curb. Near the edges of the view, points jump many pixels per frame; many dots vanish and new ones appear.',
    status: 'outline',
    clip: ch(4),
    failure: {
      title: 'What if points move too far?',
      text: 'When the displacement between frames is large, the linear approximation fails and tracks are lost.',
    },
    dialogue: [
      { topic: 'Motion too large to linearise', ref: 'Image pyramids: coarse-to-fine tracking', speaker: 'wren', text: 'The walk signal is ending, so I\'m crossing Canal Street at twice my normal speed, and I\'m losing tracks. I\'m calling Dr. Kanade.', event: { call: 'lucas' } },
      { topic: 'Image pyramids', ref: 'Image pyramids: coarse-to-fine tracking', hold: K.sprintStart + 26, focus: { kind: 'pyramid', at: { track: 'fastest' }, title: 'One motion, four levels', body: R`The same feature at pyramid levels 0 to 3. Each level halves the displacement, until it is small enough for one linear step.` },
        say: 'This is the limitation from Chapter 1: the linear approximation only works for small displacements. The standard fix is an image pyramid. Downsample the image by a factor of two several times. A displacement of eight pixels at full resolution is only one pixel at the third level. Estimate the motion at the coarsest level, double it as the starting guess for the next finer level, and refine level by level.',
        speaker: 'lucas', text: 'This is the limitation from Chapter 1: the linear approximation only works for small displacements. The standard fix is an **image pyramid**. Downsample the image by a factor of 2 several times. A displacement of 8 pixels at full resolution is only 1 pixel at the third level. Estimate the motion at the coarsest level, double it as the starting guess for the next finer level, and refine level by level.' },
      { topic: 'Blur and low light', ref: 'Blur, low light and illumination changes', speaker: 'lucas', say: 'Fast motion causes a second problem: motion blur. Blur, like the noise in low light, weakens the image gradients, so lambda min drops and the estimates become unreliable. Shorter exposure times help, as does tracking fewer but stronger features.',
        text: 'Fast motion causes a second problem: motion blur. Blur, like the noise in low light, weakens the image gradients, so $\\lambda_{\\min}$ drops and the estimates become unreliable. Shorter exposure times help, as does tracking fewer but stronger features.', event: { hangup: true } },
      { speaker: 'wren', text: 'With the pyramid I\'m keeping up, but some of my tracks are now wrong. I\'m calling Dr. Tomasi.', event: { call: 'tomasi' } },
      { topic: 'The forward–backward check', ref: 'The forward–backward test and re-detection', focus: { kind: 'fb', title: 'Forward–backward error', body: R`Each {{good|ring}}'s radius is the distance $e_{FB}$ between a point's start and where it lands after tracking forward and back. {{lost|Red ×}}: dropped this frame.` },
        speaker: 'tomasi', text: 'Check every track with a **forward–backward test**. Track the point from the old frame to the new frame, then track it back again. If it does not return to within about one pixel of where it started, discard it. The error number at the top of your screen is the average of this distance over the tracks you kept. Then detect new corners in the empty regions to keep the number of tracks constant.' },
      { topic: 'Predicting with the IMU', ref: 'IMU prediction and visual–inertial odometry (outline)', speaker: 'tomasi', text: 'You can also use your gyroscope. It measures how much you rotated between frames, so you can predict where each point should appear before tracking it. Combining camera tracks with inertial measurements is called **visual–inertial odometry**.', event: { hangup: true } },
    ],
    notebook: [
      { title: 'Image pyramids: coarse-to-fine tracking', level: 'math', body: R`
The linearisation in Chapter 1 holds only while the displacement is smaller than about half the dominant spatial wavelength of the patch, typically a few pixels. Fast motion breaks that. An **image pyramid** turns a large displacement into a small one.

**Building the pyramid.** Level $0$ is the original image $I^0$. Each further level is the previous one low-pass filtered (to avoid aliasing) and downsampled by 2:
$$I^{\ell}(\mathbf{x}) = \big(G * I^{\ell-1}\big)(2\mathbf{x}), \qquad \ell = 1, \dots, L.$$
A displacement of $\mathbf{d}$ pixels at level 0 is only $\mathbf{d}/2^{\ell}$ at level $\ell$: 8 px becomes 1 px at level 3.

![**Figure 4. A four-level pyramid of frame 1511.** The circled feature moves 8.3 px between frames at level 0 (full resolution), too far for one linearised step. At levels 1, 2 and 3 the same motion is 4.1, 2.1 and 1.0 px. KLT solves at level 3 first, then doubles the estimate and refines it at each finer level.](assets/figures/pyramid.jpg)

**Coarse to fine (Bouguet, 2000).** Start at the top level with the guess $\mathbf{g}^L = \mathbf{0}$. At each level $\ell$, run Lucas–Kanade on $I^\ell_t$ and $I^\ell_{t+1}$, starting from the guess, to find a small residual $\mathbf{d}^\ell$. Pass the result down, doubled for the finer grid:
$$\mathbf{g}^{\ell-1} = 2\,(\mathbf{g}^{\ell} + \mathbf{d}^{\ell}), \qquad \mathbf{d} = \mathbf{g}^{0} + \mathbf{d}^{0}.$$
Each level only has to correct a residual of about one pixel, so the linearisation holds at every level. With $L$ levels the largest trackable motion grows by a factor of about $2^{L+1} - 1$; with $L = 3$ that is 15 times the single-level range.

**Costs and limits.** The pyramid costs about one third more memory than the image itself. Very small features disappear at coarse levels, and a window that straddles a depth boundary is wrong at every level. Typical settings: $L = 3$–$4$ and a $21 \times 21$ window.` },
      { title: 'Blur, low light and illumination changes', level: 'story', body: R`
Lucas–Kanade assumes the patch looks the same in both frames. Two common effects break that.

**Motion blur and low light.** During the exposure the image moves, so edges are smeared along the direction of motion. Gradients along that direction shrink, $H$ becomes closer to rank 1 (edge-like), and $\lambda_{\min}$ drops. Low light adds sensor noise, which raises the noise floor of $H$. Both make the estimate less certain, since its covariance grows like $\sigma^2 H^{-1}$. Remedies: a shorter exposure (at the cost of more noise), a global-shutter camera, or keeping fewer but stronger features.

**Illumination changes.** Auto-exposure, shadows and flicker scale and shift the brightness of a patch. A simple fix is to model gain and bias, $T(\mathbf{x}) \approx \alpha\, I(\mathbf{x} + \mathbf{p}) + \beta$, and solve for $\alpha, \beta$ together with $\mathbf{p}$; another is to compare **zero-mean, normalised** patches (normalised cross-correlation), which ignores gain and bias by construction. Fixing the camera's exposure while recording avoids most of the problem.` },
      { title: 'The forward–backward test and re-detection', level: 'math', body: R`
A tracker can converge to the wrong place, for example on a repeated pattern or when the feature is occluded, and the residual alone does not always reveal it. The **forward–backward test** (Kalal, Mikolajczyk & Matas, 2010) checks each track for self-consistency.

Track a point forward from frame $t$ to $t+1$, then track the result backward from $t+1$ to $t$:
$$\mathbf{x}_t \xrightarrow{\text{LK}} \hat{\mathbf{x}}_{t+1} \xrightarrow{\text{LK}} \tilde{\mathbf{x}}_t, \qquad e_{FB} = \|\mathbf{x}_t - \tilde{\mathbf{x}}_t\|.$$
A correct track returns to where it started, so $e_{FB}$ is close to zero; a wrong one usually does not. Tracks with $e_{FB}$ above a threshold $\theta$ (typically 0.5–1 px) are dropped. The test doubles the tracking cost and needs no extra model or ground truth.

**Other checks.** A track is also dropped when the iteration does not converge, when the final residual per pixel is high, when $\lambda_{\min}$ at the new position falls below the threshold, or when the window leaves the image.

**Re-detection.** After the checks, the number of tracks falls. Mask a radius around every surviving track, run the Shi–Tomasi detector in the unmasked area, and add the strongest new corners until there are $N$ tracks again.

**Outliers at the motion level.** Even tracks that pass every check may belong to moving objects. When the tracks are used to estimate camera motion, RANSAC on a homography or essential matrix separates the dominant motion from such outliers.` },
      { title: 'IMU prediction and visual–inertial odometry (outline)', level: 'math', body: R`
- Gyroscope gives rotation $R$ between frames. For pure rotation, image points map by the homography $\mathbf{x}' \simeq K R K^{-1} \mathbf{x}$ (homogeneous coordinates, intrinsics $K$).
- Use that prediction as the initial guess $\mathbf{g}$ for LK: large rotational motion disappears, and only a small translational residual is left for LK.
- Full VIO (e.g. MSCKF, VINS-Mono) fuses KLT tracks with IMU pre-integration in a filter or sliding-window optimiser to estimate pose, velocity, and IMU biases.
- TODO(content): widget idea: toggle gyro prediction on/off and compare track survival.` },
    ],
    widget: 'pyramid',
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
      text: 'Points leave the view and fail checks, yet about a hundred tracks remain: a four-step loop runs on every frame.',
    },
    dialogue: [
      { topic: 'Keeping a hundred points alive', ref: 'The KLT loop', speaker: 'wren', text: 'People cross my view and points leave the frame, yet I still hold about a hundred tracks. I\'m calling Dr. Tomasi and Dr. Kanade to explain the whole process.', event: { call: ['tomasi', 'kanade'] } },
      { topic: 'Step 1 · Detect', ref: 'One frame of the loop', focus: { kind: 'heatmap', spacing: true, title: 'Detect', body: R`Shi–Tomasi response $\lambda_{\min}$ ({{heat|colour}}). Corners are taken strongest first, at least a minimum distance from any existing track ({{muted|dashed circles}}).` },
        speaker: 'tomasi', text: 'The KLT tracker is a loop with four steps that runs on every frame. Step one is **detection**: find corners with the Shi–Tomasi criterion, keep the strongest ones, and require a minimum distance between them so that they spread across the image.' },
      { topic: 'Step 2 · Track', ref: 'One frame of the loop', focus: { kind: 'flowfield', lag: 4, scale: 3, title: 'Track', body: 'Every {{focus|arrow}} is one track\'s displacement from pyramidal Lucas–Kanade, coarse to fine, to a fraction of a pixel.' },
        speaker: 'kanade', text: 'Step two is **tracking**: for each corner, pyramidal Lucas–Kanade estimates its displacement into the next frame, from the coarsest pyramid level to the finest, with sub-pixel accuracy.' },
      { topic: 'Step 3 · Verify', ref: 'One frame of the loop', hold: K.parkStart + 325, focus: { kind: 'fb', title: 'Verify', body: R`{{good|Ring}} radius = forward–backward error $e_{FB}$. Tracks above the threshold, or whose corner has faded, are dropped ({{lost|red ×}}).` },
        speaker: 'tomasi', text: 'Step three is **verification**. A track is discarded if it fails a check: its forward–backward error is above about one pixel, its patch no longer matches the template, or its patch is no longer a corner. It is better to lose a point than to keep a wrong one.' },
      { topic: 'Step 4 · Replenish', ref: 'One frame of the loop', hold: K.parkStart + 345, focus: { kind: 'replenish', lag: 12, title: 'Replenish', body: 'Over the last half second: {{lost|red ×}} where tracks were lost, {{fresh|green rings}} where new corners were detected, away from the tracks that remain.' },
        speaker: 'kanade', text: 'Step four is **replenishment**. Wherever there are too few tracks, new corners are detected to bring the count back up. New points receive new IDs: once a point has been lost, KLT cannot recognise it if it appears again.' },
      { topic: 'Where tracks die', ref: 'Lifetime of a track', speaker: 'tomasi', text: 'On your route, most tracks were lost in two places: while crossing Canal Street, where the motion was too large, and at the truck, where the panel had no corners. Elsewhere, few tracks were lost.', event: { hangup: true } },
    ],
    notebook: [
      { title: 'The KLT loop', level: 'story', body: R`
Every frame, a KLT tracker runs the same four steps on its set of tracks:

![**Figure 5. The KLT loop.** Each frame runs detect → track → verify → replenish, which keeps roughly a fixed number of tracks alive.](assets/figures/klt-loop.svg)

1. **Detect.** Find Shi–Tomasi corners (Ch 2) where there are too few tracks. Keep the strongest, at least a minimum distance apart.
2. **Track.** For each track, solve for its displacement with pyramidal Lucas–Kanade (Ch 3–4), starting from its last position (or a prediction).
3. **Verify.** Drop tracks that fail a check: forward–backward error, high residual, weak corner, or leaving the image.
4. **Replenish.** Detect new corners in empty regions so the count stays near a target $N$.

Detection is the expensive step, so it runs only where needed; tracking is cheap and runs on every point every frame.` },
      { title: 'One frame of the loop', level: 'math', body: R`
For each live track $i$ at $\mathbf{x}_i^{t}$:

1. Initial guess $\mathbf{g}_i$ (zero, the last velocity, or an IMU prediction).
2. Pyramidal LK: $\mathbf{d}_i = \arg\min_{\mathbf{d}} \sum_{\mathcal{W}} [I_{t+1}(\mathbf{x} + \mathbf{d}) - I_t(\mathbf{x})]^2$, coarse to fine from $\mathbf{g}_i$.
3. Backward LK from $\mathbf{x}_i^{t} + \mathbf{d}_i$ to $\tilde{\mathbf{x}}_i^{t}$; keep if
$$\|\mathbf{x}_i^{t} - \tilde{\mathbf{x}}_i^{t}\| < \theta_{FB}, \qquad \tfrac{1}{|\mathcal{W}|}E_i < \theta_E, \qquad \lambda_{\min}(H_i) > \tau.$$
4. If fewer than $N$ tracks survive: compute $\lambda_{\min}$ over the image, mask a radius around survivors, add the strongest new corners.` },
      { title: 'Parameters that matter', level: 'story', body: R`
| Parameter | Typical | Effect |
| Window | 15–31 px | larger: more robust, less precise near depth edges |
| Pyramid levels | 2–4 | more: handles larger motion |
| Max corners $N$ | 100–500 | more: robustness and cost |
| Min distance | 7–15 px | spreads points over the image |
| FB threshold | 0.5–1 px | lower: stricter, fewer bad tracks |
| $\lambda_{\min}$ floor | above the noise floor | rejects blank or edge-only patches |

The footage in this story was tracked with: 21 px window, 3 levels, $N = 100$, 12 px spacing, FB 1 px, and an absolute $\lambda_{\min}$ floor of $10^{-3}$ (OpenCV units; see tools/track_video.py). The floor matters: OpenCV's quality level is *relative* to the best corner in the frame, so on a nearly blank frame it accepts video-compression noise as "corners". On a synthetic test clip, the floor reduced about 17,000 short-lived tracks to 692.` },
      { title: 'Lifetime of a track', level: 'story', body: R`
A track lives from the frame its corner is detected to the frame a check fails. On this route, deaths cluster where the chapters predict:

- **Crossing Canal Street** (Ch 4): large, jerky motion near the robot.
- **At the box truck** (Ch 2): blank panel and long edges.
- **Few deaths in the park and at the dock**: slow motion, strong corners.

Because new tracks get new identities, KLT alone can't tell that a point it sees again is one it saw before. That needs descriptors or a map (Ch 7).` },
      { title: 'Evaluating tracking quality', level: 'story', body: R`
How good is a tracker? Three common measures:

- **Position error against ground truth.** With known true positions (from a simulator, like this story's footage, or from hand-labelled data), measure the distance between each tracked and true position. This is the most direct measure, but ground truth is rarely available.
- **Forward–backward error.** Without ground truth, the forward–backward error of Chapter 4 is a useful proxy: consistent tracks have small $e_{FB}$. The **Mean err** shown in the top-left panel is the mean forward–backward error of the tracked points in the current frame, in pixels.
- **Track length and survival.** How many frames a track lives, and how many tracks survive each frame. Short lifetimes signal fast motion, occlusion or weak features.

A good evaluation reports accuracy together with track length, since a tracker can look accurate simply by dropping every difficult point.` },
    ],
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
      { topic: 'Tracks as a tool', ref: 'Why KLT suits these jobs', speaker: 'wren', text: 'I can see my dock. Dr. Kanade, how do robots use these tracks?', event: { call: 'kanade' } },
      { topic: 'Visual odometry', ref: 'Visual odometry (outline)', focus: { kind: 'flow', at: { track: 'auto' }, lag: 6, scale: 4, title: 'Motion from tracks', body: 'Fit one camera motion to all tracks at once. The {{focus|arrow}} is one of them.' },
        speaker: 'kanade', text: 'The first use is **visual odometry**: estimating the camera\'s motion from the tracks. Rotation shifts all points in the same direction. Forward motion makes points move outward from the point you are heading toward. Fitting a single camera motion to all the tracks gives you your path without GPS.' },
      { topic: 'Time-to-contact', ref: 'Expansion and time-to-contact (outline)', say: 'The second use is time to contact. An object approaching you grows in the image. If r is its size in the image and r dot is how fast that size changes, the time until contact is r divided by r dot. You don\'t need its distance or your speed. A walker coming toward you in the park is this case: the faster their image grows, the sooner you meet.',
        speaker: 'kanade', text: 'The second use is **time-to-contact**. An object approaching you grows in the image. If $r$ is its size in the image and $\\dot r$ is how fast that size changes, the time until contact is $\\tau = r / \\dot r$. You don\'t need its distance or your speed. A walker coming toward you in the park is this case: the faster their image grows, the sooner you meet.' },
      { topic: 'Visual servoing', ref: 'Image-based visual servoing (outline)', focus: { kind: 'tracks', title: 'Corner farm', body: R`Every inner corner of the target has a large $\lambda_{\min}$, so each gets a {{tracked|dot}}.` },
        speaker: 'kanade', text: 'The third use is **visual servoing**, which you need now. Track the corners of the checkerboard on the dock, compare their image positions with where they should be when you are docked, and steer to reduce the difference. When the difference reaches zero, you are on the charging contacts.', event: { hangup: true } },
      { speaker: 'wren', text: 'The difference between the tracked and the target corner positions is shrinking. Docked and charging. Order 0428 delivered.' },
    ],
    notebook: [
      { title: 'Visual odometry (outline)', level: 'math', body: R`
- For a camera with translation $\mathbf{t}$ and rotation $\boldsymbol{\omega}$, flow at normalised image point $(x, y)$ with depth $Z$ is
$$\begin{bmatrix} u \\ v \end{bmatrix} = \frac{1}{Z}\begin{bmatrix} -1 & 0 & x \\ 0 & -1 & y \end{bmatrix}\mathbf{t} + \begin{bmatrix} xy & -(1+x^2) & y \\ 1+y^2 & -xy & -x \end{bmatrix}\boldsymbol{\omega}.$$
- Rotation moves every point regardless of depth; translation moves near points more. Pure forward motion radiates from the **focus of expansion**.
- Monocular VO: estimate the essential matrix from tracks with RANSAC, recover $R, \mathbf{t}$ up to scale; VIO fixes scale with the IMU.
- Convention: $\mathbf{t}$ and $\boldsymbol{\omega}$ are the camera's linear and angular velocity, and $(x, y)$ are normalised image coordinates. This is the Longuet-Higgins & Prazdny form, and its rows are exactly the interaction matrix used for visual servoing below.` },
      { title: 'Expansion and time-to-contact (outline)', level: 'math', body: R`
- A point at image distance $r$ from the focus of expansion, on a surface approaching at constant speed: $\tau = Z / (-\dot Z) = r / \dot r$.
- For an object region: $\tau \approx 2 / \operatorname{div}(\mathbf{u})$ for a fronto-parallel surface, or from the growth rate of the spread of its tracks.
- Tracks that disagree with the ego-motion model (RANSAC outliers) belong to independently moving objects.` },
      { title: 'Image-based visual servoing (outline)', level: 'math', body: R`
- Features $\mathbf{s}$ (tracked corner positions), desired features $\mathbf{s}^*$ (positions when docked). Error $\mathbf{e} = \mathbf{s} - \mathbf{s}^*$.
- Interaction matrix for one normalised point $(x, y)$ at depth $Z$ (Chaumette & Hutchinson, 2006):
$$L = \begin{bmatrix} -1/Z & 0 & x/Z & xy & -(1+x^2) & y \\ 0 & -1/Z & y/Z & 1+y^2 & -xy & -x \end{bmatrix}, \qquad \dot{\mathbf{s}} = L\,\mathbf{v}_c.$$
- Control law for exponential error decay: $\mathbf{v}_c = -\lambda\, \widehat{L}^{+} \mathbf{e}$ (pseudo-inverse of the stacked $L$; at least 3 points for 6 DOF, 4+ in practice).` },
      { title: 'Why KLT suits these jobs', level: 'story', body: R`
- Sub-pixel accuracy → smooth, low-noise motion and error signals.
- High rate, low latency → stable estimation and control loops.
- Persistent identities over short spans → each track is a consistent measurement.

| | Sparse (KLT) | Dense (Farnebäck, TV-L1, RAFT...) |
| Output | flow at ~100–1000 points | flow at every pixel |
| Cost | very low, CPU / MCU | high, often GPU |
| Accuracy at features | sub-pixel | varies |
| Textureless regions | no answer (by design) | filled in by regularisation |
| Best for | odometry, tracking, servoing | segmentation, obstacle maps |` },
    ],
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
      { topic: 'Recap', ref: 'Strengths', speaker: 'wren', text: 'The delivery is complete, and I used no GPS. To summarise the KLT tracker: assume brightness constancy; estimate motion in small windows with least squares; track only corners, where the structure tensor has two large eigenvalues; refine each estimate iteratively to sub-pixel accuracy; use image pyramids for large motion; and verify every track.' },
      { topic: 'Strengths and limits', ref: 'Limits', speaker: 'wren', text: 'KLT is fast and accurate, and simple enough to run on a small robot. Its limitations: it needs small motion between frames and consistent brightness, and it cannot recognise a point again once it has lost it. The Lab Notebook covers the methods that address these limitations.' },
    ],
    notebook: [
      { title: 'Strengths', level: 'story', body: R`
- Sub-pixel accuracy (~0.05–0.1 px on good corners).
- No descriptors (unlike SIFT/ORB): no extraction or matching cost.
- Very fast; runs on embedded CPUs and microcontrollers.
- Mathematically transparent: the failure modes are predictable from $H$.` },
      { title: 'Limits', level: 'story', body: R`
- Assumes small motion and brightness constancy; needs pyramids or priors for fast motion.
- Drifts over long sequences (frame-to-frame errors accumulate) unless checked against the original template.
- No re-identification: a lost point that reappears gets a new identity (no loop closure).
- Fails on textureless or repetitive scenes, and at occlusion boundaries.` },
      { title: 'When to use it', level: 'story', body: R`
- High frame-rate video with small inter-frame motion.
- Tight compute budgets: robots, phones, microcontrollers.
- Front-end of visual(-inertial) odometry (e.g. VINS-Mono, MSCKF use KLT-style tracking).
- Not ideal for: wide-baseline matching, relocalisation, very fast or low-frame-rate motion → use descriptors or learned matchers.` },
      { title: 'State of the art', level: 'story', body: R`
KLT (1981–1994) is still in daily use, but four lines of later work address its limits.

**Dense, learned optical flow.** Neural networks now estimate flow at every pixel. FlowNet (Dosovitskiy et al., ICCV 2015) showed a network can learn flow end to end; PWC-Net (Sun et al., CVPR 2018) built pyramids, warping and cost volumes into the network, the same coarse-to-fine idea as Section 5; RAFT (Teed & Deng, ECCV 2020, best paper) iteratively refines a flow field using correlations between all pairs of pixels. These methods are far more accurate on large motion and textureless regions, but they need a GPU.

**Tracking any point over long videos.** KLT follows points frame to frame and loses them at occlusions. PIPs (Harley et al., ECCV 2022, "Particle Video Revisited") estimates a point's trajectory over many frames at once and can track through short occlusions. TAP-Vid (Doersch et al., NeurIPS 2022) defined the "track any point" task and benchmark; TAPIR (Doersch et al., ICCV 2023) matches a query point in every frame and then refines the trajectory; CoTracker (Karaev et al., ECCV 2024) tracks many points jointly, using the correlations between their motions.

**Learned features and matching.** For large viewpoint changes, where KLT's small-motion assumption fails, systems detect and match keypoints instead. SuperPoint (DeTone et al., CVPR Workshops 2018) learns keypoints and descriptors; SuperGlue (Sarlin et al., CVPR 2020) and LightGlue (Lindenberger et al., ICCV 2023) learn to match them, LightGlue at a fraction of the cost.

**KLT inside modern systems.** Visual–inertial odometry still often uses KLT-style tracking as its front end because it is cheap and precise: for example MSCKF (Mourikis & Roumeliotis, ICRA 2007) and VINS-Mono (Qin et al., IEEE T-RO 2018). Descriptor-based SLAM such as ORB-SLAM (Mur-Artal et al., IEEE T-RO 2015) trades some precision for the ability to recognise places again. Event cameras offer microsecond timing for very fast motion; EKLT (Gehrig et al., IJCV 2020) tracks features detected in frames using the event stream.

**Choosing a method.** On a small robot with a CPU budget and high frame rate, KLT remains a strong default. Learned trackers win when motion is large, objects are occluded, or a GPU is available; descriptors win when the robot must recognise a place again after losing track.` },
    ],
    widget: 'briefing',
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

export const disclaimer = 'Dr. Lucas, Dr. Kanade and Dr. Tomasi are fictional characters named in honour of the researchers behind the KLT tracker. Their lines are written for this story and are not quotes. The footage is a Three.js simulation of the real route from Happy Star Bakery to Seward Park: street layout and buildings from OpenStreetMap (© OpenStreetMap contributors, ODbL), photo textures CC0 from Poly Haven; storefront interiors and generic signs are invented.';
