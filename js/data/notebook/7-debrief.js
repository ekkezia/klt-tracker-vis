// Lab Notebook sections for chapter 7 ("debrief").
// Each section: { title, level: 'story' | 'math', body }.
const R = String.raw;

export default [
    { title: 'Strengths', level: 'story', body: R`
- **Sub-pixel accuracy:** about 0.05–0.1 px on good corners (Ch 4).
- **No descriptors:** nothing to extract, store or match, unlike SIFT or ORB.
- **Fast:** a few small linear solves per point, so it runs on embedded CPUs and microcontrollers.
- **Transparent:** a feature's trackability and uncertainty can be read from $H$ before tracking starts (Ch 2).` },
    { title: 'Limits', level: 'story', body: R`
- **Small motion and brightness constancy:** large motion needs pyramids or a motion prediction (Ch 3); lighting changes need gain–bias models or normalised patches.
- **Drift:** frame-to-frame errors accumulate unless the track is monitored against its first-frame template (Ch 4).
- **No re-identification:** a point that is lost and reappears gets a new identity, so there is no loop closure (Ch 5).
- **Hard scenes:** textureless or repetitive regions and occlusion boundaries.` },
    { title: 'State of the art', level: 'story', body: R`
KLT (1981–1994) is still in daily use, but four lines of later work address its limits.

**Dense optical flow.** KLT is *sparse*: it gives flow only at chosen corners. *Dense* methods estimate flow at every pixel, continuing the global approach of Horn & Schunck (Ch 1). Classical dense methods such as Farnebäck and TV-L1 were followed by learned ones using neural networks. FlowNet (Dosovitskiy et al., ICCV 2015) showed a network can learn flow end to end; PWC-Net (Sun et al., CVPR 2018) built pyramids, warping and cost volumes into the network, the same coarse-to-fine idea as Chapter 3; RAFT (Teed & Deng, ECCV 2020) iteratively refines a flow field using correlations between all pairs of pixels. Learned methods are far more accurate on large motion and textureless regions, but they need a GPU.

| | Sparse flow (KLT) | Dense flow (Farnebäck, TV-L1, RAFT, ...) |
| Output | flow at ~100–1000 points | flow at every pixel |
| Cost | very low, CPU / MCU | high, often GPU |
| Accuracy at features | sub-pixel | varies |
| Textureless regions | no answer (by design) | filled in by regularisation |
| Best for | odometry, tracking, servoing | segmentation, obstacle maps |

**Tracking any point over long videos.** KLT follows points frame to frame and loses them at occlusions. PIPs (Harley et al., ECCV 2022, "Particle Video Revisited") estimates a point's trajectory over many frames at once and can track through short occlusions. TAP-Vid (Doersch et al., NeurIPS 2022) defined the "track any point" task and benchmark; TAPIR (Doersch et al., ICCV 2023) matches a query point in every frame and then refines the trajectory; CoTracker (Karaev et al., ECCV 2024) tracks many points jointly, using the correlations between their motions.

**Learned features and matching.** For large viewpoint changes, where KLT's small-motion assumption fails, systems detect and match keypoints instead. SuperPoint (DeTone et al., CVPR Workshops 2018) learns keypoints and descriptors; SuperGlue (Sarlin et al., CVPR 2020) and LightGlue (Lindenberger et al., ICCV 2023) learn to match them, LightGlue at a fraction of the cost.

**KLT inside modern systems.** Visual–inertial odometry still often uses KLT-style tracking as its front end because it is cheap and precise: for example MSCKF (Mourikis & Roumeliotis, ICRA 2007) and VINS-Mono (Qin et al., IEEE T-RO 2018). Descriptor-based SLAM such as ORB-SLAM (Mur-Artal et al., IEEE T-RO 2015) trades some precision for the ability to recognise places again. Event cameras offer microsecond timing for very fast motion; EKLT (Gehrig et al., IJCV 2020) tracks features detected in frames using the event stream.` },
    { title: 'Choosing a method', level: 'story', body: R`
- **KLT:** high frame rate, small motion between frames, and a tight compute budget, as on robots, phones and microcontrollers, or as the front end of visual(-inertial) odometry.
- **Learned trackers or dense flow:** large motion, occlusions, textureless scenes, and a GPU available.
- **Descriptors:** wide-baseline matching, or recognising a place again after the track is lost.` },
    { title: 'Conclusion', level: 'story', body: R`
KLT is built from a few simple ideas, each answering a weakness of the one before. Brightness constancy gives one equation per pixel, which is too few to determine the motion. Lucas–Kanade therefore pools a window and solves a $2 \times 2$ system (Ch 1). That system is only as good as its matrix $H$, so Shi & Tomasi choose the points where $H$ is well-conditioned (Ch 2). One linear solve only gets close, so the solve is iterated (Ch 4), and because the linearisation breaks for large motion, it is run coarse to fine on a pyramid (Ch 3). Because any of these steps can fail silently, every track is checked and lost ones are replaced (Ch 3, 5).

The result is a small set of points, each followed to a fraction of a pixel at almost no cost. These measurements are used in downstream tasks by a robot to estimate its motion, judge how close it is to a surface, and steer itself into place (Ch 6). Newer methods track through occlusions and large motion that would defeat KLT, but where the motion is small and the budget is tight, a forty-year-old idea remains hard to beat.` },
];
