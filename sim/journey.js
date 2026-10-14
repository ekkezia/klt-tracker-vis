// The robot's trip, frame by frame, plus where the story props go.
//
// planJourney(data) returns
//   frames:   [{ x, z, y, yaw, pitch, roll }] camera pose per frame (24 fps)
//   chapters: [{ index, start, end }] frame ranges (inclusive)
//   keys:     named frames the story uses (e.g. where the robot stops at the truck)
//   truck, dockPose: prop placements (also used by city.js)
//   walkers:  pedestrians [{ pts, start, speed, seed }]
//   traffic:  moving cars, vans and cyclists [{ kind, pts, start, speed, seed }] (pts = the lane's polyline)
//
// Camera convention: robot camera 0.72 m above ground, looking along the path.
// Three.js cameras look down -z, so yaw = atan2(-dx, -dz) for heading (dx, dz).

import { pointInPoly, distToPolyline } from './city.js';

export const FPS = 24;
const CAM_H = 0.72;
const SHARP = (35 * Math.PI) / 180; // turn in place at bends sharper than this
const DOCK_INTO_PARK = 38;          // metres of park path before the dock

export function planJourney(data) {
  const path = buildPath(data);
  const out = [];
  const keys = {};
  const chapters = [];
  let s = path.startS, v = 0;
  let yaw = path.yawAt(s);
  let shake = 0;
  let off = null;  // [x, z] when the robot is off the route (leaving the shop front)
  let lookUp = 0;  // extra camera pitch (rad); the sensor head tilts up at the shop
  const dt = 1 / FPS;

  const push = () => {
    const [x, z] = off ?? path.pos(s);
    const f = out.length;
    // Small, deterministic body motion: wheels on paving, more when sprinting.
    const n1 = Math.sin(f * 1.9) * 0.5 + Math.sin(f * 3.7 + 1) * 0.3 + Math.sin(f * 7.3 + 2) * 0.2;
    const n2 = Math.sin(f * 2.3 + 0.5) * 0.6 + Math.sin(f * 5.1) * 0.4;
    const amp = 0.0015 + shake * 0.012 + Math.min(v, 1.5) * 0.0012;
    out.push({ x, z, y: CAM_H + n1 * amp, yaw, pitch: -0.05 + lookUp + n2 * amp * 0.6, roll: n1 * amp * 0.5 });
  };
  const hold = (n) => { v = 0; for (let i = 0; i < n; i++) push(); };
  const turnTo = (target, rate = 1.0) => {           // rad/s
    v = 0;
    let d = wrap(target - yaw);
    const steps = Math.max(1, Math.ceil(Math.abs(d) / (rate * dt)));
    for (let i = 0; i < steps; i++) { yaw += d / steps; push(); }
    yaw = target;
  };
  /** Drive along the path to `sTarget`, stopping to turn in place at sharp bends. */
  const driveTo = (sTarget, vmax, endV = 0, { accel = 0.9, decel = 0.9 } = {}) => {
    while (s < sTarget - 1e-3) {
      const bend = path.nextSharp(s);
      const goal = bend != null && bend < sTarget ? bend : sTarget;
      const goalV = goal === sTarget ? endV : 0;
      while (s < goal - 1e-3) {
        const rem = goal - s;
        const vStop = Math.sqrt(goalV * goalV + 2 * decel * rem);
        v = Math.max(0.05, Math.min(vmax, v + accel * dt, vStop));
        s = Math.min(goal, s + v * dt);
        yaw = approach(yaw, path.yawAt(s), 0.25);
        push();
      }
      if (goal === bend) turnTo(path.yawAt(bend + 0.05), 0.9);
    }
  };
  const mark = (name) => { keys[name] = out.length; };
  const chapter = (index, fn) => {
    const start = out.length;
    fn();
    chapters.push({ index, start, end: out.length - 1 });
  };

  const P = path.places;
  chapter(0, () => {                         // Happy Star Bakery: loaded at the shop front, then sets off
    const sf = path.shopFront;
    const join = path.startS + 2.5;
    if (sf) {
      off = sf.spot.slice();
      yaw = Math.atan2(sf.n[0], sf.n[1]);    // facing the shop (looking along -n)
      // 1) Looking down at the open box of egg tarts on a stool in front of the robot.
      lookUp = -0.42;
      hold(30); mark('tartsView'); hold(30);
      // 2) The box is lifted into the robot's compartment while the head tilts up to the shop sign.
      mark('tartsLift');
      for (let i = 0; i < 36; i++) { lookUp = -0.42 + 0.72 * ease((i + 1) / 36); push(); }
      mark('tartsGone');
      hold(36);
      // 3) Head back to level before setting off.
      for (let i = 0; i < 24; i++) { lookUp = 0.3 * (1 - (i + 1) / 24); push(); }
      lookUp = 0;
      const target = path.pos(join);
      const dx = target[0] - off[0], dz = target[1] - off[1], L = Math.hypot(dx, dz);
      turnTo(Math.atan2(-dx, -dz), 0.8);
      const step = 0.75 / FPS; // m per frame while rolling away from the shop
      for (let d = 0; d < L; d += step) { off = [off[0] + (dx / L) * step, off[1] + (dz / L) * step]; push(); }
      off = null;
    }
    s = join;
    turnTo(path.yawAt(s), 0.8);
    hold(12);
  });
  chapter(1, () => {                         // along the storefronts (turn first: pure rotation)
    turnTo(path.yawAt(path.startS + 3.2), 0.7);
    mark('lobbyTurnEnd');
    driveTo(P.corner - 7, 1.3, 0.9);
  });
  chapter(2, () => {                         // the white box truck at the Rutgers St corner
    driveTo(P.corner - 0.6, 0.9, 0);
    mark('truckStop');
    hold(110);
  });
  chapter(3, () => {                         // through the plaza toward the Canal St crosswalk
    const start = out.length;
    driveTo(P.crossStart - 1.2, 1.3, 0);
    keys.lkFrame = Math.round(start + (out.length - start) * 0.55);
  });
  chapter(4, () => {                         // wait for the light, then dash across Canal St
    hold(36);
    mark('sprintStart');
    shake = 1;
    driveTo(P.crossEnd + 1, 2.7, 1.8, { accel: 2.2 });
    shake = 0.4;
    driveTo(P.parkEntry, 1.8, 1.1);
    shake = 0;
  });
  chapter(5, () => {                         // Seward Park paths, people about
    mark('parkStart');
    driveTo(P.end - 13, 1.1, 0.8);
  });
  chapter(6, () => {                         // approach and dock
    driveTo(P.end, 0.8, 0, { decel: 0.35 });
    mark('dockStop');
    hold(48);
  });
  chapter(7, () => hold(84));                // debrief, docked

  return {
    frames: out, chapters, keys, fps: FPS,
    truck: path.truck, dockPose: path.dockPose, shopFront: path.shopFront,
    walkers: makeWalkers(path, keys),
    traffic: makeTraffic(out, data),
  };
}

