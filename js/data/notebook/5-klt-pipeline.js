// Lab Notebook sections for chapter 5 ("crowd") (also feeds the Full article via js/data/article.js).
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
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

- **Crossing Canal Street** (Ch 3): large, jerky motion near the robot.
- **At the box truck** (Ch 2): blank panel and long edges.
- **Few deaths in the park and at the dock**: slow motion, strong corners.

Because new tracks get new identities, KLT alone can't tell that a point it sees again is one it saw before. That needs descriptors or a map (Ch 7).` },
    { title: 'Evaluating tracking quality', level: 'story', body: R`
How good is a tracker? Three common measures:

- **Position error against ground truth.** With known true positions (from a simulator, like this story's footage, or from hand-labelled data), measure the distance between each tracked and true position. This is the most direct measure, but ground truth is rarely available.
- **Forward–backward error.** Without ground truth, the forward–backward error of Chapter 3 is a useful proxy: consistent tracks have small $e_{FB}$. The **Mean err** shown in the top-left panel is the mean forward–backward error of the tracked points in the current frame, in pixels.
- **Track length and survival.** How many frames a track lives, and how many tracks survive each frame. Short lifetimes signal fast motion, occlusion or weak features.

A good evaluation reports accuracy together with track length, since a tracker can look accurate simply by dropping every difficult point.` },
];
