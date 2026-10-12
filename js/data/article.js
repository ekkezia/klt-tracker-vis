// The "Full article" view of the Lab Notebook: the same notebook sections as
// the story, re-ordered as a linear academic write-up (motivation → background
// → algorithm → practice → applications → state of the art). Each entry
// references a notebook section by chapter id + section title, so the text
// lives in one place (chapters.js) only.

export const article = {
  title: 'Kanade–Lucas–Tomasi feature tracking',
  subtitle: 'Optical flow, good features, and the Lucas–Kanade tracker: a tutorial',
  abstract: String.raw`Many robots estimate their own motion by following small image patches from one video frame to the next. This article builds the Kanade–Lucas–Tomasi (KLT) tracker from first principles: the brightness-constancy assumption and the optical flow constraint; why some patches cannot be tracked (the aperture problem) and how the structure tensor identifies those that can; Lucas–Kanade tracking as iterative image alignment; the pyramids and checks that make it robust; the complete detect–track–verify–replenish loop; what tracks are used for; and where KLT stands today.`,
  sections: [
    { heading: 'Motivation', parts: [
      ['boot', 'The tracking problem'],
      ['boot', 'Why not just match descriptors?'],
    ] },
    { heading: 'Background: optical flow', parts: [
      ['boot', 'Notation used throughout'],
      ['lobby', 'Brightness constancy'],
      ['lobby', 'Linearising: the optical flow constraint'],
      ['lobby', 'Worked example: a blob moves one pixel'],
      ['lobby', 'Least squares over a window'],
      ['lobby', 'Computing image gradients'],
      ['lobby', 'The three assumptions'],
    ] },
    { heading: 'Which points can be tracked?', parts: [
      ['wall', 'The aperture problem'],
      ['wall', 'One equation, two unknowns'],
      ['wall', 'The structure tensor'],
      ['wall', 'Flat, edge, corner'],
      ['wall', 'Harris vs. Shi–Tomasi'],
    ] },
    { heading: 'The Lucas–Kanade algorithm', parts: [
      ['corridor', 'Tracking as image alignment'],
      ['corridor', 'The SSD objective'],
      ['corridor', 'Deriving H Δp = b'],
      ['corridor', 'Gauss–Newton iteration'],
      ['corridor', 'General warps: the algorithm step by step'],
      ['corridor', 'Jacobians for common warps'],
      ['corridor', 'Sub-pixel sampling'],
      ['corridor', 'Knowing when to give up'],
    ] },
    { heading: 'Robust tracking in practice', parts: [
      ['sprint', 'Image pyramids: coarse-to-fine tracking'],
      ['sprint', 'Blur, low light and illumination changes'],
      ['sprint', 'The forward–backward test and re-detection'],
      ['sprint', 'IMU prediction and visual–inertial odometry (outline)'],
    ] },
    { heading: 'The KLT pipeline', parts: [
      ['crowd', 'The KLT loop'],
      ['crowd', 'One frame of the loop'],
      ['crowd', 'Parameters that matter'],
      ['crowd', 'Lifetime of a track'],
      ['crowd', 'Evaluating tracking quality'],
    ] },
    { heading: 'Applications', parts: [
      ['docking', 'Visual odometry (outline)'],
      ['docking', 'Expansion and time-to-contact (outline)'],
      ['docking', 'Image-based visual servoing (outline)'],
      ['docking', 'Why KLT suits these jobs'],
    ] },
    { heading: 'Discussion and state of the art', parts: [
      ['debrief', 'Strengths'],
      ['debrief', 'Limits'],
      ['debrief', 'When to use it'],
      ['debrief', 'State of the art'],
    ] },
  ],
};

/** "i.j" numbers of the article's subsections, keyed by `${chapterId}|${sectionTitle}`. */
export const articleNumbers = new Map(article.sections.flatMap((sec, i) =>
  sec.parts.map(([id, t], j) => [`${id}|${t}`, `${i + 1}.${j + 1}`])));