// --------------------------------------------------------------------------------
function buildPath(data) {
  const raw = data.route.pts;
  const pts = simplify(raw, 0.8);
  const seg = [];
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push({ a, b, L, s0: acc, dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] });
    acc += L;
  }
  let total = acc;
  const segAt = (s) => seg.find((g) => s <= g.s0 + g.L) ?? seg[seg.length - 1];
  const pos = (s) => {
    const g = segAt(Math.max(0, Math.min(total, s)));
    const t = Math.max(0, Math.min(g.L, s - g.s0));
    return [g.a[0] + g.dir[0] * t, g.a[1] + g.dir[1] * t];
  };
  const yawOf = ([dx, dz]) => Math.atan2(-dx, -dz);
  // Sharp vertices (turn in place there); gentle bends are smoothed while driving.
  const sharp = [];
  for (let i = 1; i < seg.length; i++) {
    const d = Math.abs(wrap(yawOf(seg[i].dir) - yawOf(seg[i - 1].dir)));
    if (d > SHARP) sharp.push(seg[i].s0);
  }
  const yawAt = (s) => {
    const g = segAt(s);
    const next = seg[seg.indexOf(g) + 1];
    // Look ahead 1.5 m across gentle bends only.
    if (next && !sharp.includes(next.s0) && g.s0 + g.L - s < 1.5) {
      const w = 1 - (g.s0 + g.L - s) / 1.5;
      return yawOf(g.dir) + wrap(yawOf(next.dir) - yawOf(g.dir)) * w * 0.5;
    }
    return yawOf(g.dir);
  };
  const nextSharp = (s) => sharp.find((x) => x > s + 0.05) ?? null;

  // The robot leaves from the shop door: first path point outside every building.
  let startS = 0;
  for (let t = 0; t < 12; t += 0.1) if (!data.buildings.some((b) => pointInPoly(pos(t), b.poly))) { startS = t + 0.6; break; }

  // The start shop's front: the long exterior wall of its building that faces the
  // sidewalk the robot leaves by. city.js puts the shop's real name on it.
  let shopFront = null;
  const home = data.buildings.find((b) => pointInPoly([0, 0], b.poly));
  if (home) {
    const exit = pos(startS + 2);
    const poly = home.poly;
    let best = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 4) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
      if (pointInPoly([mid[0] + n[0] * 0.3, mid[1] + n[1] * 0.3], poly)) n = [-n[0], -n[1]];
      if (data.buildings.some((o) => o !== home && pointInPoly([mid[0] + n[0] * 1.2, mid[1] + n[1] * 1.2], o.poly))) continue;
      const score = Math.hypot(exit[0] - mid[0], exit[1] - mid[1]);
      if (!best || score < best.score) best = { a, b, mid, n, score };
    }
    if (best) shopFront = { a: best.a, b: best.b, n: best.n, spot: [best.mid[0] + best.n[0] * 4.5, best.mid[1] + best.n[1] * 4.5], name: data.route.from };
  }

  // Landmarks along the route.
  const corner = sharp.find((x) => x > 10) ?? 25;              // East Broadway / Rutgers St corner
  const canal = data.roads.filter((r) => r.name === 'Canal Street' && r.layer === 0);
  const inCanal = (t) => canal.some((r) => distToPolyline(pos(t), r.pts) < r.w / 2);
  let crossStart = null, crossEnd = null;
  for (let t = corner; t < total; t += 0.2) {
    if (crossStart == null && inCanal(t)) crossStart = t;
    if (crossStart != null && !inCanal(t)) { crossEnd = t; break; }
  }
  const park = data.parks.find((p) => p.name === data.route.to);
  let parkEntry = total * 0.6;
  for (let t = crossEnd ?? corner; t < total; t += 0.2) if (pointInPoly(pos(t), park.poly)) { parkEntry = t; break; }
  // The dock sits a short walk into the park (not at its centre), keeping the clip short.
  total = Math.min(total, parkEntry + DOCK_INTO_PARK);

  // White box truck: pulled up on the plaza edge to unload, broadside across the
  // robot's line of sight, 4.5 m past the corner where the robot stops and turns.
  const C = pos(corner);
  const inDir = segAt(corner - 0.1).dir;
  const truck = {
    p: [C[0] + inDir[0] * 4.5, C[1] + inDir[1] * 4.5],
    yaw: -Math.atan2(inDir[0], -inDir[1]), // length axis perpendicular to the robot's heading
  };

  // Dock: just past the end of the route, facing back toward the robot.
  const endDir = segAt(total - 0.01).dir;
  const end = pos(total);
  const dockPose = {
    p: [end[0] + endDir[0] * 1.3, end[1] + endDir[1] * 1.3],
    yaw: Math.atan2(-endDir[0], -endDir[1]),
  };

  return {
    pos, yawAt, nextSharp, startS, total, truck, dockPose, shopFront, dir: (s) => segAt(s).dir,
    places: { corner, crossStart: crossStart ?? corner + 15, crossEnd: crossEnd ?? corner + 30, parkEntry, end: total },
  };
}

