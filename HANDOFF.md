# HANDOFF: architecture, contracts, open items

This is the foundation pass: correct structure and content, plain visuals. The next pass adds creative polish. Everything below marked **contract** must keep its shape, because other modules or content files depend on it.

## 1. Architecture

```
chapters.js ─► buildSteps() ─► steps[]  (intro = chapter brief · one per dialogue line · end)
                                  │
 Space / click / keys / timeline ─► player.goTo(i)
                                  ├─► stage.setClip · setScene · playRange(chapter range) | hold(line.hold)
                                  ├─► dialogue.show(step)       bottom speech bubble / references; flight log shows the brief
                                  ├─► voice.play(step)          assets/voice/manifest.json
                                  └─► annotations.show(line.focus)   (after the held frame is on screen)
 stage (per presented frame) ─► overlay: trails · dots · renderScene · annotation markers + leader lines
                             ─► state.set({frame, trackFrame}) ─► hud · widgets (onFrame)
```

- **One store** (`engine/state.js`). Modules subscribe; nothing reaches into another module's DOM.
- **Step player, not scroll.** One line at a time, like a visual novel. The first Space/click finishes the word reveal; the next one advances.
- **Footage = a journey.** The footage only moves when the reader advances. `buildSteps` gives every step a consecutive stretch `[from, to]` of its chapter's frames. A line's `hold` frame is where the journey stops for that line, and other steps are spread evenly between stops. **Next** plays the stretch once at native speed and pauses on `to` (`stage.playSegment`). Back, timeline and chapter jumps show `to` directly. Annotations appear once the footage has stopped. Nothing loops except the backdrop behind the start screen.
- **Stand-ins** (`standIns` in `chapters.js`): `{ lucas: 'kanade' }` makes Dr. Kanade speak Dr. Lucas's lines (portrait, call card, voice). Delete the entry to restore Lucas, and revert the five lines of Wren's text that now say "Dr. Kanade".
- **Concept-first structure.** Ch 0 is three short lines and one question ("how did each point move since the last frame?"). Each later chapter brings in one problem just in time for its concept. The second half is about the tracker itself: Ch 5 is the full KLT loop (detect → track → verify → replenish). Applications are one short tour in Ch 6; limits and what came next are in Ch 7.
- **Lab Notebook** (`js/ui/notebook.js`): one scroll with every chapter, each under a sticky chapter header (plus a chapter strip to jump around). Opening it scrolls to the chapter the story is at, or to the section a line's `ref` names; sections are numbered `chapter.section` (the §i.j shown in the headline and the "Lab notes" button) and link back to the story ("See this in the story"). Playgrounds mount lazily as a chapter scrolls in. The old Full-article tab and `js/data/article.js` are gone.
- **"Try it" cards** (`pyramidlab`, `tensorlab` in `js/annotations/annotations.js`): interactive on-footage playgrounds; a focus spec's `widget` adds a maximise button that opens the chapter's full playground over the footage.
- **Phone calls** (`js/ui/sfx.js`, Web Audio, no files): on a line with `event.call` the call card slides in reading "Calling…", and a ring loops (after the line is spoken) until the reader presses Next; then a pickup chirp plays and the card reads "On call". The speaker icon (V) controls voice and effects.
- **HUD panel + flight log** (`js/ui/flightLog.js`): the panel header shows chapter, location, current topic, and icon readouts (frame, tracks, mean forward–backward error). The flight log shows only the **current** chapter's **brief** (no history of earlier ones) (`chapter.failure`: the problem as a question plus one sentence on what the chapter establishes). It expands on a chapter's opening step and collapses (animated) when a character speaks; L or the toggle reopens it. There is no title card and no separate system/log dialogue line.
- **Script rule (2026-10-13):** the doctors explain *ideas* in plain words, one idea per line, mostly one doctor per chapter, and **no equations in speech**. Each line's equation goes in `line.math` (shown on the footage as a "The math" card) or in its `focus` overlay; the derivation lives in the Lab Notebook section named by `line.ref`, which the dialogue box links to ("Lab notes §i.j", also the N key). 34 lines / ~840 words in total.
- **Density rule (2026-10-12):** no element may repeat what another already shows. Removed for that reason: the chapter title card and its hook quote, the separate flight-log dialogue lines, recap lines that restate a doctor, the per-chapter "open the notebook" step, the notebook roadmap (the timeline shows it), and the invented "confidence" meter.
- **No Story/Full-math switch any more:** all notebook sections are always shown, and a line's `math` note appears as a "The math" card on the footage.
- **Portraits** (`js/data/expressions.js`): Wren and Dr. Kanade use 12-frame expression sets cut by `tools/split_sprites.py`. While a line is spoken, the portrait swaps between `talk.closed` / `talk.open` (occasionally `talk.wide`) frames every ~100–165 ms, for as long as the voice clip plays (or an estimate from the word count), then rests. A line may set `expression: '<frame id>'` as its rest frame. Characters without art fall back to a monogram.
- **Stage** (`stage/stage.js`): `<video>` uses `object-fit: cover` to fill the screen. The overlay canvas applies the *same* cover transform, so everything is drawn in the footage's native pixel grid and lands on the right pixels at any window size. `toScreen` / `toNative` convert between the two.
- **Headline + timeline.** Each step carries a `topic`: the chapter `title` until a line sets `topic`. The headline shows `Chapter n · place` above the topic. `ui/timeline.js` maps step *i* to *i/(N−1)* along the rail, puts a checkpoint (symbol, label, dot, number) at each chapter's first step, and calls `player.goTo` on drag-release, wheel, checkpoint click or keys.
- **Annotations** (`annotations/annotations.js`): canvas markers + HTML cards (for KaTeX) with leader lines. Cards avoid each other and any element marked `data-annot-avoid`, and stay inside the visible area between the top bar and the dialogue box (`getSafeRect()` in `main.js`).
- **Pixels:** widgets and annotations read real frame pixels via `stage.grabFrame()` / `grabFramesAt([...])`.

