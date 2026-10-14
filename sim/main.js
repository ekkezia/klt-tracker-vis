// Chinatown delivery simulator: Happy Star Bakery (28 Canal St) -> Seward Park.
//
// View:    open sim/ (through tools/serve.py). Space plays/pauses, the slider
//          scrubs, chapter buttons jump. "Overview" shows a bird's-eye view.
// Record:  sim/?record  renders every frame at 960x540 and uploads the JPEGs and
//          the timeline (route.json) to tools/serve.py --upload-dir. See README.

import * as THREE from 'three';
import { createMaterials, rng } from './textures.js';
import { buildCity } from './city.js';
import { planJourney, FPS } from './journey.js';

const params = new URLSearchParams(location.search);
const RECORD = params.has('record');
const W = 960, H = 540; // recording size (16:9); matches js/config.js STAGE

const data = await (await fetch('./scene-data.json')).json();
const plan = planJourney(data);
data.truck = plan.truck;
data.dockPose = plan.dockPose;
data.shopFront = plan.shopFront;

// --- renderer, scene, lights ---------------------------------------------------
const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: RECORD });
renderer.setPixelRatio(RECORD ? 1 : Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !params.has('noshadows');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9d6e3);
scene.fog = new THREE.Fog(0xc9d6e3, 70, 320);
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x7d7468, 1.15));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(-60, 90, 40); // late-morning sun from the south-east-ish, high
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const M = createMaterials(renderer);
buildCity(data, scene, M, { shadows: renderer.shadowMap.enabled });
const people = plan.walkers.map((w) => makePerson(w, M));
people.forEach((p) => scene.add(p.group));
// Clouds for the ending (the camera tilts up to the sky after the last chapter): only shown from skyStart.
const clouds = makeClouds(plan);
scene.add(clouds);
const vehicles = plan.traffic.map((v) => makeVehicle(v, M));
vehicles.forEach((v) => scene.add(v.group));
const tarts = plan.shopFront ? makeEggTarts(plan, M) : null;
if (tarts) scene.add(tarts.group);

const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 600);
camera.rotation.order = 'YXZ';
const overview = new THREE.PerspectiveCamera(45, W / H, 1, 2000);

// --- frame state ------------------------------------------------------------------
let frame = 0;
function setFrame(f) {
  frame = Math.max(0, Math.min(plan.frames.length - 1, Math.round(f)));
  const p = plan.frames[frame];
  camera.position.set(p.x, p.y, p.z);
  camera.rotation.set(p.pitch, p.yaw, p.roll);
  sun.target.position.set(p.x, 0, p.z);
  sun.position.set(p.x - 60, 90, p.z + 40);
  people.forEach((pp) => pp.update(frame));
  vehicles.forEach((vv) => vv.update(frame));
  clouds.visible = frame >= plan.keys.skyStart;
  tarts?.update(frame);
}

