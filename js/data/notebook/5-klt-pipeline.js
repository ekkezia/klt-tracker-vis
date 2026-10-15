// Lab Notebook sections for chapter 5 ("crowd").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'The KLT loop', level: 'story', body: R`
For every frame, a KLT tracker runs the pieces built in the previous chapters as one loop:

![**Figure 5. The KLT loop.** Shi–Tomasi detection seeds the tracks on the first frame and tops them up later; each frame runs detect/replenish → track → verify, which keeps roughly $N$ tracks alive.](assets/figures/klt-loop.svg)

1. **Detect / replenish.** On the first frame, find Shi–Tomasi corners (Ch 2) over the whole image. Later, when fewer than $N$ tracks remain, mask a radius around the survivors and detect again in the empty regions. Keep the strongest corners, at least a minimum distance apart.
2. **Track.** For each track at $\mathbf{x}_i^k$, find the displacement
   $$\mathbf{d}_i = \arg\min_{\mathbf{d}} \sum_{\mathcal{W}} [I_{k+1}(\mathbf{x} + \mathbf{d}) - I_k(\mathbf{x})]^2$$
   with pyramidal Lucas–Kanade (Ch 3–4), starting from an initial guess: zero, the last velocity, or a gyroscope prediction.
3. **Verify.** Drop tracks that fail a check (Ch 3–4): forward–backward error above $\theta_{FB}$, residual per pixel above $\theta_E$, $\lambda_{\min}(H)$ below $\tau$, no convergence, or the window leaving the image.

Detection is the expensive step, so it runs only when needed; tracking is cheap and runs on every point every frame.` },
    { title: 'Parameters that matter', level: 'story', body: R`
| Parameter | Typical | Effect |
| Window | 15–31 px | larger: more robust, less precise near depth edges |
| Pyramid levels, $L$ (above full resolution) | 2–4 | more: handles larger motion |
| Max corners, $N$ | 100–500 | more: robustness and cost |
| Min distance | 7–15 px | more: spreads points over the image |
| FB threshold, $\theta_{FB}$ | 0.5–1 px | lower: stricter, fewer bad tracks |
| $\lambda_{\min}$ floor, $\tau$ | above the noise floor | rejects blank or edge-only patches |

The footage in this story was tracked with: 21 px window, $L = 3$, $N = 100$, 12 px spacing, FB 1 px, and an absolute $\lambda_{\min}$ floor of $10^{-3}$ (OpenCV units; see tools/track_video.py). The floor matters: OpenCV's quality level is *relative* to the best corner in the frame, so on a nearly blank frame it accepts video-compression noise as "corners". On a synthetic test clip, the floor reduced about 17,000 short-lived tracks to 692.` },
    { title: 'Lifetime of a track', level: 'story', body: R`
A track lives from the frame its corner is detected to the frame a check fails. On this route, deaths cluster where the chapters predict:

- **Crossing Canal Street** (Ch 3): large, jerky motion near the robot.
- **At the box truck** (Ch 2): blank panel and long edges.
- **Few deaths in the park and at the dock**: slow motion, strong corners.

Because new tracks get new identities, KLT alone can't tell that a point it sees again is one it saw before. That needs descriptors or a map (Ch 7).` },
    { title: 'Evaluating tracking quality', level: 'story', body: R`
Three common measures:

- **Position error against ground truth.** The distance between each tracked and true position. It is the most direct measure, but it needs known true positions: from a simulator, as for this story's footage, or from hand labelling.
- **Forward–backward error** (Ch 3). A proxy when there is no ground truth. The **Mean err** in the top-left panel is its mean over the current frame's tracks, in pixels.
- **Track length and survival.** How long tracks live and how many survive each frame. Short lifetimes signal fast motion, occlusion or weak features.

Report accuracy together with track length: a tracker can look accurate simply by dropping every difficult point.` },
];