## 2. Data contracts

### 2.1 Chapters (`js/data/chapters.js`) — contract

```js
characters: { [speakerId]: { name, role, initials, accent /* CSS colour or var() */,
                voice: { id, brief, stability, similarity, style } | null } }   // ElevenLabs
clips:      { [clipId]: { src, tracks, fps? } }          // fps falls back to the track file
chapters: [{
  id: string,                  // stable slug, used in DOM ids
  index: number,               // 0..7, keyboard shortcut
  title: string,               // what the chapter EXPLAINS ("Optical flow"); headline on the opening step
  short: string,               // timeline checkpoint label (one line)
  icon: iconId,                // timeline symbol, key in js/ui/icons.js
  place: string,               // scene location, shown as the headline kicker
  scene: string,               // key in stage/scenes.js
  sceneAlt: string,            // text alternative for the stage (screen readers)
  status: 'written' | 'outline',
  clip: { id: clipId, start: frame, end: frame },   // inclusive
  failure: { title, text },   // the brief in the flight log: problem as a question + one sentence of goal
  dialogue: [{
    speaker: speakerId,
    text: markup,              // inline markup: $tex$, **b**, *i*, `code`
    math?: markup,             // short math note, shown as a floating card on the footage
    event?: { call: speakerId | speakerId[] } | { hangup: true },
    hold?: frame,              // freeze footage on this frame for this line
    focus?: Annotation | Annotation[],   // drawn on the footage, see 2.7
    say?: string,              // plain-English text for TTS (required when text has math)
    topic?: string,            // headline from this line on (carries forward; plain text, no TeX)
    expression?: frameId,      // rest frame for the speaker's portrait on this line (e.g. '04')
  }],
  notebook: [{ title, level: 'story' | 'math', body: markup }],
  widget: widgetId,
}]
references: [{ label, source, url?, note? }]
disclaimer: string
```

Block markup in `body`: blank line = new block; `$$…$$` display math; `- ` bullets; `1. ` numbered; `> ` callout; `|`-rows = table (first row is the header). Write TeX inside `String.raw` template literals (`R\`…\``). In plain `'…'` strings, backslashes must be doubled.

The call state is derived: a `{call}` event starts a call on that line, and it lasts until a `{hangup}` line (inclusive) or the end of the chapter.

