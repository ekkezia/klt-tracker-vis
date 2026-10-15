// Lab Notebook sections for chapter 3 ("sprint").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'Image pyramids: coarse-to-fine tracking', level: 'math', body: R`
The linearisation in Chapter 1 (first order Taylor expansion) holds only while the displacement is smaller than about half the dominant spatial wavelength of the patch, typically a few pixels. Fast motion breaks that assumption. To address this, an **image pyramid** is used to turn a large displacement into a small one.

**Building the pyramid.** Level $0$ is the original image $I^0$. Each further level is the previous one low-pass filtered (to avoid aliasing) and downsampled by 2:
$$I^{\ell}(\mathbf{x}) = \big(G * I^{\ell-1}\big)(2\mathbf{x}), \qquad \ell = 1, \dots, L.$$
Thus, a large displacement of $\mathbf{d}$ pixels at level 0 is only $\mathbf{d}/2^{\ell}$ at level $\ell$: 8 px becomes 1 px at level 3.

![**Figure 4. A four-level pyramid ($L = 3$)** The circled feature moves 8.3 px between frames at level 0 (full resolution), too far for one linearised step. At levels 1, 2 and 3 the same motion is 4.1, 2.1 and 1.0 px. KLT solves at level 3 first, then doubles the estimate and refines it at each finer level.](assets/figures/pyramid.jpg)

**Coarse to fine.** The standard pyramidal formulation, as implemented in OpenCV (Bouguet, 2000), applies a coarse-to-fine strategy long used in motion estimation (e.g. Bergen et al., 1992): Start at the top level with the guess $\mathbf{g}^L = \mathbf{0}$. At each level $\ell$, run Lucas–Kanade (the iterative solver of Chapter 4) on $I^\ell_k$ and $I^\ell_{k+1}$, starting from the guess, to find a small residual $\mathbf{d}^\ell$. Pass the result down, doubled for the finer grid:
$$\mathbf{g}^{\ell-1} = 2\,(\mathbf{g}^{\ell} + \mathbf{d}^{\ell}), \qquad \mathbf{d} = \mathbf{g}^{0} + \mathbf{d}^{0}.$$
Each level only has to correct a residual of about one pixel, so the linearisation holds at every level. With levels indexed from $0, \dots, L$, the largest trackable motion grows by a factor of $2^{L+1} - 1$; with $L = 3$ that is 15 times the single-level range.

**Costs and limits.** The extra levels add a factor of about one third to the memory, and LK runs at every level. Fine texture is smoothed away at coarse levels, so small features, and small objects moving differently from their surroundings, are tracked poorly. A fixed-size window covers $2^\ell$ times more of the scene at level $\ell$, so it is more likely to straddle a depth boundary there. A wrong estimate at a coarse level cannot be undone by the finer levels, which only correct about a pixel. Typical settings: $L = 2$–$4$ and a $21 \times 21$ window.` },
    { title: 'Blur, low light and illumination changes', level: 'story', body: R`
Lucas–Kanade assumes the patch looks the same in both frames. Two common effects break that.

**Motion blur and low light.** During the exposure the image moves, so edges are smeared along the direction of motion. Gradients along that direction shrink, $H$ becomes closer to rank 1 (edge-like), and $\lambda_{\min}$ drops. Low light adds sensor noise. Both make the estimate less certain, since its covariance grows like $\sigma^2 H^{-1}$. Remedies: a shorter exposure (at the cost of more noise), a global-shutter camera, or keeping fewer but stronger features.

**Illumination changes.** Auto-exposure, shadows and flicker scale and shift the brightness of a patch. A simple fix is to model gain and bias, $T(\mathbf{x}) \approx \alpha\, I(\mathbf{x} + \mathbf{p}) + \beta$, and solve for $\alpha, \beta$ together with $\mathbf{p}$; another is to compare **zero-mean, normalised** patches (normalised cross-correlation), which ignores gain and bias by construction. Fixing the camera's exposure while recording avoids most of the problem.` },
    { title: 'The forward–backward test and re-detection', level: 'math', body: R`
**Note:** These tests are not part of the original KLT, which relied on the residual and dissimilarity checks, but they are common additions in practice (e.g. VINS-Fusion).

A tracker can converge to the wrong place, for example on a repeated pattern or when the feature is occluded, and the residual alone does not always reveal it. The **forward–backward test** (Kalal, Mikolajczyk & Matas, 2010) checks each track for self-consistency.

Track a point forward from frame $k$ to $k+1$, then track the result backward from $k+1$ to $k$:
$$\mathbf{x}_k \xrightarrow{\text{LK}} \hat{\mathbf{x}}_{k+1} \xrightarrow{\text{LK}} \tilde{\mathbf{x}}_k, \qquad e_{FB} = \|\mathbf{x}_k - \tilde{\mathbf{x}}_k\|.$$
A correct track should return to where it started, so $e_{FB}$ is close to zero. Tracks with $e_{FB}$ above a threshold $\theta$ (typically 0.5–1 px) are dropped. The test doubles the tracking cost and needs no extra model or ground truth.

**Other checks and re-detection.** A track also ends when the iteration does not converge, the residual is high, the corner becomes weak, or the window leaves the image (Chapter 4). To keep the count near $N$, mask a radius around each surviving track and add the strongest new Shi–Tomasi corners in the unmasked area. Tracks that pass every check can still lie on moving objects. When the tracks feed camera-motion estimation, RANSAC on a homography or essential matrix separates them from the dominant motion.

**Predicting motion with a gyroscope.** Pyramids are one answer to large motion; a prediction is another. A gyroscope gives the rotation $R$ between frames, and for pure rotation image points map by the homography $\mathbf{x}' \simeq K R K^{-1} \mathbf{x}$ (with $R$ mapping camera-$k$ to camera-$(k{+}1)$ coordinates, intrinsics $K$). Using this as the initial guess $\mathbf{g}$ removes most rotational motion, leaving LK only a small translational residual. Visual–inertial odometry systems build on this pairing.` },
];