// --- the order: an open box of six egg tarts on a stool, then lifted aboard ----------
function makeEggTarts(plan, M) {
  const { spot, n } = plan.shopFront;
  const fwd = [-n[0], -n[1]];                       // from the robot toward the shop
  const base = [spot[0] + fwd[0] * 0.62, spot[1] + fwd[1] * 0.62];
  const yaw = Math.atan2(fwd[0], fwd[1]);
  const g = new THREE.Group();
  const stool = new THREE.Group();
  const wood = M.flat(0x8a5a3a, { roughness: 0.7 });
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24), M.flat(0xb22222, { roughness: 0.5 }));
  seat.position.y = 0.45;
  stool.add(seat);
  for (let k = 0; k < 4; k++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.45, 8), wood);
    leg.position.set(Math.cos(k * Math.PI / 2 + 0.78) * 0.12, 0.225, Math.sin(k * Math.PI / 2 + 0.78) * 0.12);
    stool.add(leg);
  }
  const box = new THREE.Group();
  const paper = M.flat(0xf4efe6, { roughness: 0.85 });
  const W = 0.26, D = 0.18, H = 0.06;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, 0.006, D), paper); bottom.position.y = 0.003;
  // The front wall (toward the robot) is low, like an open-front pastry box.
  const walls = [[W, 0.022, 0.004, 0, 0.011, -D / 2], [W, H, 0.004, 0, H / 2, D / 2], [0.004, H, D, -W / 2, H / 2, 0], [0.004, H, D, W / 2, H / 2, 0]]
    .map(([w, h, d, x, y, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paper); m.position.set(x, y, z); return m; });
  // Lid hinged at the far side, standing open, with a red star print.
  const c = document.createElement('canvas'); c.width = 256; c.height = 180;
  const gx = c.getContext('2d');
  gx.fillStyle = '#f4efe6'; gx.fillRect(0, 0, 256, 180);
  gx.fillStyle = '#c8102e'; gx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 52, a = -Math.PI / 2 + i * Math.PI / 5; gx.lineTo(128 + Math.cos(a) * r, 80 + Math.sin(a) * r); }
  gx.fill();
  gx.font = '700 22px Helvetica, Arial, sans-serif'; gx.textAlign = 'center'; gx.fillText('HAPPY STAR', 128, 160);
  const lidTex = new THREE.CanvasTexture(c); lidTex.colorSpace = THREE.SRGBColorSpace;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, D, 0.004), [paper, paper, paper, paper, new THREE.MeshStandardMaterial({ map: lidTex, roughness: 0.85 }), paper]);
  lid.position.set(0, H + D / 2 - 0.01, D / 2 + 0.01); lid.rotation.x = -0.25;
  // Six egg tarts: fluted golden shells with glossy custard tops.
  const shell = M.flat(0xc98a3c, { roughness: 0.6, flatShading: true });
  const custard = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.25, emissive: 0x3a2a00, emissiveIntensity: 0.25 });
  const scorch = M.flat(0xb06a1c, { roughness: 0.5 });
  box.add(bottom, ...walls, lid);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = (i - 1) * 0.082, z = (j - 0.5) * 0.082;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.024, 14, 1), shell); s.position.set(x, 0.018, z);
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), custard);
    t.scale.y = 0.28; t.position.set(x, 0.029, z);
    const spot1 = new THREE.Mesh(new THREE.CircleGeometry(0.007 + (i + j) % 2 * 0.003, 10), scorch);
    spot1.rotation.x = -Math.PI / 2; spot1.position.set(x + 0.008, 0.0375, z - 0.006);
    box.add(s, t, spot1);
  }
  box.position.y = 0.465;
  g.add(stool, box);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.position.set(base[0], 0, base[1]);
  g.rotation.y = yaw; // local +z points at the shop: lid on the far side, lift moves toward -z (the robot)
  const k = plan.keys;
  return {
    group: g,
    update(f) {
      // Before the lift the box sits on the stool; during the lift it rises and moves
      // back over the robot, out of view; afterwards it is aboard (hidden).
      const t = Math.min(1, Math.max(0, (f - k.tartsLift) / Math.max(1, k.tartsGone - k.tartsLift)));
      box.visible = f < k.tartsGone;
      box.position.set(0, 0.465 + t * 0.9, -t * 0.7);
      box.rotation.x = -t * 0.3;
    },
  };
}