### 2.2 Track files (`assets/tracks/*.json`) — contract

```json
{
  "schema": "klt-tracks/v1",
  "clip": "placeholder",
  "fps": 24, "width": 640, "height": 480, "frameCount": 960,
  "frames": [ [ { "id": 17, "x": 312.4, "y": 88.0, "status": "tracked", "err": 0.12 } ] ]
}
```

- `frames[i]` is every point reported in frame `i` (0-based, same indexing as the video).
- `status`: `new` (first frame of a track), `tracked`, `lost` (last report; drawn as ×, not counted as active).
- `err` is optional, in px. The HUD averages it over non-lost points; if absent, it shows "—".
- Coordinates use the track file's own `width × height` grid; the stage rescales to `STAGE`.
- A lost feature that is re-detected gets a **new id** (KLT has no re-identification).
- Optional extra fields are ignored (the placeholder has `"synthetic": true`).

### 2.3 Widgets — contract

```js
mount(container: HTMLElement, api) => (() => void) | void
api = {
  state,                      // store; read s.frame, s.trackFrame, …
  stage: {
    grabFrame(): ImageData | null,   // current frame, STAGE.width × STAGE.height RGBA
    onFrame(fn): unsubscribe,        // fires for every presented frame (playing or after a seek)
    frame: number, tracks: trackFile | null,
  },
  chapter,                    // the owning chapter object
}
```

**Chapter order (2026-10-13):** pyramids (Ch 3) come before Lucas–Kanade (Ch 4), at the user's request. To keep the footage running forward, `chapters.js` re-splits the recording (`SPRINT`, `ALONG_FENCE`, `LK_FRAME` = 1725) instead of using route chapters 3–4; the Straus Square walk (≈1050–1379) is skipped. `lkTranslation` now stops when λmin per pixel < 1e-4 (OpenCV's minEigThreshold), so flat or noise-only windows fail instead of jumping.

Register in `js/widgets/registry.js`. Every chapter except 7 has at least one **playground** at the top of its Lab Notebook tab (shared helpers in `js/widgets/pg.js`: `shell`, `slider`, `check`, `controls`, `crisp`, `drawGray`):

| id | file | Ch | what the reader does |
|---|---|---|---|
| `displacement` | displacement.js | 0 | speed / distance / fps → px per frame vs. the LK and pyramid ranges |
| `flow-1d` | flow1d.js | 1 | shift a 1-D bump; per-pixel vs. window least squares vs. iterated |
| `aperture` | aperturePlayground.js | 1 | bar behind a circular window; drag the true motion in velocity space; constraint line, normal flow |
| `structure-tensor` | structureTensor.js | 2 | click a window on the frame; H, λ₁, λ₂, Harris, Shi–Tomasi |
| `pyramid-synth` | pyramidSynth.js | 3 | test scene with exact motion: presets, levels, iterations, noise; per-level table; one-shot vs. KLT |
| `pyramid` | pyramidPlayground.js | 3 | real footage: frame gap × pyramid levels, single-level vs. pyramidal LK, error vs. gap chart |
| `lk-iterations` | lkPlayground.js | 4 | pick a corner, click a start on the E(p) surface, step Gauss–Newton (real frames) |
| `pipeline-inspector` | pipelinePlayground.js | 5 | re-run detect → track → FB verify → replenish on 16 frames with your parameters |
| `servo` | servoPlayground.js | 6 | IBVS docking on 4 corners: start pose, gain, known vs. assumed depth |

Real-frame playgrounds use the chapter's key frame (its first held line) via `grabFramesAt`, so results don't depend on where the story is. `lkPyramid` / `buildPyramid` (imageOps.js) are a plain re-implementation (2×2-average pyramid, no pre-smoothing), so their errors run higher than OpenCV's.

Stage API available to widgets and annotations, in addition to the above: `grabFramesAt(frames[]) → Promise<ImageData[]>` (seeks to each frame, grabs it, then restores playback), `toScreen(x, y)`, `toNative(sx, sy)`, `transform`, `onDraw(fn(ctx, info))`, `onUnderlay(fn(ctx, info))` (beneath the dots), `setFocusProvider(() => Set<id> | null)` (dim other tracks), `redraw()`, `playRange(a, b)`, `hold(f) → Promise`.