/** Pedestrians, timed against the robot's journey. */
function makeWalkers(path, keys) {
  const P = path.places;
  const side = (s, lateral, along = 0) => {
    const [x, z] = path.pos(s + along);
    const [dx, dz] = path.dir(s);
    return [x - dz * lateral, z + dx * lateral];
  };
  const W = [];
  // Plaza: two people crossing ahead of the robot.
  const plaza = P.corner + (P.crossStart - P.corner) * 0.55;
  W.push({ pts: [side(plaza, -7), side(plaza, 7)], start: keys.truckStop + 120, speed: 1.3, seed: 1 });
  W.push({ pts: [side(plaza + 4, 8), side(plaza + 4, -8)], start: keys.truckStop + 150, speed: 1.2, seed: 2 });
  // Crosswalk: people who cross Canal St with the robot.
  for (const [lat, sp, seed] of [[1.3, 1.45, 3], [-1.2, 1.35, 4], [2.2, 1.25, 5]]) {
    W.push({ pts: [side(P.crossStart - 1, lat), side(P.crossEnd + 6, lat)], start: keys.sprintStart, speed: sp, seed });
  }
  // Park: someone walking toward the robot (expansion), people crossing, a jogger passing.
  W.push({ pts: [side(P.end - 2, 1.1), side(P.parkEntry, 1.1)], start: keys.parkStart - 10, speed: 1.25, seed: 6 });
  const mid = (P.parkEntry + P.end) / 2;
  W.push({ pts: [side(mid, -9), side(mid, 9)], start: keys.parkStart + 40, speed: 1.3, seed: 7 });
  W.push({ pts: [side(mid + 8, 9), side(mid + 8, -9)], start: keys.parkStart + 90, speed: 1.1, seed: 8 });
  W.push({ pts: [side(P.parkEntry - 4, -1.3), side(P.end + 4, -1.3)], start: keys.parkStart + 20, speed: 2.6, seed: 9 });
  return W;
}

