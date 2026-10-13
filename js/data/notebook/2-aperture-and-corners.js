// Lab Notebook sections for chapter 2 ("wall") (also feeds the Full article via js/data/article.js).
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
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
];
