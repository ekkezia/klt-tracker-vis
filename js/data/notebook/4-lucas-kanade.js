// Lab Notebook sections for chapter 4 ("corridor").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'Tracking as image alignment', level: 'story', body: R`
Chapter 1 solved for a feature's motion with a single linear solve, which gets close to the true answer but not to the exact solution. Lucas–Kanade modified that solve into an iteration. For each feature, cut a small **template** $T$ around it. In the new frame, find the **warp parameters** $\mathbf{p}$ that best align the image with $T$; for pure translation, $\mathbf{p}$ is the displacement $\mathbf{d}$. Start from a guess (the previous position), measure the mismatch, compute a correction from local gradients, and repeat. Each iteration is one small linear solve.

**Which frame does the template come from?** A template from the *previous frame* adapts to slow changes in appearance (lighting, viewpoint, scale), but small errors add up over time, so the track **drifts**. A template from the *first frame* does not drift, but it fails once the feature's appearance has changed too much. Shi & Tomasi (1994) combine the two: they track frame-to-frame with a translation model, and compare the feature with its first-frame template using an affine warp, dropping it if the *dissimilarity* becomes too large. The tracker used for this story's footage (OpenCV) tracks frame-to-frame. (For frame-to-frame translation, $T$ is simply the window from $I_k$, $I$ is the next frame $I_{k+1}$, and $\mathbf{p} = \mathbf{d}$. The new notation matters only when the template comes from an older frame or the warp has more parameters than a shift (below).)` },
    { title: 'The SSD objective', level: 'math', body: R`
$$E(\mathbf{p}) = \sum_{\mathbf{x} \in \mathcal{W}} \big[\, I(W(\mathbf{x}; \mathbf{p})) - T(\mathbf{x}) \,\big]^2$$

For translation, $W(\mathbf{x}; \mathbf{p}) = \mathbf{x} + \mathbf{p}$. The sum runs over the template's pixels. $E$ is non-linear in $\mathbf{p}$ because the image $I$ is an arbitrary function of position.` },
    { title: 'One step: H Δp = b', level: 'math', body: R`
Given a current estimate $\mathbf{p}$, look for an increment $\Delta\mathbf{p}$. Linearise the image around the current estimate,

$$I(\mathbf{x} + \mathbf{p} + \Delta\mathbf{p}) \approx I(\mathbf{x} + \mathbf{p}) + \nabla I^\top \Delta\mathbf{p},$$

with $\nabla I$ evaluated at $\mathbf{x} + \mathbf{p}$. $E$ becomes quadratic in $\Delta\mathbf{p}$, and setting its gradient to zero gives

$$\underbrace{\Big(\sum_{\mathbf{x}} \nabla I\, \nabla I^\top\Big)}_{H}\, \Delta\mathbf{p} \;=\; \underbrace{\sum_{\mathbf{x}} \nabla I \,\big[\, T(\mathbf{x}) - I(\mathbf{x}{+}\mathbf{p}) \,\big]}_{\mathbf{b}}.$$

Each step solves the Chapter 1 problem again, on the mismatch that remains. In Chapter 1 the mismatch compared the two frames at the same pixel, $I_{k+1}(\mathbf{x}) - I_k(\mathbf{x})$. Here it compares the new frame at the current estimate with the template, $I_t := I(\mathbf{x}{+}\mathbf{p}) - T(\mathbf{x})$. At the first step ($\mathbf{p} = \mathbf{0}$) the two are identical.

$H$ is built from gradients of the new frame at $\mathbf{x} + \mathbf{p}$, while the detector (Chapter 2) built it from the old frame at $\mathbf{x}$. As the estimate converges, the shifted patch matches the template and the two matrices agree. So a feature the detector found well-conditioned also gives a well-conditioned system during tracking.` },
    { title: 'Gauss–Newton iteration', level: 'math', body: R`
$$\Delta\mathbf{p} = H^{-1}\mathbf{b}, \qquad \mathbf{p} \leftarrow \mathbf{p} + \Delta\mathbf{p}, \qquad \text{repeat until } \|\Delta\mathbf{p}\| < \varepsilon \text{ or } j = j_{\max}.$$

**Why "Gauss–Newton".** Let the residuals be $r_\mathbf{x}(\mathbf{p}) = I(W(\mathbf{x};\mathbf{p})) - T(\mathbf{x})$ and their Jacobian $J$. Newton's method uses the true Hessian of $E$, $2(J^\top J + \sum r\, \nabla^2 r)$. Gauss–Newton drops the second term and uses $J^\top J$, which is accurate near the solution, where residuals are small, and always positive semi-definite. $H$ above is exactly $J^\top J$.

Typical settings: $\varepsilon = 0.01$–$0.03$ px and $j_{\max} = 10$–$30$ iterations. Convergence takes a few iterations when the initial error is within the range of the linearisation; image pyramids (Chapter 3) extend that range. A track whose iteration hits $j_{\max}$, or whose final residual $E$ per pixel is high, is dropped.` },
    { title: 'General warps and the inverse compositional trick', level: 'math', body: R`
For a warp with more parameters, the derivation is the same, but each parameter gets its own column in place of $I_x, I_y$: the brightness change per unit change of that parameter, $\nabla I \, \partial W / \partial p_j$ (Baker & Matthews, 2004). $H$ then becomes $n \times n$ for $n$ parameters.

The affine warp is the common example. It has six parameters:
$$W(\mathbf{x};\mathbf{p}) = \begin{bmatrix} (1 + p_1)\,x + p_3\, y + p_5 \\ p_2\, x + (1 + p_4)\, y + p_6 \end{bmatrix}, \qquad \frac{\partial W}{\partial \mathbf{p}} = \begin{bmatrix} x & 0 & y & 0 & 1 & 0 \\ 0 & x & 0 & y & 0 & 1 \end{bmatrix},$$
so $H$ is $6 \times 6$.

In the form derived above, $H$ uses the gradient of the new image and must be recomputed every iteration. The *inverse compositional* variant, from the same paper, swaps the roles of image and template and uses $\nabla T$ instead, so $H$ is computed once per feature. The result is the same to first order but much cheaper. For translation, this $H$ is exactly the template's structure tensor.

KLT combines these pieces. It tracks with translation frame-to-frame, which is robust and cheap, and uses the affine warp only to *check* a feature against its first-frame template. Practical implementations such as OpenCV's compute the template's gradients and $H$ once per pyramid level, in the inverse compositional style.` },
    { title: 'Sub-pixel sampling', level: 'math', body: R`
To read $I$ at a non-integer point $(x, y)$, let $x_0 = \lfloor x \rfloor$, $y_0 = \lfloor y \rfloor$, $\alpha = x - x_0$, $\beta = y - y_0$, and $I_{ij} = I(x_0 + i,\, y_0 + j)$:

$$I(x, y) \approx (1{-}\alpha)(1{-}\beta)\,I_{00} + \alpha(1{-}\beta)\,I_{10} + (1{-}\alpha)\beta\,I_{01} + \alpha\beta\,I_{11}.$$

Bilinear interpolation makes $E$ continuous in $\mathbf{p}$, so Gauss–Newton can settle between pixel centres. Its derivative, however, jumps at pixel boundaries. Practical trackers therefore compute smoothed derivative images once (e.g. Sobel or Scharr filters of a slightly blurred image, Chapter 1) and interpolate *those* bilinearly, which gives a well-behaved gradient. Typical accuracy on good features is around 0.05–0.1 px.` },
];
