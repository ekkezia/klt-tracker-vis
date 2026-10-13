// Lab Notebook sections for chapter 6 ("docking") (also feeds the Full article via js/data/article.js).
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'Visual odometry (outline)', level: 'math', body: R`
- For a camera with translation $\mathbf{t}$ and rotation $\boldsymbol{\omega}$, flow at normalised image point $(x, y)$ with depth $Z$ is
$$\begin{bmatrix} u \\ v \end{bmatrix} = \frac{1}{Z}\begin{bmatrix} -1 & 0 & x \\ 0 & -1 & y \end{bmatrix}\mathbf{t} + \begin{bmatrix} xy & -(1+x^2) & y \\ 1+y^2 & -xy & -x \end{bmatrix}\boldsymbol{\omega}.$$
- Rotation moves every point regardless of depth; translation moves near points more. Pure forward motion radiates from the **focus of expansion**.
- Monocular VO: estimate the essential matrix from tracks with RANSAC, recover $R, \mathbf{t}$ up to scale; VIO fixes scale with the IMU.
- Convention: $\mathbf{t}$ and $\boldsymbol{\omega}$ are the camera's linear and angular velocity, and $(x, y)$ are normalised image coordinates. This is the Longuet-Higgins & Prazdny form, and its rows are exactly the interaction matrix used for visual servoing below.` },
    { title: 'Expansion and time-to-contact (outline)', level: 'math', body: R`
- A point at image distance $r$ from the focus of expansion, on a surface approaching at constant speed: $\tau = Z / (-\dot Z) = r / \dot r$.
- For an object region: $\tau \approx 2 / \operatorname{div}(\mathbf{u})$ for a fronto-parallel surface, or from the growth rate of the spread of its tracks.
- Tracks that disagree with the ego-motion model (RANSAC outliers) belong to independently moving objects.` },
    { title: 'Image-based visual servoing (outline)', level: 'math', body: R`
- Features $\mathbf{s}$ (tracked corner positions), desired features $\mathbf{s}^*$ (positions when docked). Error $\mathbf{e} = \mathbf{s} - \mathbf{s}^*$.
- Interaction matrix for one normalised point $(x, y)$ at depth $Z$ (Chaumette & Hutchinson, 2006):
$$L = \begin{bmatrix} -1/Z & 0 & x/Z & xy & -(1+x^2) & y \\ 0 & -1/Z & y/Z & 1+y^2 & -xy & -x \end{bmatrix}, \qquad \dot{\mathbf{s}} = L\,\mathbf{v}_c.$$
- Control law for exponential error decay: $\mathbf{v}_c = -\lambda\, \widehat{L}^{+} \mathbf{e}$ (pseudo-inverse of the stacked $L$; at least 3 points for 6 DOF, 4+ in practice).` },
    { title: 'Why KLT suits these jobs', level: 'story', body: R`
- Sub-pixel accuracy → smooth, low-noise motion and error signals.
- High rate, low latency → stable estimation and control loops.
- Persistent identities over short spans → each track is a consistent measurement.

| | Sparse (KLT) | Dense (Farnebäck, TV-L1, RAFT...) |
| Output | flow at ~100–1000 points | flow at every pixel |
| Cost | very low, CPU / MCU | high, often GPU |
| Accuracy at features | sub-pixel | varies |
| Textureless regions | no answer (by design) | filled in by regularisation |
| Best for | odometry, tracking, servoing | segmentation, obstacle maps |` },
];