// --- people ------------------------------------------------------------------------
function makePerson(w, M) {
  const r = rng(w.seed * 31 + 7);
  const top = new THREE.Color().setHSL(r(), 0.35 + r() * 0.4, 0.25 + r() * 0.35);
  const pants = new THREE.Color().setHSL(0.6 + r() * 0.1, 0.2, 0.12 + r() * 0.2);
  const skin = [0xe8c4a0, 0xc68e64, 0x8d5a3b, 0xf1d3b8][Math.floor(r() * 4)];
  const g = new THREE.Group();
  const mk = (geo, color, y) => { const m = new THREE.Mesh(geo, M.flat(color, { roughness: 0.8 })); m.position.y = y; m.castShadow = true; return m; };
  const torso = mk(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), top, 1.22);
  const head = mk(new THREE.SphereGeometry(0.11, 14, 10), skin, 1.66);
  const hair = mk(new THREE.SphereGeometry(0.115, 14, 10, 0, 6.3, 0, 1.4), 0x1d1712, 1.69);
  const legs = [-0.1, 0.1].map((x) => { const pv = new THREE.Group(); pv.position.set(x, 0.92, 0); const l = mk(new THREE.CapsuleGeometry(0.075, 0.72, 4, 8), pants, -0.45); pv.add(l); return pv; });
  const arms = [-0.25, 0.25].map((x) => { const pv = new THREE.Group(); pv.position.set(x, 1.45, 0); const a = mk(new THREE.CapsuleGeometry(0.055, 0.5, 4, 8), top, -0.3); pv.add(a); return pv; });
  g.add(torso, head, hair, ...legs, ...arms);
  const scale = 0.92 + r() * 0.15;
  g.scale.setScalar(scale);
  const L = Math.hypot(w.pts[1][0] - w.pts[0][0], w.pts[1][1] - w.pts[0][1]);
  const dir = [(w.pts[1][0] - w.pts[0][0]) / L, (w.pts[1][1] - w.pts[0][1]) / L];
  g.rotation.y = Math.atan2(dir[0], dir[1]);
  return {
    group: g,
    update(f) {
      const t = (f - w.start) / FPS;
      const s = Math.max(0, Math.min(L, t * w.speed));
      g.visible = t > -8 && s < L; // stand at the start a little before setting off
      g.position.set(w.pts[0][0] + dir[0] * s, 0, w.pts[0][1] + dir[1] * s);
      const walking = t > 0 && s < L;
      const ph = walking ? Math.sin(t * w.speed * 5.2) : 0;
      legs[0].rotation.x = ph * 0.5; legs[1].rotation.x = -ph * 0.5;
      arms[0].rotation.x = -ph * 0.4; arms[1].rotation.x = ph * 0.4;
    },
  };
}

// --- clouds: soft puffs overhead, around where the camera ends up looking ----------------
function makeClouds(plan) {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), grad = x.createRadialGradient(64, 60, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,.85)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad; x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const r = rng(77), end = plan.frames[plan.frames.length - 1];
  const fx = -Math.sin(end.yaw), fz = -Math.cos(end.yaw);              // where the camera looks (horizontally)
  const dirAt = (az, el) => {                                           // az: sideways turn from the view, el: elevation (rad)
    const ca = Math.cos(az), sa = Math.sin(az);
    const hx = fx * ca - fz * sa, hz = fx * sa + fz * ca;
    return [hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)];
  };
  const puff = (c0, size, shade) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.95, color: shade }));
    s.position.set(...c0); s.scale.set(size, size * 0.62, 1); g.add(s);
  };
  const cloud = (az, el, R, size) => {
    const d = dirAt(az, el), base = [end.x + d[0] * R, end.y + d[1] * R, end.z + d[2] * R];
    for (let i = 0; i < 7; i++) puff([base[0] + (r() - 0.5) * size * 1.0, base[1] + (r() - 0.5) * size * 0.3, base[2] + (r() - 0.5) * size * 1.0],
      size * (0.3 + r() * 0.35), r() < 0.45 ? 0xc9d5e5 : 0xffffff);   // some puffs a little shaded, so clouds have form
  };
  cloud(0, 1.12, 140, 75);                                             // right where the camera ends up
  for (let i = 0; i < 18; i++) cloud((r() - 0.5) * 2.4, 0.4 + r() * 0.95, 120 + r() * 80, 35 + r() * 40);
  g.visible = false;
  return g;
}

