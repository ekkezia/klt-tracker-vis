// Lab Notebook sections for chapter 7 ("debrief").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'Strengths', level: 'story', body: R`
- Sub-pixel accuracy (~0.05–0.1 px on good corners).
- No descriptors (unlike SIFT/ORB): no extraction or matching cost.
- Very fast; runs on embedded CPUs and microcontrollers.
- Mathematically transparent: the failure modes are predictable from $H$.` },
    { title: 'Limits', level: 'story', body: R`
- Assumes small motion and brightness constancy; needs pyramids or priors for fast motion.
- Drifts over long sequences (frame-to-frame errors accumulate) unless checked against the original template.
- No re-identification: a lost point that reappears gets a new identity (no loop closure).
- Fails on textureless or repetitive scenes, and at occlusion boundaries.` },
    { title: 'When to use it', level: 'story', body: R`
- High frame-rate video with small inter-frame motion.
- Tight compute budgets: robots, phones, microcontrollers.
- Front-end of visual(-inertial) odometry (e.g. VINS-Mono, MSCKF use KLT-style tracking).
- Not ideal for: wide-baseline matching, relocalisation, very fast or low-frame-rate motion → use descriptors or learned matchers.` },
    { title: 'State of the art', level: 'story', body: R`
KLT (1981–1994) is still in daily use, but four lines of later work address its limits.

**Dense, learned optical flow.** Neural networks now estimate flow at every pixel. FlowNet (Dosovitskiy et al., ICCV 2015) showed a network can learn flow end to end; PWC-Net (Sun et al., CVPR 2018) built pyramids, warping and cost volumes into the network, the same coarse-to-fine idea as Section 4; RAFT (Teed & Deng, ECCV 2020, best paper) iteratively refines a flow field using correlations between all pairs of pixels. These methods are far more accurate on large motion and textureless regions, but they need a GPU.

**Tracking any point over long videos.** KLT follows points frame to frame and loses them at occlusions. PIPs (Harley et al., ECCV 2022, "Particle Video Revisited") estimates a point's trajectory over many frames at once and can track through short occlusions. TAP-Vid (Doersch et al., NeurIPS 2022) defined the "track any point" task and benchmark; TAPIR (Doersch et al., ICCV 2023) matches a query point in every frame and then refines the trajectory; CoTracker (Karaev et al., ECCV 2024) tracks many points jointly, using the correlations between their motions.

**Learned features and matching.** For large viewpoint changes, where KLT's small-motion assumption fails, systems detect and match keypoints instead. SuperPoint (DeTone et al., CVPR Workshops 2018) learns keypoints and descriptors; SuperGlue (Sarlin et al., CVPR 2020) and LightGlue (Lindenberger et al., ICCV 2023) learn to match them, LightGlue at a fraction of the cost.

**KLT inside modern systems.** Visual–inertial odometry still often uses KLT-style tracking as its front end because it is cheap and precise: for example MSCKF (Mourikis & Roumeliotis, ICRA 2007) and VINS-Mono (Qin et al., IEEE T-RO 2018). Descriptor-based SLAM such as ORB-SLAM (Mur-Artal et al., IEEE T-RO 2015) trades some precision for the ability to recognise places again. Event cameras offer microsecond timing for very fast motion; EKLT (Gehrig et al., IJCV 2020) tracks features detected in frames using the event stream.

**Choosing a method.** On a small robot with a CPU budget and high frame rate, KLT remains a strong default. Learned trackers win when motion is large, objects are occluded, or a GPU is available; descriptors win when the robot must recognise a place again after losing track.` },
];