/**
 * Moving vehicles, timed so each one passes the robot's position at a chosen frame
 * (`pass(...)`): cars and vans in the street beside the sidewalk, cyclists near the kerb.
 * They exist to give the tracker (and the story) things that move on their own, faster
 * than the robot: optical flow that is not just the robot's own motion.
 */
function makeTraffic(frames, data) {
  const R = data.roads;
  // Centre lines (direction of travel = increasing index): East Broadway, then Rutgers St -> Essex St.
  const EB = [...R[11].pts.slice(-4), ...R[8].pts.slice(1)];
  const RS = [...R[9].pts, ...R[7].pts.slice(1)];
  // Offset a polyline to the right of its direction of travel (right = (-dz, dx), as the camera sees it).
  const lane = (center, forward, lateral) => {
    const c = forward ? center : [...center].reverse();
    return c.map((p, i) => {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      return [p[0] - (dz / L) * lateral, p[1] + (dx / L) * lateral];
    });
  };
  const project = (poly, q) => { // metres along `poly` of the point closest to q
    let best = [Infinity, 0], acc = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2));
      const d = Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dz));
      if (d < best[0]) best = [d, acc + t * L];
      acc += L;
    }
    return best[1];
  };
  const T = [];
  const pass = (kind, center, forward, lateral, speed, frame, seed) => {
    const pts = lane(center, forward, lateral), r = frames[Math.min(frames.length - 1, frame)];
    T.push({ kind, pts, start: frame - (project(pts, [r.x, r.z]) / speed) * FPS, speed, seed });
  };
  // Straight across the robot's way, `ahead` metres in front of it at `frame`, from `from` m to its left to `to` m to its right
  // (negative `from` / `to` swap the side): optical flow at its strongest, a cyclist sweeping across the view.
  const across = (kind, frame, ahead, from, to, speed, seed) => {
    const r = frames[frame], hx = -Math.sin(r.yaw), hz = -Math.cos(r.yaw), rx = -hz, rz = hx;
    const q = [r.x + hx * ahead, r.z + hz * ahead];
    T.push({ kind, pts: [[q[0] - rx * from, q[1] - rz * from], [q[0] + rx * to, q[1] + rz * to]], start: frame - (Math.abs(from) / speed) * FPS, speed, seed });
  };
  // East Broadway runs along the right of the sidewalk. Westbound is the near lane (it meets the robot head-on).
  //                 kind    road forward lat  m/s  frame seed
  pass('car',  EB, false, 2.6, 9.0,  505, 11);
  pass('van',  EB, true,  2.6, 8.0,  530, 12);
  pass('bike', EB, false, 4.6, 5.0,  585, 13);
  pass('car',  EB, true,  2.6, 10.0, 640, 14);
  pass('bike', EB, true,  4.6, 5.5,  690, 15);
  // The far side of the Rutgers St crosswalk, ahead of the robot: cyclists sweeping across the view.
  across('bike', 545, 11, 6, 9, 5.0, 41);
  across('bike', 650, 10, -6, -9, 5.5, 42);
  across('bike', 735, 10, 5, 9, 5.5, 43);
  // The plaza ahead while the robot walks north: cyclists cutting across its path.
  across('bike', 1130, 9, 6, 16, 5.0, 31);
  across('bike', 1215, 10, -6, -16, 5.5, 32);
  across('bike', 1290, 9, 6, 16, 6.0, 33);
  across('bike', 1355, 8, -6, -16, 5.0, 34);
  // Rutgers / Essex St, on the robot's left while it walks north: the near lane flows the same way as the robot.
  pass('car',  RS, true,  2.8, 8.0,  1090, 19);
  pass('bike', RS, false, 4.8, 5.0,  1175, 20);
  pass('car',  RS, false, 2.8, 9.0,  1235, 21);
  pass('van',  RS, true,  2.8, 7.0,  1300, 22);
  pass('bike', RS, true,  4.8, 5.5,  1365, 23);
  pass('car',  RS, true,  2.8, 9.5,  1485, 24);
  pass('car',  RS, false, 2.8, 8.5,  1560, 25);
  pass('bike', RS, true,  4.8, 6.0,  1650, 26);
  pass('van',  RS, false, 2.8, 7.5,  1740, 27);
  pass('car',  RS, true,  2.8, 10.0, 1840, 28);
  return T;
}

// ---- helpers -------------------------------------------------------------------
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function approach(a, b, k) { return a + wrap(b - a) * k; }
function closestOnSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
  return [a[0] + t * dx, a[1] + t * dz];
}
function simplify(pts, tol) {               // Douglas-Peucker
  if (pts.length < 3) return pts;
  let idx = -1, dmax = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const q = closestOnSeg(pts[i], a, b);
    const d = Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}
