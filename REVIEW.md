# Review: Full article, dialogue and on-screen visualisation (2026-10-12)

Reviewer stance: a professor in computer vision, reading this as a tutorial on optical flow and the KLT tracker.
Scope:
- the Lab Notebook "Full article" (`js/data/article.js`, which assembles notebook sections from `js/data/chapters.js`)
- the story dialogue
- the on-footage annotations (`js/annotations/annotations.js`)
- orientation cues: headline, flight log, timeline

The review is followed by a **ready-to-use prompt** (section D) for a later Claude session to fix these items.

---

## Verdict

The technical core (sections 2–4: flow constraint, structure tensor, Lucas–Kanade derivation, Gauss–Newton, Baker–Matthews steps) is **correct and well ordered**, at the level of a good lecture handout. The weaknesses fall into four areas:

1. **The article still reads as chapter notes.** It refers to "Chapter n", its depth is uneven (sections 5, 7 and 8 are bullet outlines), and it has no figures.
2. **A few precise statements are imprecise or inconsistent:** the template definition, bilinear smoothness, the ellipse convention, and the "points barely move" claim.
3. **Some concepts are named in the dialogue but never shown on screen:** brightness constancy, I_x/I_y/I_t, the detector response, the pyramid, the steps of the KLT loop, time-to-contact.
4. **Orientation is mostly good** (timeline, topic headline, flight log), but the story and the article are not cross-referenced, and the HUD numbers are never explained.

---

## A. The Full article

### A1. Correctness and precision (fix first)

| # | Where | Issue | Fix |
|---|---|---|---|
| A1.1 | 3.3 vs. the on-screen ellipses | The article describes the iso-error ellipse ΔᵀHΔ = 1, with semi-axes **1/√λ** (long and thin for an edge). The tensor widget and annotations draw the **gradient-spread ellipse**, with semi-axes **∝ √λ** (a thin line across the edge). Same words, opposite pictures. | Pick one convention and state it on screen and in the text. Recommended: keep the gradient-spread ellipse on screen (it reads well over the footage), label it "spread of gradients (√λ)", and add one sentence to 3.3 relating it to the iso-error ellipse. |
| A1.2 | 4.1 vs. 6.2 | 4.1: the template is cut "from the frame where it was found". 6.2 tracks frame-to-frame (template = previous frame). | State both options and their trade-off in 4.1. Previous-frame templates adapt to appearance change but drift; first-frame templates do not drift but fail as appearance changes. Shi & Tomasi track frame-to-frame (translation) and monitor dissimilarity against the first frame (affine). |
| A1.3 | 4.7 | "E and its gradient are continuous in p" is false for bilinear interpolation of the image (piecewise linear, so its derivative is discontinuous at pixel boundaries). | Say implementations interpolate **precomputed, smoothed derivative images** (e.g. Scharr/Sobel of a Gaussian-blurred image), which makes the gradient used by Gauss–Newton continuous. |
| A1.4 | 4.3 / 2.5 / dialogue ch2 | "H is exactly the matrix the tracker inverts" and "H is the structure tensor". In forward-additive LK, H uses gradients of the *warped new image*; detection uses gradients of the *template frame*. They agree only near convergence. | Add the nuance. Inverse-compositional LK makes H exactly the template's structure tensor (and constant), which is a nice bridge to 4.5's callout. |
| A1.5 | 1.2, ch0 dialogue | "Between two frames at 24–200 fps, points barely move." This depends on speed, depth and focal length. The sprint shows it failing. | Give the formula: image displacement ≈ f·v_⊥ / (Z·fps). Example with this robot: f ≈ 579 px (960 px wide, 79.5° horizontal FOV), 1.3 m/s, Z = 3 m, 24 fps gives ≈ 10 px for purely lateral motion. Then explain why near and lateral points are hardest. |
| A1.6 | 4.4 | "basin of attraction, about the window's dominant spatial frequency" is vague and dimensionally odd. | "Converges when the initial error is smaller than roughly half the dominant spatial wavelength in the window (the extent over which the linearisation holds); pyramids enlarge this basin." |
| A1.7 | 1.1 | Optical flow is attributed to Lucas & Kanade (1981) alone. | Name Horn & Schunck (1981) as the global/dense counterpart of the local LK method (one paragraph in 2.x), and add it to the references. |
| A1.8 | 7.1 | "TODO(verify): sign conventions" | The flow equation as written matches the IBVS interaction matrix in 7.3 (camera velocity, normalised coordinates: Longuet-Higgins & Prazdny form). Remove the TODO and state the convention once. |
| A1.9 | 6.3 | The parameters list omits the absolute λ_min floor used for the footage (`--min-eig 1e-3`), which was essential (without it, compression noise was tracked). | Add it, with the one-line reason. |