### 2.4 Scenes — contract

`renderScene(sceneId, t, ctx, info)`. `ctx` is already scaled to the track file's pixel grid. `t` ∈ [0,1] is progress through the chapter's frames. `info = { frame, points, tracks, width, height, colors, px }`, where `px` is one screen pixel in track units: multiply line widths and font sizes by it. Keep it synchronous and cheap, because it runs on every presented frame.

### 2.5 State keys

`stepIndex`, `chapter`, `step`, `frame`, `trackFrame`, `call`, `callState` ('ringing' | 'connected'), `notebookOpen`. Add keys freely; don't change the meaning of these.

### 2.6 CSS hooks

The overlay reads its colours from CSS: `--overlay-accent`, `--overlay-new`, `--overlay-lost`, `--overlay-hairline`, `--overlay-label`, `--overlay-halo`, `--overlay-focus` (annotation leader lines). The dialogue bubble uses `--bubble-*` and `--frame-gold`; glass panels use `--glass*`. Characters use `--c-wren|system|lucas|kanade|tomasi`. The HUD panel uses `--cp-cyan`, `--cp-red`, `--cp-bg`, `--cp-line`. Restyle freely, but keep these names and the `hidden` attribute usage.

### 2.7 Annotations (`line.focus`) — contract

```js
{ kind, at?, title?, body?, win?, lag?, scale?, ...kind options }
kind: 'tracks'    ring every active track
      'window'    dashed window (half-size `win`, default 7) at the anchor
      'tensor'    live structure tensor at the anchor: window + gradient-spread ellipse (∝√λ),
                  λ1, λ2, Shi–Tomasi λmin vs τ, Harris R. `compact: true` → class + λ1, λ2 only
      'aperture'  on an edge: ✓ gradient direction (observable) vs ? along-edge (not)
      'flow'      arrow of the anchored track's motion over `lag` frames, magnified ×`scale`
      'flowfield' the same arrow for every active track (no anchor)
      'lk'        REAL Lucas–Kanade between frames F−lag and F on the anchored track: template,
                  every Gauss–Newton iterate, result, table of p_k and E. `start: [dx, dy]` = initial
                  guess; `inset: true` adds T, I(x+p), error at p0 / final, and the iterate path magnified
      'heatmap'   Shi–Tomasi λmin of every pixel (7×7 window) under the dots; `spacing: true` adds
                  the detector's minimum-distance circles (tracks.tracker.minDist, default 12 px)
      'fb'        ring per track with radius scale × e_FB (the track file's `err`), labels on the
                  largest; card: median / max kept / dropped this frame
      'replenish' tracks lost (×) and corners detected (rings) over the last `lag` frames, with counts
      'pyramid'   inset: crops of levels 0..3 around the anchored track with its displacement per level
      'patches'   inset: patches around the anchored track, `maps` from 'prev' | 'next' | 'Ix' | 'Iy' | 'It'
                  ('next' adds mean |difference|; 'It' adds corr(I_t, −(I_x u + I_y v)))
      'card'      marker + card only
at:   { point: [x, y] } | { trackId } | { track: 'auto', near?: [x, y] } | { track: 'fastest' }
      | { auto: 'corner'|'edge'|'flat', region?: [x0, y0, x1, y1] }
      omitted → card floats at the top-left (or top-right) of the visible area
```

**Colour keys.** In card `title`/`body` (and generated readouts), write `{{key|words}}`, e.g. `{{lost|red ×}}`. The words take the key's colour (CSS `.key[data-key=…]`), every mark the kind registered under that key gets a halo in the same colour, and a connector runs from the card to the nearest one; hovering or focusing the words pulses all of them and fades the card's other keys. Keys: `tracked`, `fresh`, `lost`, `tail` (tracks); `focus` (arrows, anchored dot, LK iterates, windows); `good` / `warn` / `bad` (✓ / amber / ?); `muted` (dashed template, spacing circles); `flat` / `edge` / `corner` (tensor windows); `heat` (colour only). A kind registers marks with `mark(it, key, x, y, r)` in `draw` or `under`; crowds (> 40 marks) only get halos on hover. Any phrase that names a colour or symbol on screen should be keyed.