// --- traffic: cars, vans, cyclists --------------------------------------------------
function makeVehicle(v, M) {
  const r = rng(v.seed * 53 + 3);
  const g = new THREE.Group();
  const mk = (geo, color, x, y, z, opts) => { const m = new THREE.Mesh(geo, M.flat(color, { roughness: 0.6, ...opts })); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const paint = [0x9b1c1c, 0x1f3a5f, 0xd9d9d6, 0x2d2d2d, 0xb58900, 0x2f6f4f, 0xeeeeee][Math.floor(r() * 7)];
  const wheels = [], spin = [];
  let rider = null;
  if (v.kind === 'bike') {
    const wheel = (z) => { const w = mk(new THREE.TorusGeometry(0.34, 0.03, 8, 20), 0x151515, 0, 0.36, z); w.rotation.y = Math.PI / 2; spin.push(w); };
    wheel(0.55); wheel(-0.55);
    mk(new THREE.BoxGeometry(0.04, 0.05, 1.1), 0x333333, 0, 0.62, 0);
    mk(new THREE.BoxGeometry(0.04, 0.5, 0.04), 0x333333, 0, 0.62, 0.5);
    const top = new THREE.Color().setHSL(r(), 0.5, 0.4), skin = [0xe8c4a0, 0xc68e64, 0x8d5a3b][Math.floor(r() * 3)];
    const torso = mk(new THREE.CapsuleGeometry(0.16, 0.38, 4, 8), top, 0, 1.12, 0.05); torso.rotation.x = 0.5;
    mk(new THREE.SphereGeometry(0.1, 12, 10), skin, 0, 1.52, 0.28);
    mk(new THREE.SphereGeometry(0.105, 12, 8, 0, 6.3, 0, 1.5), 0x222222, 0, 1.55, 0.28);   // helmet
    rider = [-0.1, 0.1].map((x) => { const pv = new THREE.Group(); pv.position.set(x, 0.72, -0.05); g.add(pv);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 6), M.flat(0x20242c, { roughness: 0.8 })); leg.position.set(0, -0.28, 0); leg.castShadow = true; pv.add(leg); return pv; });
  } else {
    const van = v.kind === 'van', len = van ? 5.2 : 4.5, h = van ? 1.25 : 0.62;
    mk(new THREE.BoxGeometry(1.85, 0.6, len), paint, 0, 0.62, 0);                                   // body
    mk(new THREE.BoxGeometry(1.7, h, van ? len * 0.78 : len * 0.5), van ? 0xf1f1ee : paint, 0, 0.92 + h / 2 - 0.3, van ? -len * 0.1 : -len * 0.04); // cabin / box
    mk(new THREE.BoxGeometry(1.72, 0.42, 0.06), 0x1a2229, 0, 1.2, len * (van ? 0.3 : 0.2), { roughness: 0.1, metalness: 0.6 }); // windscreen band
    for (const [x, z] of [[-0.9, len * 0.32], [0.9, len * 0.32], [-0.9, -len * 0.32], [0.9, -len * 0.32]]) {
      const w = mk(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14), 0x151515, x, 0.33, z); w.rotation.z = Math.PI / 2; spin.push(w);
    }
  }
  const pts = v.pts, seg = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push([L, l]); L += l; }
  return {
    group: g,
    update(f) {
      const s = ((f - v.start) / FPS) * v.speed;
      g.visible = s >= 0 && s <= L;
      if (!g.visible) return;
      let i = seg.findIndex(([a, l]) => s <= a + l); if (i < 0) i = seg.length - 1;
      const [a, l] = seg[i], k = l ? (s - a) / l : 0, p0 = pts[i], p1 = pts[i + 1];
      g.position.set(p0[0] + (p1[0] - p0[0]) * k, 0, p0[1] + (p1[1] - p0[1]) * k);
      g.rotation.y = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
      spin.forEach((w) => { w.rotation[v.kind === 'bike' ? 'x' : 'x'] = -s / 0.34; });
      if (rider) { const ph = Math.sin(s * 4.2); rider[0].rotation.x = ph * 0.7; rider[1].rotation.x = -ph * 0.7; }
    },
  };
}

