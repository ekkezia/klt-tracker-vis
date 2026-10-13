// Lab Notebook sections for chapter 3 ("sprint") (also feeds the Full article via js/data/article.js).
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
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
];
