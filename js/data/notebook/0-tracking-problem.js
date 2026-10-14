// Lab Notebook sections for chapter 0 ("boot").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'The tracking problem', level: 'story', body: R`
A **feature tracker** takes a sequence of images and a set of points or regions in the first frame, and returns the locations of the set in every subsequent frame.

- **Input:** consecutive frames $I_k, I_{k+1}$ and point locations $\mathbf{x}_i$ in $I_k$.
- **Output:** new locations $\mathbf{x}_i + \mathbf{d}_i$ in $I_{k+1}$, additionally a flag saying whether the region is still eligible for tracking.

The **Kanade–Lucas–Tomasi (KLT)** tracker combines three ideas that the following chapters develop: local optical flow, iterative image alignment (Lucas & Kanade, 1981; Tomasi & Kanade, 1991), and choosing points that are *trackable* (Shi & Tomasi, 1994).

![**Figure 1. Sparse optical flow.** KLT tracks on Wren's footage as it turns left at the park entrance. Each arrow is a feature's motion over 6 frames, drawn 4× longer. During a pure rotation a point's image motion does not depend on its depth, so near and far points shift by about the same amount; under forward motion (Chapter 6) the arrows would instead fan out from the heading.](assets/figures/flow-field.jpg)` },
    { title: 'Why not just match descriptors?', level: 'story', body: R`
Another way to follow points is to **detect and match** in every frame: find keypoints, describe each with a vector (SIFT, ORB, ...), and match vectors between frames.

KLT makes a different assumption: between two consecutive video frames, most points move only a few pixels. How far a point moves depends on the camera, its motion, object's motion (at the location of the point) and the point's depth. For a point at depth $Z$ near the image centre, seen by a camera with focal length $f$ (in pixels) translating sideways at speed $v_\perp$ and recording at a given frame rate,

$$\|\mathbf{d}\| \approx \frac{f\, v_\perp}{Z \cdot \text{fps}}.$$

For this robot ($f \approx 582$ px for a 960 px wide image with a 79° horizontal field of view, $v_\perp = 1.3$ m/s, 24 fps) a point 3 m away moves about 10 px between frames, and a point 1 m away about 30 px. Turning adds a further shift that is the same at every depth. Near points and sideways motion are the hard cases; distant points and points close to the direction of travel move least. So instead of searching the whole image, KLT starts at the old position and *slides* a small patch until it lines up. This gives three advantages:

- **Sub-pixel accuracy:** the computed distance can be a continuous shift such as 3.27 px.
- **No descriptors:** nothing to compute, store, or match.
- **Speed:** a few small linear solves per point. It can even run on microcontrollers.

On the other hand, when the motion is large or the image changes appearance, the assumption fails. (Chapter 3 deals with these cases.)` },
    { title: 'Notation used throughout', level: 'math', body: R`
| Symbol | Meaning |
| $I(x, y, t)$ | image brightness at pixel $(x, y)$ and time $t$ |
| $I_k$ | the $k$-th video frame, $I_k(\mathbf{x}) = I(\mathbf{x}, t_k)$ |
| $\mathbf{x} = (x, y)^\top$ | a pixel location |
| $\nabla I = (I_x, I_y)^\top$ | spatial gradient, $I_x = \partial I / \partial x$ |
| $I_t$ | temporal derivative, in practice $I_{k+1}(\mathbf{x}) - I_k(\mathbf{x})$ |
| $\mathbf{d} = (u, v)^\top$ | displacement (flow) of a point between frames |
| $\mathcal{W}$ | a small window (patch) around a feature, e.g. $15 \times 15$ px |
| $T(\mathbf{x})$ | the template: the patch from the earlier frame |

Images are treated as continuous functions; derivatives are approximated with finite differences, and values between pixels with bilinear interpolation.

We write $\mathbf{d} = (u, v)$ for the flow of a point. When tracking is posed as image alignment (Chapter 4), the same displacement is called $\mathbf{p}$, the parameters of a warp. We call the sequence of positions of one point over time a track.` },
];
