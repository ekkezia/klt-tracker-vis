// Lab Notebook sections for chapter 4 ("corridor") (also feeds the Full article via js/data/article.js).
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
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

Typical settings: $\varepsilon = 0.01$–$0.03$ px, $k_{\max} = 10$–$30$, window $15 \times 15$ to $31 \times 31$. Convergence is usually fast (a few iterations) when the initial error is smaller than about half the dominant spatial wavelength in the window: the distance over which the linear approximation of the image holds. Image pyramids (Chapter 3) enlarge this basin of attraction.` },
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

Lost features are replaced by detecting new ones in empty regions (Chapter 3).` },
];