### A2. Structure and form

- **Cross-references say "Chapter n"** (e.g. 1.2 "Chapter 4", 2.3 "Chapter 2 explains", 3.2 "(Chapter 1)", 4.8 "(Chapter 4)"). Inside the article these must be **section numbers** (story Ch k ≈ article §k+1). Render chapter mentions as links with section numbers in article view, or rewrite the notebook text to say "Section x".
- **Uneven depth.** §5 (Robust tracking), §7 (Applications) and §8 (Discussion) are bullet outlines next to full derivations in §2–4. At minimum: §5.1 pyramids and §5.3 forward–backward need prose plus equations at the level of §4; §7 can stay compact.
- **§8.4 State of the art is a placeholder.** Suggested content (verify each citation before publishing):
  - dense learned flow: FlowNet (2015), PWC-Net (2018), RAFT (2020)
  - long-range point tracking: Particle Video Revisited / PIPs (2022), TAP-Vid benchmark (2022), TAPIR (2023), CoTracker (2023)
  - learned features and matching: SuperPoint (2018), SuperGlue (2020), LightGlue (2023)
  - KLT in modern VIO: VINS-Mono (2018), MSCKF; descriptor-based SLAM for contrast: ORB-SLAM (2015)
  - event-based tracking: e.g. EKLT (Gehrig et al.)
  - Frame the comparison as accuracy vs. compute vs. robustness to the §5 failure modes.
- **No figures.** A tutorial needs at least five: (1) the flow field over a frame; (2) the aperture problem; (3) flat/edge/corner patches with their gradient scatter and ellipses; (4) pyramid levels with one feature; (5) the KLT loop diagram. Most can be frames grabbed from the recorded footage.
- **Missing background a reader expects:** how gradients are computed (pre-smoothing, Sobel/Scharr, why central differences on raw pixels are noisy); illumination robustness (gain/bias, zero-mean NCC), currently one bullet in 5.2; how tracking quality is evaluated (ground truth, forward–backward error, track length).
- **Notation drift:** d, (u, v) and p are used for the same displacement, and H means two things (A1.4). Add a sentence in 2.1: "We write d = (u, v) for flow; when we pose tracking as alignment we call the same displacement p."
- **Citations:** inline author-year citations are not linked to the reference list; Horn–Schunck is missing; the two cv-learn.com URLs are still site roots.

---

## B. Dialogue and on-screen visualisation, chapter by chapter

The dialogue is now explicit and accurate. The gap is that **several lines name a concept that the footage never shows**. That forces the viewer to trust the words instead of seeing the idea.

| Ch | Line / topic | Shown today | Problem | Recommended visual |
|---|---|---|---|---|
| 0 | Displacement between frames | "The math" card + generic trails | The displacement d_i of a single point is not isolated. | Pick one track; show its position at t (hollow) and t+1 (filled), the vector between them magnified ×10, and the value in px. |
| 1 | Brightness constancy | Nothing specific | The assumption is never seen. | Zoom insets of the *same patch* in frame t and t+1 (real pixels, side by side) with a few intensity values, showing the same numbers at shifted positions. |
| 1 | Flow constraint I_x u + I_y v + I_t = 0 | A flow arrow | The three quantities are never visualised. | A toggle overlay of I_x, I_y and I_t heat maps on the frozen frame (the stage already grabs pixels; imageOps has gradients). |
| 1 | 1D example | A table card | Abstract and unrelated to the footage. | Keep the table, and add a 1D intensity profile along one scanline of the footage across a moving edge in two consecutive frames, with I_x and I_t, solved with the same least-squares formula. |
| 1 | Last line ("when I turned in place…") | Forward-motion trails | It describes a turn that happened earlier, off-screen. | Say it while the turn plays (first steps of ch1), or replay the turn segment for this line. |
| 2 | Flat / edge / corner | Three live tensor cards (good) | The "flat" anchor is searched over the whole frame, so it can land on sky or paving while the text says "the plain panel"; the ellipses are tiny; their convention conflicts with the article (A1.1). | Allow `at: { auto: 'flat', region: [...] }` (or a `near` bias) to constrain examples to the truck; enlarge the ellipse; label it √λ. |
| 2 | Harris vs. Shi–Tomasi | Formula card | No comparison is shown. | Show R and λ_min side by side in the tensor cards, and add a **detector-response heat map** (λ_min over the frame, thresholded): the single most informative picture for this chapter. |
| 3 | Real LK iterations | Template box, iterate dots, table (good, and real) | The iterate path is 1–4 px long, invisible at screen scale. | Magnified inset: template, current warped patch, error image per iteration, and the iterate path drawn ×20. |
| 3 | Bilinear interpolation | A 5×5 window | Too small to read. | Zoom inset with the 4 neighbours, the sub-pixel point and the 4 weights. |
| 4 | Image pyramid | Nothing (widget is a stub) | The chapter's key idea is never shown. | Thumbnails of 3–4 pyramid levels of the current frame with one feature, showing the displacement shrinking per level. |
| 4 | Forward–backward test | Red × only | The test itself is not visible. | For a few tracks draw forward (t→t+1) and backward (t+1→t) arrows and the gap e_FB in px; colour by pass/fail. |
| 5 | Detect / Track / Verify / Replenish | `tracks` rings for 3 of the 4 steps | The four steps look identical on screen. | One distinct overlay per step: detection response + min-distance circles; flow arrows; forward–backward pairs + rejections; empty-region mask + new green points. |
| 6 | Time-to-contact | Text only | The line says "you used this to keep clear of the walker in the park", but τ was never shown. **This claim is not demonstrated.** | Add a τ overlay on the approaching walker in ch5 (box + live τ estimate from the spread of tracks inside it), or change the line. |
| 6 | Visual odometry | Flow arrows | No estimated motion is shown. | A small top-down mini-map with the robot's estimated path vs. the true route (the simulator knows the true pose). |

