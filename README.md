# Follow the Corner: KLT tracker explainer

An in-depth, story-driven explanation of the Kanade–Lucas–Tomasi (KLT) feature tracker, told from the camera of a small indoor delivery drone. A headline names what is being explained right now (e.g. "Least squares over a window"), with the scene location ("Chapter 1 · The lobby") as its kicker. A timeline along the bottom has a checkpoint per chapter. The drone's camera feed fills the screen. A game-style dialogue box at the bottom carries the conversation, and explanations (structure tensors, the aperture problem, live Lucas–Kanade iterations) are drawn **onto the footage, at the spot they explain**. Three fictional doctors (Lucas, Kanade, Tomasi) explain each fix, with optional ElevenLabs voice-over. A Lab Notebook drawer holds the full math and an interactive widget.

## Run

Plain HTML/CSS/JS with ES modules: no framework, no build step. You need a local server, because ES modules and video seeking don't work from `file://`:

```bash
cd klt-tracker
python3 tools/serve.py          # http://localhost:8000
```

`tools/serve.py` supports HTTP Range requests, which video seeking needs. `python3 -m http.server` does not. The only external dependency is **KaTeX** (jsDelivr), used for math.

### Controls

| Key | Action |
|---|---|
| `Space` / `Enter` / `→` / click | next line (first press finishes the text if it's still appearing) |
| `←` | previous line |
| Timeline (bottom) | drag or click the rail to scrub (tooltip previews the topic); scroll/trackpad over it steps; click a checkpoint to jump to that chapter; when focused: `←`/`→` step, `PageUp`/`PageDown` chapter, `Home`/`End` |
| `0`–`7` | jump to chapter |
| `N` | Lab Notebook, opened at the section for the current line (also the "Lab notes §" button) |
| `V` | sound (voice + phone effects) on/off |
| `G` | greyscale footage: auto (grey while an overlay points at the footage) → always → off |
| `Esc` | close notebook |

## Voice-over (ElevenLabs)

Audio is generated **once, on your machine**, and saved as MP3s. The site only plays files, so your API key never reaches the browser.

```bash
echo "ELEVENLABS_API_KEY=sk_..." > .env          # gitignored
node tools/make_voices.mjs --list-voices          # pick voice ids
# set characters.<id>.voice.id in js/data/chapters.js (wren, lucas, kanade, tomasi)
node tools/make_voices.mjs --dry-run              # preview lines + total characters
node tools/make_voices.mjs --only=boot,lobby,wall,corridor
```

- Voices are set by **name** in `chapters.js` (`Wren - Robot`, `Peter`, `Tomasi`) and resolved to ids automatically; `--speakers=wren,tomasi` limits a run to some characters.
- Free ElevenLabs accounts can't use *community library* voices through the API (HTTP 402); use your own voices or ElevenLabs' premade ones, or add credits.
- Output: `assets/voice/*.mp3` plus `assets/voice/manifest.json`. Unchanged lines are skipped on re-runs, so you aren't re-billed.
- Lines whose text contains math have a `say` field with a plain-English version for speech.
- All 57 lines are about 9,100 characters; the 4 fully written chapters are about 7,100. `--model=eleven_flash_v2_5` uses fewer credits.

## Footage: the Chinatown simulator

The footage is a **Three.js simulation of the real route**: Happy Star Bakery (28 Canal St) → Straus Square → across Canal St → a dock inside Seward Park, built from OpenStreetMap data with CC0 photo textures. A robot-height camera (0.72 m) drives forward along the mapped sidewalks.

```bash
python3 tools/serve.py 8000 --upload-dir build/sim       # upload dir enables the recorder
# view and scrub:      http://localhost:8000/sim/
# record all frames:   http://localhost:8000/sim/?record   (960x540 JPEGs -> build/sim/frames/)
ffmpeg -framerate 24 -i build/sim/frames/%05d.jpg -c:v libx264 -preset slow -crf 28 -g 24 \
       -pix_fmt yuv420p -movflags +faststart -an assets/clips/chinatown.mp4
python3 tools/track_video.py assets/clips/chinatown.mp4 assets/tracks/chinatown.json --clip chinatown --max-corners 100
gzip -f -9 assets/tracks/chinatown.json                    # the site loads chinatown.json.gz
python3 tools/make_figures.py                              # article figures -> assets/figures/
cp build/sim/route.json assets/clips/chinatown.route.json
python3 tools/route_module.py assets/clips/chinatown.route.json js/data/route.js
```

`js/data/route.js` (generated) gives each chapter its frame range and names key moments (`K.truckStop`, `K.lkFrame`, …), so re-recording never requires editing frame numbers by hand. Map data: `tools/osm_to_scene.py sim/osm-source.json sim/scene-data.json`.

### Real footage

To swap in real video (e.g. filmed along the same route):

1. Film the route (see "Filming the real route" in `HANDOFF.md`). Keep 16:9 at the size in `js/config.js` (`STAGE`, currently 960×540).
2. Encode with a short keyframe interval so seeking is fast:
   `ffmpeg -i in.mov -vf scale=960:540 -c:v libx264 -g 12 -crf 23 -pix_fmt yuv420p -movflags +faststart -an assets/clips/my_clip.mp4`
3. Compute **real** KLT tracks (OpenCV pyramidal LK + forward–backward check):
   `pip install opencv-python-headless numpy`
   `python3 tools/track_video.py assets/clips/my_clip.mp4 assets/tracks/my_clip.json`
4. Register it in `clips` in `js/data/chapters.js`, write a `route.json` with the chapter ranges and key frames of the real clip (same format as `assets/clips/chinatown.route.json`), and regenerate `js/data/route.js`. `{ auto: … }` and `{ track: 'auto' }` anchors adapt on their own.

## Checks

```bash
node tools/check_math.mjs        # eigenvalues, flat/edge/corner, Ch1 example, Gauss–Newton, LK solver
```

Browser tests: open `http://localhost:8000/?debug`, which exposes `window.__klt = { player, steps, stage, state }` (e.g. `__klt.player.goTo(i)`).

## File map

```
index.html                     full-screen stage, HUD panel, dialogue box, start screen, notebook
css/style.css                  layout + theme (dialogue bubble, glass cards, notebook paper style)
js/main.js                     bootstrap, controls, keyboard
js/config.js                   STAGE size (one constant), overlay + HUD settings
js/data/chapters.js            ALL content: characters (+ voices), clips, chapters 0–7, references
js/data/notebook/<n>-<name>.js  Lab Notebook text, one file per chapter
js/engine/state.js             tiny observable store
js/engine/chapterEngine.js     chapters → steps; step player (footage, dialogue, annotations, voice)
js/stage/stage.js              <video> (cover) + overlay canvas; loop / hold playback; frame grabs
js/stage/tracks.js             track-file loader/validator, per-frame stats
js/stage/scenes.js             per-chapter overlay layer (placeholders)
js/annotations/annotations.js  explanations drawn on the footage, anchored to features
js/ui/dialogue.js              dialogue box (with talking portraits), references panel
js/ui/timeline.js              bottom timeline slider with chapter checkpoints
js/ui/icons.js                 line-art checkpoint symbols
js/ui/voice.js                 voice-over playback from assets/voice/manifest.json
js/ui/phoneCall.js             "on call" overlay
js/ui/hud.js                   frame / tracked / mean forward-backward error
js/ui/notebook.js              Lab Notebook drawer (sections + widget)
js/ui/sfx.js                   synthesized phone ring / pickup sounds
js/widgets/registry.js         playground id → mount(container, api)
js/widgets/pg.js               shared playground helpers (shell, sliders, canvases)
js/widgets/*.js                one playground per chapter (displacement, flow1d, structureTensor,
                               lkPlayground, pyramidPlayground, pipelinePlayground, servoPlayground)
js/lib/imageOps.js             gray, gradients, structure tensor, eig, Harris, Shi–Tomasi, bilinear, LK
js/lib/markup.js               tiny markup → HTML (+ KaTeX)
assets/clips/chinatown.mp4     simulated route footage (960x540, 24 fps) + chinatown.route.json timeline
assets/tracks/                 real KLT tracks for it (gzipped)
assets/figures/                article figures (generated by tools/make_figures.py)
assets/characters/             expression sheets + 12 cut frames per character (wren, kanade, tomasi)
js/data/route.js               GENERATED chapter ranges / key frames from the recording
js/data/expressions.js         portrait frames + talking sets
sim/                           Three.js simulator (index.html, main.js, city.js, journey.js, textures.js,
                               scene-data.json from OSM, CC0 textures, vendored three r160)
assets/voice/                  generated voice-over (created by make_voices.mjs)
tools/serve.py                 static server with Range support
tools/make_placeholder.py      (legacy) synthetic panning clip + ground-truth tracks
tools/osm_to_scene.py          OpenStreetMap -> sim/scene-data.json (route via sidewalks/crossings)
tools/route_module.py          route.json -> js/data/route.js
tools/split_sprites.py         4x3 expression sheet -> 12 aligned frames
tools/track_video.py           real KLT tracks for any video (OpenCV)
tools/make_voices.mjs          ElevenLabs voice-over generator
tools/check_math.mjs           math tests
tools/make_figures.py          article figures from the footage + tracks (OpenCV)
HANDOFF.md                     architecture, contracts, TODO hooks, footage guidance, open questions
```
