// Lab Notebook sections for chapter 0 ("boot") (also feeds the Full article via js/data/article.js).
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
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

The price: when motion is large or the image changes appearance, the bet fails. Chapter 3 is about paying that price.` },
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

We write $\mathbf{d} = (u, v)$ for the flow of a point. When tracking is posed as image alignment (Chapter 4), the same displacement is called $\mathbf{p}$, the parameters of a warp.` },
];