---

## C. Orientation: "where are we?"

**What works:**
- the timeline, with chapter checkpoints and progress
- the topic headline (concept) over the location kicker
- the flight log collapsing when someone talks
- annotations anchored to real features with leader lines
- the footage only moving when the reader advances

**What confuses:**
1. **Three naming layers don't line up:** the chapter title ("The aperture problem and good features"), the timeline label ("Aperture & corners") and the headline topic ("Pooling a window"). Number the topics to match the article: e.g. headline "3.2 One equation, two unknowns" in story Ch 2. This also links the story and the Full article.
2. **The HUD numbers are never explained.** "Mean err" is the forward–backward error from the tracker (now in its tooltip). ~~"Confidence" is a **made-up heuristic**~~ (removed 2026-10-12) (`js/ui/hud.js`: tracked/total × (1 − err/1 px)). Either define both on first appearance (and in the article §6) or drop "confidence".
3. **Visual clutter during explanations.** About 100 dots with trails compete with the one point a line is about. Add a focus mode that dims the tracks not referenced by the current annotation.
4. **The dot-colour legend appears once (ch0)**, but red and green matter most in ch4–5. Add a small permanent legend to the HUD panel.
5. **No physical sense of place.** A tiny route mini-map (from `sim/scene-data.json`) with the robot's position would ground "Straus Square", "Canal Street" and so on.
6. **Topic changes are frequent** (8–11 per chapter). Fine with numbering (C1); without it the headline feels like it jumps.

---

## D. Prompt for a later Claude session

> Copy everything in the block below into a new Claude Code session opened in `klt-tracker/`.