// --- viewing UI ------------------------------------------------------------------
const ui = {
  slider: document.querySelector('#scrub'), label: document.querySelector('#label'),
  play: document.querySelector('#play'), chapters: document.querySelector('#chapters'),
  over: document.querySelector('#overview'), status: document.querySelector('#status'),
};
ui.slider.max = String(plan.frames.length - 1);
let playing = false, useOverview = false, last = 0, debugView = null;
const chapterOf = (f) => plan.chapters.find((c) => f >= c.start && f <= c.end)?.index ?? 0;
function render() {
  if (debugView) {
    overview.position.set(...debugView[0]); overview.lookAt(...debugView[1]);
    renderer.render(scene, overview);
  } else if (useOverview) {
    const p = plan.frames[frame];
    overview.position.set(p.x + 40, 70, p.z + 70);
    overview.lookAt(p.x, 0, p.z);
    renderer.render(scene, overview);
  } else renderer.render(scene, camera);
  ui.slider.value = String(frame);
  ui.label.textContent = `frame ${String(frame).padStart(4, '0')} / ${plan.frames.length - 1} · chapter ${chapterOf(frame)} · ${(frame / FPS).toFixed(1)} s`;
}
function loop(t) {
  if (playing) {
    const adv = Math.max(1, Math.round(((t - last) / 1000) * FPS));
    setFrame(frame + adv);
    if (frame >= plan.frames.length - 1) playing = false;
  }
  last = t;
  render();
  if (!RECORD) requestAnimationFrame(loop);
}
function resize() {
  const w = RECORD ? W : innerWidth, h = RECORD ? H : innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  camera.aspect = overview.aspect = w / h;
  camera.updateProjectionMatrix(); overview.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

ui.chapters.innerHTML = plan.chapters.map((c) => `<button data-f="${c.start}">${c.index}</button>`).join('');
ui.chapters.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) setFrame(+b.dataset.f); });
ui.slider.addEventListener('input', () => setFrame(+ui.slider.value));
ui.play.addEventListener('click', () => { playing = !playing; ui.play.textContent = playing ? 'Pause' : 'Play'; });
ui.over.addEventListener('click', () => { useOverview = !useOverview; ui.over.setAttribute('aria-pressed', String(useOverview)); });
addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); ui.play.click(); }
  if (e.key === 'ArrowRight') setFrame(frame + (e.shiftKey ? 24 : 1));
  if (e.key === 'ArrowLeft') setFrame(frame - (e.shiftKey ? 24 : 1));
  if (e.key === 'o') ui.over.click();
});

await M.ready();
setFrame(+(params.get('frame') ?? 0));
ui.status.textContent = `${data.route.from} → ${data.route.to} · ${data.route.length} m · ${plan.frames.length} frames @ ${FPS} fps`;
window.__sim = {
  plan, setFrame, render: () => render(),
  /** Debug: render from an arbitrary viewpoint. */
  look(px, py, pz, tx, ty, tz) { debugView = [[px, py, pz], [tx, ty, tz]]; render(); },
  unlook() { debugView = null; render(); },
};

if (RECORD) record().catch((e) => { window.__record = { error: String(e) }; console.error(e); });
else requestAnimationFrame(loop);

// --- recorder ----------------------------------------------------------------------
async function record() {
  document.body.classList.add('recording');
  const from = +(params.get('from') ?? 0);
  const to = Math.min(plan.frames.length - 1, +(params.get('to') ?? plan.frames.length - 1));
  const state = window.__record = { from, to, done: from, error: null, finished: false };
  const inflight = new Set();
  const upload = (name, body, type) => fetch(`/__upload/${name}`, { method: 'POST', headers: { 'Content-Type': type }, body })
    .then((r) => { if (!r.ok) throw new Error(`upload ${name}: HTTP ${r.status}`); });

  // Timeline first, so the site can be wired up while frames render.
  await upload('route.json', JSON.stringify({
    clip: 'chinatown', fps: FPS, width: W, height: H, frameCount: plan.frames.length,
    route: data.route, chapters: plan.chapters, keys: plan.keys, attribution: data.attribution,
  }, null, 2), 'application/json');

  for (let f = from; f <= to; f++) {
    setFrame(f);
    renderer.render(scene, camera);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.93));
    const job = upload(`frames/${String(f).padStart(5, '0')}.jpg`, blob, 'image/jpeg').finally(() => inflight.delete(job));
    inflight.add(job);
    if (inflight.size >= 6) await Promise.race(inflight);
    state.done = f;
  }
  await Promise.all(inflight);
  state.finished = true;
}
