// Lab Notebook sections for chapter 1 ("lobby").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'The three assumptions', level: 'story', body: R`
Optical flow is the apparent motion of image brightness between consecutive frames. Estimating it relies on three assumptions:

1. **Brightness constancy**: a point looks the same in both frames (at a new location).
2. **Small motion**: the shift is small enough for the linear approximation.
3. **Spatial coherence**: all pixels in the window move together.` },
    { title: 'Brightness constancy', level: 'story', body: R`
Mathematically, the brightness constancy assumption is stated as

$$I(x + u,\; y + v,\; t + 1) = I(x,\; y,\; t)$$

i.e., the brightness at a point in the current frame is the same as the brightness at the corresponding point in the previous frame.

This holds well for matte surfaces under steady light over a short time. It breaks for shiny surfaces (highlights move differently from the surface), flickering or changing lights, auto-exposure jumps, and shadows passing over.` },
    { title: 'Optical flow constraint', level: 'math', body: R`
Take a first-order Taylor expansion of the left-hand side around $(x, y, t)$:

$$I(x{+}u, y{+}v, t{+}1) \approx I(x, y, t) + I_x u + I_y v + I_t.$$

Substituting into brightness constancy and cancelling $I(x, y, t)$:

$$I_x u + I_y v + I_t = 0 \quad\Longleftrightarrow\quad \nabla I^\top \mathbf{d} = -I_t.$$

One equation, two unknowns $(u, v)$ per pixel.

**Note:** dropping the higher-order terms is fine only when $\mathbf{d}$ is small relative to the scale over which $\nabla I$ changes. As a rule of thumb, motions above 1–2 px need the pyramid of Chapter 3.` },
    { title: 'Least squares over a window', level: 'math', body: R`
Lucas & Kanade (1981) resolve the optical flow problem *locally*: they assume constant flow inside a small window. Assume every pixel in a window $\mathcal{W}$ shares the same $\mathbf{d}$. Each pixel contributes one constraint and can be stacked as (for $n$ pixels in the window):

$$A = \begin{bmatrix} I_x(\mathbf{x}_1) & I_y(\mathbf{x}_1) \\ \vdots & \vdots \\ I_x(\mathbf{x}_n) & I_y(\mathbf{x}_n) \end{bmatrix} \implies \qquad A\,\mathbf{d} = -\begin{bmatrix} I_t(\mathbf{x}_1) \\ \vdots \\ I_t(\mathbf{x}_n) \end{bmatrix}.$$

The least-squares solution satisfies the normal equations

$$\underbrace{A^\top A}_{H}\,\mathbf{d} = \underbrace{-A^\top \mathbf{I}_t}_{\mathbf{b}}, \qquad H = \sum_{\mathcal{W}} \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix}, \quad \mathbf{b} = -\sum_{\mathcal{W}} \begin{bmatrix} I_x I_t \\ I_y I_t \end{bmatrix}.$$

So $H\mathbf{d} = \mathbf{b}$: a $2 \times 2$ system per feature.

Choosing the window size is a trade-off: larger windows average out noise and handle bigger motion, but are more likely to violate coherence.

**Local versus global methods.** In the same year Horn & Schunck (1981) proposed a *global* alternative: they solve for the flow at every pixel at once, adding a smoothness term that penalises differences between neighbouring flow vectors,
$$\min_{u, v} \iint (I_x u + I_y v + I_t)^2 + \alpha^2 \left(\|\nabla u\|^2 + \|\nabla v\|^2\right) dx\, dy.$$
The global method fills in textureless regions (dense flow); the local method gives an answer only where the image has structure, which makes it a sparse tracker.` },
    { title: 'Worked example: a blob moves one pixel', level: 'math', body: R`
Frames $f_1 = [0,0,0,9,0,0,0]$ and $f_2 = [0,0,0,0,9,0,0]$.

Central differences on $f_1$: $I_x[i] = (f_1[i{+}1] - f_1[i{-}1]) / 2$.

Time difference $I_t[i] = f_2[i] - f_1[i]$.

| $i$ | $I_x$ | $I_t$ | pointwise $u = -I_t/I_x$ | $I_x I_t$ | $I_x^2$ |
| 2 | $+4.5$ | $0$ | $0$ | $0$ | $20.25$ |
| 3 | $0$ | $-9$ | undefined | $0$ | $0$ |
| 4 | $-4.5$ | $+9$ | $2$ | $-40.5$ | $20.25$ |
| others | $0$ | $0$ | undefined | $0$ | $0$ |

No single pixel gives the right answer. The 1-D least-squares solution over the window does:

$$u^\star = -\frac{\sum I_x I_t}{\sum I_x^2} = -\frac{-40.5}{40.5} = +1.$$

In general one linear solve gets *close* to the true value but not the exact value. In practice, the final answer is refined with an iterative solver.` },
    { title: 'Computing image gradients', level: 'math', body: R`
Every formula above needs $I_x$, $I_y$ and $I_t$. On a digital image they are estimated with small filters.

- **Central differences:** $I_x \approx \tfrac{1}{2}\,[I(x{+}1, y) - I(x{-}1, y)]$, as in the example. Simple, but it amplifies pixel noise.
- **Smooth first, then differentiate.** Convolve with a small Gaussian (or use the Sobel or Scharr filters, which combine smoothing and differencing). This suppresses noise and makes the gradient vary smoothly between pixels, which the linearisation relies on.
- **Temporal derivative:** $I_t \approx I_{k+1}(\mathbf{x}) - I_k(\mathbf{x})$. Some implementations average the spatial gradient of both frames for a more symmetric estimate.

The amount of smoothing is a trade-off: more smoothing gives cleaner gradients and a wider range of convergence, less smoothing keeps fine detail and precise localisation.` },
];
