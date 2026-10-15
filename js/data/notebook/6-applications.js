// Lab Notebook sections for chapter 6 ("docking").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'From tracks to motion', level: 'story', body: R`
A tracker is rarely the end goal. Its output, a set of points and how they moved between frames, is a measurement that other components of the robot use. Below are three uses, each asking a different question of the same tracks:

- **Visual odometry:** how is the camera moving?
- **Time-to-contact:** how soon will the robot reach the surface ahead?
- **Visual servoing:** how should the robot move to bring the tracks to where they should be, for example when docking?

All three depend on how the camera's motion produces the image motion that KLT measures.` },
    { title: 'Visual odometry ', level: 'math', body: R`
Visual odometry runs that relation in reverse: from the measured flow of many tracks, estimate the camera's motion.

- For a static scene and a camera with linear velocity $\mathbf{t}$ and angular velocity $\boldsymbol{\omega}$ (both in the camera frame), the flow at normalised image point $(x, y)$ with depth $Z$ is
$$\begin{bmatrix} u \\ v \end{bmatrix} = \frac{1}{Z}\begin{bmatrix} -1 & 0 & x \\ 0 & -1 & y \end{bmatrix}\mathbf{t} + \begin{bmatrix} xy & -(1+x^2) & y \\ 1+y^2 & -xy & -x \end{bmatrix}\boldsymbol{\omega}.$$
  Here $(u, v)$ is in normalised units per second; multiply by $f$ and divide by the frame rate for pixels per frame. This is the Longuet-Higgins & Prazdny form.
- Rotation moves every point regardless of depth; translation moves near points more. Pure forward motion radiates from the **focus of expansion**.
- Monocular VO: estimate the essential matrix from tracks with RANSAC, recover $R, \mathbf{t}$ up to scale; VIO fixes scale with the IMU.` },
    { title: 'Expansion and time-to-contact ', level: 'math', body: R`
When the robot drives towards a surface, the tracks on it spread apart. How fast they spread tells the robot how soon it will arrive, without knowing the distance or its own speed.

- Under pure translation, a point at image distance $r$ from the focus of expansion has $\tau = Z / (-\dot Z) = r / \dot r$; at constant approach speed this is the time to contact.
- For an object region: $\tau \approx 2 / \operatorname{div}(\mathbf{u})$ for a fronto-parallel surface, or from the growth rate of the spread $s$ of its tracks, $\tau \approx s / \dot s$.
- Tracks that disagree with the ego-motion model (RANSAC outliers) belong to independently moving objects.` },
    { title: 'Image-based visual servoing ', level: 'math', body: R`
Visual servoing closes the loop: instead of estimating motion from tracks, it chooses the motion that moves the tracks to a target. For docking, the target is where the tracked corners appear when the robot is in place.

- Features $\mathbf{s}$ (tracked corner positions), desired features $\mathbf{s}^*$ (positions when docked). Error $\mathbf{e} = \mathbf{s} - \mathbf{s}^*$.
- Interaction matrix for one normalised point $(x, y)$ at depth $Z$ (Chaumette & Hutchinson, 2006), the same relation as in visual odometry, written as a matrix:
$$L = \begin{bmatrix} -1/Z & 0 & x/Z & xy & -(1+x^2) & y \\ 0 & -1/Z & y/Z & 1+y^2 & -xy & -x \end{bmatrix}, \qquad \dot{\mathbf{s}} = L\,\mathbf{v}_c, \quad \mathbf{v}_c = (\mathbf{t}, \boldsymbol{\omega}).$$
- Control law: $\mathbf{v}_c = -\lambda\, \widehat{L}^{+} \mathbf{e}$ (pseudo-inverse of the stacked $L$), which makes the error decay exponentially when $\widehat{L}$ is accurate. At least 3 points are needed for 6 DOF; 4+ in practice, to avoid singular configurations.` },
    { title: 'Why KLT suits these jobs', level: 'story', body: R`
All three applications need the same things from their measurements, and KLT provides them:

- Sub-pixel accuracy → smooth, low-noise motion and error signals.
- High rate, low latency → stable estimation and control loops.
- Persistent identities over short spans → each track is a consistent measurement.` },
];