Anchored kinds (`flow`, `lk`, `pyramid`, `patches`, `window`) dim every other track while shown (focus mode, `OVERLAY.dimAlpha`). Kinds that need a second frame use a shared grey-frame cache and `grabFramesAt`; that is safe because annotations are only shown once the footage is at rest.

Prefer `{ track: 'auto' }` and `{ auto: … }` anchors: they keep working when footage changes. `{ point }` anchors and `hold` frames are footage-specific. Add a kind by adding an entry to `KINDS` with any of `init(it, stage, getSafeRect)`, `onFrame(it, stage)`, `draw(ctx, it, anchor, info)`, `under(ctx, it, info)` (drawn beneath the track dots, no anchor needed), `reach(it)` (native px the drawing extends from the anchor; keeps the card clear of it).

## 3. TODO hooks

**TODO(creative)**
- `css/style.css`: whole theme is a clean base (type, colour, motion).
- Art for Dr. Tomasi and Dr. Lucas (4×3 sheet → `tools/split_sprites.py` → add to `expressions.js`). Pick per-line `expression`s for emphasis (surprise, laughter).
- **Voice-over needs regenerating**: the script was rewritten on 2026-10-13 and all old clips were pruned (`--prune-stale`, which now also removes clips for lines that no longer exist), so the site is silent. New script: 34 lines, ~4,600 characters. Voices: "Wren - Robot", "Kanade" (own Voice Design voice, light Japanese accent), "Tomasi" — all account-owned, so they work on the free API tier. Run `node tools/make_voices.mjs --dry-run`, then `node tools/make_voices.mjs` once the user approves.
- `js/ui/dialogue.js`: text-blip sound / per-character reveal; optional auto-advance when the voice line ends (`voice.onEnded`).
- `js/ui/icons.js`: checkpoint symbols are simple line art; replace with hand-drawn ones (same 40×40 box, `currentColor`).
- `js/annotations/annotations.js`: entrance/exit motion.
- Route mini-map in the HUD panel (REVIEW item 22, optional): needs per-frame robot poses exported from `sim/` alongside `route.json`.
- `js/ui/phoneCall.js`: ring-in / hang-up animation, waveform.
- `js/stage/scenes.js`: every scene is a placeholder annotation; `crowd` needs footage with forward motion (FOE/expansion); `docking` takes the centroid of *all* points, not just the target's.
- Playground ideas not built: time-to-contact fitting on an approaching object (Ch 6), gyro de-rotation (Ch 4).
- `js/data/chapters.js` (Ch 7): the pipeline-inspector section.

**TODO(content)** (all in `js/data/chapters.js`)
- Ch 4: gyro-prediction widget idea. Ch 6: τ-fitting widget idea (no on-footage τ demo yet; the dialogue only describes it).
- Figures are rendered by `tools/make_figures.py` from the footage and tracks (`assets/figures/`); re-run it after re-recording. Captions quote numbers from the current recording (λ values, 8.3 px, frame 1511): update them if they change.
- References: exact cv-learn.com article URLs for "KLT tracker" and "Optical flow" (currently the site root, marked TODO).

## 4. Content status

| Ch | id | Place | `status` | Dialogue | Notebook | Widget |
|---|---|---|---|---|---|---|
| 0 | boot | Happy Star Bakery, Canal St | written | 3 lines | 3 sections, Fig. 1 | `displacement` |
| 1 | lobby | East Broadway sidewalk | written | 5 lines | 6 sections | `flow-1d` |
| 2 | wall | Straus Square, by a box truck | written | 5 lines | 6 sections, Figs. 2–3 | `structure-tensor` |
| 3 | sprint | Crossing Canal Street (frames 1380–1640) | outline | 4 lines | 4 sections (4.1, 4.3 full; 4.4 outline), Fig. 4 | `pyramid-synth` + `pyramid` |
| 4 | corridor | Canal Street, by the park fence (1641–2102) | written | 5 lines | 8 sections | `lk-iterations` |
| 5 | crowd | Seward Park | written | 5 lines | 5 sections, Fig. 5 | `pipeline-inspector` |
| 6 | docking | The Seward Park dock | outline | 5 lines | 4 sections (outlines) | `servo` |
| 7 | debrief | Docked in Seward Park | outline | 2 lines | 4 sections incl. State of the art | none |