```text
You are working on klt-tracker/ (an interactive KLT tracker explainer: story chapters in
js/data/chapters.js, a "Full article" assembled by js/data/article.js, on-footage annotations in
js/annotations/annotations.js, HUD in js/ui/hud.js, widgets in js/widgets/, simulator in sim/).
Read HANDOFF.md and REVIEW.md first. Fix the items below in priority order. Keep every data
contract in HANDOFF.md, keep the explicit (non-punny) dialogue style, run `node tools/check_math.mjs`
and the KaTeX parse check after content edits, and verify in a browser (tools/serve.py) before
finishing. Do not regenerate ElevenLabs audio; list changed lines instead.

P0: correctness (REVIEW.md §A1)
1. Ellipse convention (A1.1): label the on-screen ellipses "gradient spread (∝√λ)" and add a
   sentence to notebook section "The structure tensor" relating it to the iso-error ellipse (1/√λ).
2. Template definition (A1.2): rewrite "Tracking as image alignment" to cover previous-frame vs.
   first-frame templates and Shi–Tomasi's affine dissimilarity check.
3. Bilinear smoothness (A1.3) in "Sub-pixel sampling".
4. H in forward-additive vs. inverse-compositional LK (A1.4): add the nuance to "Deriving H Δp = b"
   and soften the matching dialogue in ch2 and ch3.
5. Displacement formula (A1.5): add d ≈ f·v⊥/(Z·fps) with this robot's numbers to "Why not just
   match descriptors?" and keep the ch0/ch1 dialogue consistent with it.
6. A1.6–A1.9: basin-of-attraction wording, Horn–Schunck (text + reference), remove the 7.1 TODO,
   add the λ_min floor to "Parameters that matter".

P1: article structure (REVIEW.md §A2)
7. Article cross-references: show "Section x" instead of "Chapter n" in article view (map story
   chapter k to article section k+1, or rewrite the text).
8. Bring §5.1 (pyramids) and §5.3 (forward–backward) to full prose + equations.
9. Write §8.4 State of the art from the suggested list; verify every citation (authors, venue,
   year) with web search before including it; mark anything unverified.
10. Add figures (frames from assets/clips/chinatown.mp4 or rendered canvases): flow field,
    aperture, flat/edge/corner, pyramid levels, KLT loop diagram.
11. Add short sections: gradient computation, illumination robustness, evaluating tracking quality.

P1: demonstration gaps (REVIEW.md §B), as new annotation kinds where needed
12. ch6 time-to-contact claim: add a τ overlay on the approaching walker in ch5 (or change the line).
13. Distinct overlays for the four KLT loop steps in ch5.
14. Detector-response heat map (λ_min) for ch2, and R + λ_min in the tensor cards.
15. Constrain ch2 auto anchors to the truck (region/near bias for { auto: ... }).
16. Magnified inset for the ch3 LK iterations (template, warped patch, error image, path ×20).
17. ch4: pyramid thumbnails and forward–backward arrows with e_FB values.
18. ch0/ch1: single-point displacement vector; patch-pair inset for brightness constancy;
    I_x / I_y / I_t heat-map overlay; move the "when I turned in place" line to when the turn plays.

P2: orientation (REVIEW.md §C)
19. Number headline topics to match article subsections and link them both ways.
20. Explain "Mean err" (forward–backward error) in the story and article. ("Confidence" was removed.)
21. Focus mode: dim tracks not referenced by the current annotation.
22. Permanent dot-colour legend in the HUD panel; optional route mini-map.

When done, update HANDOFF.md (content status, new annotation kinds) and tick items in REVIEW.md.
```

## E. Status (2026-10-12)

All items in D were worked through. Verified with `node tools/check_math.mjs`, a KaTeX parse of every notebook body, dialogue line and card (0 errors), and a browser run through all 61 steps (0 runtime errors).

- [x] 1–6 P0 correctness: ellipse labels + "Two ellipses, one matrix"; template choice; bilinear; forward-additive vs. inverse-compositional H; ‖d‖ ≈ f·v⊥/(Z·fps); basin wording, Horn–Schunck, λ_min floor.
- [x] 7 "Chapter n" → "Section n+1" in the article view (`chaptersToSections`).
- [x] 8 §5.1 pyramids and §5.3 forward–backward in full prose + equations.
- [x] 9 §8.4 State of the art, every citation web-verified. (cv-learn.com URLs still TODO.)
- [x] 10 Figures 1–5 (`tools/make_figures.py` → `assets/figures/`), via new `![caption](src)` markup.
- [x] 11 Sections: computing image gradients, blur / illumination, evaluating tracking quality.
- [x] 12 ch6 time-to-contact line no longer claims Wren used τ; it describes the walker as an example. (No τ overlay.)
- [x] 13 ch5 steps: `heatmap` + spacing (detect), `flowfield` (track), `fb` (verify, held on a frame with 6 drops), `replenish` (lost × vs. detected rings, held on a frame with 31 / 31).
- [x] 14 λ_min heat map in ch2 "Detecting good features"; R and λ_min rows in tensor cards (Harris "≈ 0: flat" case added).
- [x] 15 ch2 auto anchors restricted to the truck (`at.region`).
- [x] 16 `lk` inset: T, I(x+p), error at p0 / final, iterate path; started from a stated wrong guess (2, −1.5) so convergence is visible (the true motion is ~0.3 px).
- [x] 17 ch4 `pyramid` inset on the fastest track (12.7 → 1.6 px over levels 0–3, held at frame 1477); `fb` rings with e_FB labels.
- [x] 18 ch0 single-point displacement arrow; ch1 `patches` (prev/next with mean |diff|; I_x, I_y, I_t with corr(I_t, −(I_x u + I_y v)) ≈ 0.78); the turn-in-place remark moved to ch0's last line, held mid-turn (the turn is frames 442–458, end of ch0, not ch1); ch1's last line keeps the forward-motion part with a `flowfield`.
- [x] 19 Headline shows §i.j (line `ref`) and opens the Full article there; article "See it in Chapter k" jumps to the first line with that ref.
- [x] 20 Mean err: explained by Dr. Tomasi in ch4 ("the error number at the top of your screen…") and in §6.5.
- [x] 21 Focus mode: anchored annotations dim all other tracks.
- [x] 22 Permanent dot legend in the HUD panel. Mini-map **not done** (needs per-frame poses from `sim/`).