Outline chapters get a "draft" tag in the flight log; 

## 5. Math: verified vs. to verify

**Machine-checked** (`node tools/check_math.mjs`):
- Eigenvalues of symmetric 2×2; Harris value on a known matrix.
- Flat / edge / corner classification and Harris sign (R>0 corner, R<0 edge) on synthetic images.
- Ch 1 worked example: pointwise estimates `0, undefined, 2`; window least squares `u = −ΣIxIt/ΣIx² = +1` exactly.
- Ch 3: Gauss–Newton iteration `p ← p + H⁻¹b` with `b = Σ∇I(T − I)` converges to the true shift.
- All TeX in `chapters.js` and the widget parses in KaTeX 0.16.9.

**Derived by hand and believed correct. A reviewer should still re-check:**
- SSD objective, the first-order expansion, and `H Δp = b` with `H = Σ∇I∇Iᵀ`, `b = Σ∇I[T − I(x+p)]`. These are consistent with Ch 1's `b = −Σ∇I·I_t` when `I_t := I(x+p) − T`.
- Gauss–Newton as `J^T J` approximation of the Hessian of E (dropping the residual-curvature term).
- Normal-flow formula; `E(Δ) ≈ ΔᵀHΔ`; ellipse semi-axes `1/√λ`.
- Pyramid propagation `g^{ℓ−1} = 2(g^ℓ + d^ℓ)`, `d = g⁰ + d⁰` (Bouguet 2000).
- Time-to-contact `τ = r/ṙ` and `τ ≈ 2/div(u)` for a fronto-parallel surface.
- IBVS interaction matrix and `v = −λ L⁺ e` (Chaumette & Hutchinson 2006).

**Flagged: decisions a reviewer should know about**
1. **"Gradient of T" in the step list.** The brief listed "gradient of T" as a step. In the *forward-additive* algorithm (Baker & Matthews; also the CMU 16-385 slides), step 3 warps the gradient of the **image I**, not T. Using ∇T is the *inverse-compositional* variant. The notebook uses ∇I and adds a callout explaining ∇T / inverse compositional. Confirm this matches the course's framing.
2. **"The 7 steps."** Baker & Matthews number 9 steps (separating "compute Σ SDᵀ·error" and "compute Δp"). The notebook lists 8, matching the brief's item list. Renumber if the course slides use a different count.
3. **Ego-motion flow sign convention** (Ch 5 outline) is written to match the IBVS interaction matrix in Ch 6. Texts differ on whether the camera or the scene moves, so check the signs once Ch 5 is written in full.
4. **Noise-floor statement** in Ch 2 ("λ ≈ σ²·|W|·gain") is a qualitative rule of thumb, not a derived constant.
5. **Typical numbers** (accuracy 0.05–0.1 px, ε 0.01–0.03 px, k_max 10–30, window sizes, `(2^{L+1}−1)` range gain) are typical values from common implementations, not guarantees.
6. The doctors are **fictional characters** named after the researchers; a disclaimer is rendered with the references. Their lines never claim personal authorship.

## 6. Footage

**Simulator (current).** `sim/` renders the real route in Three.js:
- **Geometry:** OSM buildings (real footprints and heights), roads, crosswalks, sidewalks, park paths, trees, benches, bins, subway entrances, Citi Bike.
- **Detail:** storefronts with real OSM shop names where mapped and generic Chinese/English category signs elsewhere; roll-down shutters, fire escapes, parked cars, pedestrians.
- **Textures:** CC0 Poly Haven photos at real-world scale.
- **Props placed by `sim/journey.js`:**
  - the Happy Star Bakery shop front (its real wall; the interior and menu board are invented)
  - the white box truck (Straus Square corner)
  - the dock (38 m into Seward Park)
- **Chapter beats by frame (from `js/data/route.js`):** bakery 0–396 · sidewalk + Rutgers St 397–686 · truck 687–977 · plaza 978–1342 · Canal St dash 1343–2030 · park 2031–2577 · dock 2578–3039 · docked 3040–3123.
- **Traffic** (`makeTraffic` in `sim/journey.js`, models in `makeVehicle` in `sim/main.js`): cars, vans and cyclists, each timed to pass the robot at a chosen frame (`pass`: in a lane of East Broadway or Rutgers/Essex St; `across`: cutting across the robot's way). They give the tracker motion that is not the robot's own. None are placed at the truck stop (Ch 2), where the view is the truck's side. Re-record after editing (see README: Footage), then re-run `tools/make_figures.py` and update Figure 4's caption numbers.
- **Tracks** are real OpenCV KLT output (`tools/track_video.py`, 100 corners, FB check, `--min-eig` floor), so losses are genuine. They peak during the Canal St dash and at the truck.

**The "white wall", on a street.** A neighbourhood rarely has a big blank wall, so Chapter 2 uses a **parked white box truck**. Its plain side panel is the flat case, its rub rail and box edges are the edge/aperture case, and its wheels, bumper and panel ends are corners. Other real-world equivalents, if you film:
1. A **closed roll-down shutter**: horizontal ribs, so only vertical motion is observable, a textbook aperture problem. Chinatown has many before 10 a.m.
2. **Plywood construction hoarding or a sidewalk-shed wall** painted one colour ("POST NO BILLS").
3. A **plain stone or concrete building base**, or the smooth side of an MTA bus passing by.
4. **Big shop windows**: reflections move differently from the glass, breaking brightness constancy (better for Chapter 4).
5. **Fresh asphalt or plain sidewalk slabs** when the camera tilts down.

**Filming the real route** (to replace the simulation):
- **Camera:** about 0.7 m high, pointing forward, smartphone on a gimbal or a small cart.
- **Format:** 24–30 fps, 16:9, fixed exposure and focus if possible (auto-exposure breaks brightness constancy).
- **Route:** Happy Star Bakery shop front (28 Canal St) → east along the East Broadway sidewalk → across Rutgers St → Straus Square corner → north across Canal St at the crosswalk → Seward Park path → stop at a marker.
- **Footage to capture:**
  - **Chapter 2:** a close (3–4 m), still shot of a parked box truck or a closed shutter.
  - **Chapter 4:** a quick crossing.
  - **Chapter 5:** people walking toward the camera.
- **Dock target:** print the checkerboard from the dock board (`sim/textures.js` → `dockTexture`).
- **Afterwards:** downscale to 960×540, run `tools/track_video.py`, and write a `route.json` with the chapter ranges.
- **Rules:** check the property and park rules before filming; avoid identifiable faces, or blur them.

**Legacy placeholder.** `tools/make_placeholder.py` still generates the old synthetic panning clip; it is no longer referenced.

## 7. Verification status

- `node tools/check_math.mjs` passes, including a new test that `lkTranslation` recovers a known sub-pixel shift (2.3, −1.6) to within 0.05 px with decreasing SSD.
- Browser pass (headless Chrome via Puppeteer, 1440×900 and 820×1180), no page errors. Checked:
  - start screen; word reveal; Space/arrow/number navigation; call overlay; HUD
  - Ch 0 track cards
  - Ch 2 frozen frame 300: three simultaneous tensor cards (flat λ≈0, edge (2.56, 1.5e-4), corner (2.03, 1.71)) with no overlapping cards; the aperture arrows sit on a detected edge
  - Ch 3 live LK on frames 418→420: converges in 5 iterations to (−4.02, −0.98) vs. ground truth (−4, −1); SSD 11.8 → 0.011
  - notebook widget; Esc; tablet portrait layout with no horizontal overflow
- `tools/make_voices.mjs --dry-run` lists 57 voiced lines (≈9.1k characters); no line falls back to raw math. **Real generation not run** (needs your API key and voice ids).
- `tools/track_video.py` tested on the placeholder clip in an isolated venv.
- Not yet checked: real-device touch, screen-reader output, audio playback with real files.
