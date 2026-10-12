// Builds the street scene from sim/scene-data.json (OpenStreetMap-derived).
// Frame: metres, x = east, y = up, z = south. Geometry is batched per material
// so the whole neighbourhood is a few dozen draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import {
  FACADES, SHUTTERS, GENERIC_SIGNS, signTexture, interiorTexture, dockTexture, panelTexture, foliageTexture, rng,
} from './textures.js';

const STOREFRONT_H = 4.2;   // ground-floor band
const SIGN = [3.05, 4.05];  // sign board vertical extent
const DETAIL_RADIUS = 85;   // full storefront / window detail within this distance of the route

// --- geometry batching -----------------------------------------------------------
class Batch {
  constructor() { this.parts = new Map(); }
  _list(mat) {
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    return this.parts.get(mat);
  }
  /** Quad p0..p3 (counter-clockwise seen from the front), uvs [[u,v]x4]. */
  quad(mat, p, uv) {
    const pos = [], nrm = [], tc = [];
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0])).normalize();
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(p[k].x, p[k].y, p[k].z); nrm.push(n.x, n.y, n.z); tc.push(uv[k][0], uv[k][1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(tc, 2));
    this._list(mat).push(g);
  }
  /** Any geometry (made non-indexed with position/normal/uv). */
  add(mat, geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    this._list(mat).push(g);
  }
  build(parent, { shadows = true } = {}) {
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = shadows && !mat.userData.noShadow;
      m.receiveShadow = true;
      parent.add(m);
    }
  }
}

/** A box as geometry: centre (x,y,z), size (w along dir, h, d along normal), yaw. */
function boxGeo(w, h, d, x, y, z, yaw = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(yaw); g.translate(x, y, z);
  return g;
}

// --- 2D helpers (x, z) --------------------------------------------------------------
const v2 = (p) => new THREE.Vector2(p[0], p[1]);
function pointInPoly([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, distToSeg(p, pts[i], pts[i + 1]));
  return best;
}
function distToSeg([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
const hash = (n) => { let h = n >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return h >>> 0; };

// =====================================================================================
export function buildCity(data, scene, M, { shadows = true } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const B = new Batch();
  const route = data.route.pts;
  const nearRoute = (p) => distToPolyline(p, route);
  const crossEnds = data.crossings.flatMap((c) => [c.pts[0], c.pts[c.pts.length - 1]]);
  const nearCrossing = (p, r) => crossEnds.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r);
  const roadsFlat = data.roads.filter((r) => r.layer === 0);
  const inRoad = (p, self = null, pad = 0) => roadsFlat.some((r) => r !== self && distToPolyline(p, r.pts) < r.w / 2 + pad);

  // ---- materials ----
  const mat = {
    ground: M.photo('concrete_pavement'),
    asphalt: M.photo('asphalt_02', { roughness: 0.95 }),
    granite: M.photo('granite_tile', { roughness: 0.7 }),
    grass: M.photo('leafy_grass', { color: 0x7fae5a }), // tint: the photo is autumn-ish
    hex: M.photo('hexagonal_concrete_paving'),
    bark: M.photo('bark_platanus'),
    roof: M.flat(0x5d5a55),
    frame: M.flat(0xe9e2d0),
    glass: M.flat(0x1d2730, { roughness: 0.15, metalness: 0.6 }),
    iron: M.flat(0x1b1d1f, { roughness: 0.6, metalness: 0.4 }),
    paint: M.flat(0xeeeeea, { roughness: 0.6 }),
    yellow: M.flat(0xe0b020, { roughness: 0.6 }),
    soil: M.flat(0x3b2f25, { roughness: 1 }),
    parkGreen: M.flat(0x2f4f3a, { roughness: 0.7, metalness: 0.2 }),
    pole: M.flat(0x3a3d40, { roughness: 0.5, metalness: 0.5 }),
    wood: M.flat(0x8a6a4a, { roughness: 0.8 }),
    citibike: M.flat(0x0a6ebd, { roughness: 0.5, metalness: 0.2 }),
    subwayGreen: M.flat(0x1f5f3a, { roughness: 0.5, metalness: 0.3 }),
    globe: M.flat(0x58c46a, { emissive: 0x2a7a3a, emissiveIntensity: 0.6 }),
  };
  const facade = (id) => M.photo(id);
  const shutterMat = (id) => M.photo(id, { roughness: 0.6, metalness: 0.2 });
  const awningMats = [0xb3201e, 0x1e6b3a, 0x1f4f8a, 0xc98a1a].map((c) => M.flat(c, { roughness: 0.85, side: THREE.DoubleSide }));
  const signMats = new Map();
  const signMat = (key, make) => {
    if (!signMats.has(key)) {
      const t = make();
      signMats.set(key, new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.5 }));
    }
    return signMats.get(key);
  };
  const glassy = (t) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.1 });
  const interiorMats = [0, 1, 2, 3, 4, 5].map((s) => glassy(interiorTexture(s + 3)));
  const bakeryInterior = glassy(interiorTexture(42, 'bakery'));

  // ---- ground, roads, markings ----
  const cx = route.reduce((s, p) => s + p[0], 0) / route.length;
  const cz = route.reduce((s, p) => s + p[1], 0) / route.length;
  const G = 700;
  B.quad(mat.ground, [
    new THREE.Vector3(cx - G / 2, 0, cz + G / 2), new THREE.Vector3(cx + G / 2, 0, cz + G / 2),
    new THREE.Vector3(cx + G / 2, 0, cz - G / 2), new THREE.Vector3(cx - G / 2, 0, cz - G / 2),
  ], [[cx - G / 2, cz + G / 2], [cx + G / 2, cz + G / 2], [cx + G / 2, cz - G / 2], [cx - G / 2, cz - G / 2]].map(([u, v]) => [u, -v]));

  const flatQuad = (m, a, b, hw, y, uvWorld = true) => {
    const d = v2(b).sub(v2(a)).normalize();
    const p = new THREE.Vector2(-d.y, d.x).multiplyScalar(hw);
    const P = [[a[0] - p.x, a[1] - p.y], [b[0] - p.x, b[1] - p.y], [b[0] + p.x, b[1] + p.y], [a[0] + p.x, a[1] + p.y]];
    let pts = P.map(([x, z]) => new THREE.Vector3(x, y, z));
    // make it face up
    const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[3], pts[0]));
    if (n.y < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const uv = uvWorld ? pts.map((q) => [q.x, -q.z]) : [[0, 0], [L, 0], [L, 2 * hw], [0, 2 * hw]];
    B.quad(m, pts, uv);
  };
  const disc = (m, [x, z], r, y) => {
    const g = new THREE.CircleGeometry(r, 16);
    g.rotateX(-Math.PI / 2); g.translate(x, y, z);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), -pos.getZ(i));
    B.add(m, g);
  };

  for (const r of roadsFlat) {
    const hw = r.w / 2;
    r.pts.forEach((p, i) => {
      if (i + 1 < r.pts.length) flatQuad(mat.asphalt, p, r.pts[i + 1], hw, 0.006);
      if (i > 0 && i + 1 < r.pts.length) disc(mat.asphalt, p, hw, 0.006);
    });
    if (!r.oneway && ['primary', 'secondary', 'tertiary'].includes(r.kind)) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const d = v2(b).sub(v2(a)).normalize(), p = new THREE.Vector2(-d.y, d.x);
        for (const off of [-0.12, 0.12]) {
          flatQuad(mat.yellow, [a[0] + p.x * off, a[1] + p.y * off], [b[0] + p.x * off, b[1] + p.y * off], 0.05, 0.011, false);
        }
      }
    }
    // Curbs along both edges, with cuts at crossings and intersections.
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], p = [-d[1], d[0]];
      for (const side of [-1, 1]) {
        for (let s = 0; s < L; s += 1) {
          const e = Math.min(L, s + 1), m = (s + e) / 2;
          const q = [a[0] + d[0] * m + p[0] * side * (hw + 0.1), a[1] + d[1] * m + p[1] * side * (hw + 0.1)];
          if (nearCrossing(q, 2.4) || inRoad(q, r, 0.3)) continue;
          B.add(mat.granite, boxGeo(e - s, 0.16, 0.22, q[0], 0.08, q[1], -Math.atan2(d[1], d[0])));
        }
      }
    }
  }

  for (const c of data.crossings) {
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i], b = c.pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      for (let s = 0.3; s < L - 0.3; s += 1.2) {
        const m = [a[0] + d[0] * s, a[1] + d[1] * s];
        if (!inRoad(m)) continue; // only paint on the carriageway
        const p = [-d[1], d[0]];
        flatQuad(mat.paint, [m[0] - p[0] * 1.6, m[1] - p[1] * 1.6], [m[0] + p[0] * 1.6, m[1] + p[1] * 1.6], 0.3, 0.012, false);
      }
    }
  }

  // ---- parks, paths, fence ----
  // Seward Park gets lawns; small mapped "parks" the route crosses (plaza
  // triangles) are paved, since the robot drives straight through them.
  const crossed = (pk) => route.some((p) => pointInPoly(p, pk.poly));
  for (const pk of data.parks) {
    const shape = new THREE.Shape(pk.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2); g.translate(0, 0.02, 0);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), -pos.getZ(i));
    B.add(pk.name !== data.route.to && crossed(pk) ? mat.hex : mat.grass, g);
  }
  const inPark = (p) => data.parks.some((pk) => pointInPoly(p, pk.poly));
  for (const pa of data.paths) {
    if (!pa.pts.some(inPark)) continue;
    pa.pts.forEach((p, i) => {
      if (i + 1 < pa.pts.length) flatQuad(mat.hex, p, pa.pts[i + 1], pa.w / 2, 0.03);
      if (i > 0 && i + 1 < pa.pts.length) disc(mat.hex, p, pa.w / 2, 0.03);
    });
  }
  const seward = data.parks.find((p) => p.name === data.route.to);
  if (seward) {
    const pickets = [];
    const gate = (q) => distToPolyline(q, route) < 2.2 || data.paths.some((pa) => distToPolyline(q, pa.pts) < pa.w / 2 + 0.6);
    const ring = [...seward.poly, seward.poly[0]];
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i], b = ring[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], yaw = -Math.atan2(d[1], d[0]);
      let runStart = null;
      for (let s = 0; s <= L; s += 0.14) {
        const q = [a[0] + d[0] * s, a[1] + d[1] * s];
        const open = gate(q);
        if (!open) pickets.push(q);
        if (!open && runStart == null) runStart = s;
        if ((open || s + 0.14 > L) && runStart != null) {
          const e = s, mid = (runStart + e) / 2;
          for (const y of [0.15, 1.05]) {
            B.add(mat.iron, boxGeo(e - runStart, 0.04, 0.03, a[0] + d[0] * mid, y, a[1] + d[1] * mid, yaw));
          }
          runStart = null;
        }
      }
    }
    const pg = new THREE.BoxGeometry(0.022, 1.15, 0.022);
    const im = new THREE.InstancedMesh(pg, mat.iron, pickets.length);
    const o = new THREE.Object3D();
    pickets.forEach(([x, z], i) => { o.position.set(x, 0.58, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = shadows;
    root.add(im);
  }

  // ---- buildings ----
  const others = data.buildings;
  const insideOther = (p, self) => others.some((b) => b !== self && pointInPoly(p, b.poly));
  const usedShops = new Set();
  const wallMats = new Map();

  for (const b of data.buildings) {
    const poly = b.poly;
    const near = Math.min(...poly.map(nearRoute));
    // One-storey shops still get a full storefront (sign included), so never lower than 4.6 m.
    const h = Math.max(4.6, b.h);
    const sf = Math.min(STOREFRONT_H, h - 0.3);
    const hb = hash(b.id);
    const facadeId = h > 30 ? 'rectangular_facade_tiles' : FACADES[hb % FACADES.length];
    const fMat = facade(facadeId);
    const levels = Math.max(1, b.levels);
    const floorH = levels > 1 ? (h - sf) / (levels - 1) : h;

    for (let i = 0; i < poly.length; i++) {
      let a = poly[i], c = poly[(i + 1) % poly.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.2) continue;
      let d = [(c[0] - a[0]) / L, (c[1] - a[1]) / L];
      let n = [d[1], -d[0]];
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      if (pointInPoly([mid[0] + n[0] * 0.3, mid[1] + n[1] * 0.3], poly)) n = [-n[0], -n[1]];
      // Orient the edge so the quad's normal, (-d.z, d.x), equals the outward normal n.
      if (d[0] * n[1] - d[1] * n[0] < 0) { [a, c] = [c, a]; d = [-d[0], -d[1]]; }
      const exterior = !insideOther([mid[0] + n[0] * 1.2, mid[1] + n[1] * 1.2], b) && L > 1;
      const at = (s, y, out = 0) => new THREE.Vector3(a[0] + d[0] * s + n[0] * out, y, a[1] + d[1] * s + n[1] * out);
      const wall = (m, s0, s1, y0, y1, out = 0, uvOff = 0) => B.quad(m,
        [at(s0, y0, out), at(s1, y0, out), at(s1, y1, out), at(s0, y1, out)],
        [[s0 + uvOff, y0], [s1 + uvOff, y0], [s1 + uvOff, y1], [s0 + uvOff, y1]]);

      wall(fMat, 0, L, sf, h);
      if (!exterior || sf === 0) { if (sf) wall(mat.granite, 0, L, 0, sf); continue; }
      const detailed = near < DETAIL_RADIUS;

      // Ground-floor storefronts.
      const sfEdge = data.shopFront && [a, c].every((q) => [data.shopFront.a, data.shopFront.b]
        .some((r) => Math.hypot(q[0] - r[0], q[1] - r[1]) < 0.01));
      if (detailed) {
        const units = sfEdge ? 1 : Math.max(1, Math.round(L / 6));
        const uw = L / units;
        wall(mat.granite, 0, L, SIGN[1], sf);           // band above the signs
        for (let j = 0; j < units; j++) {
          const s0 = j * uw, s1 = (j + 1) * uw, hu = hash(hb + j * 7919);
          wall(mat.granite, s0, s0 + 0.35, 0, SIGN[1]);  // pillars
          wall(mat.granite, s1 - 0.35, s1, 0, SIGN[1]);
          const shut = !sfEdge && hu % 4 === 0;
          if (shut) {
            const sid = SHUTTERS[hu % SHUTTERS.length];
            if (!wallMats.has(sid)) wallMats.set(sid, shutterMat(sid));
            wall(wallMats.get(sid), s0 + 0.35, s1 - 0.35, 0, SIGN[0], 0.03);
          } else {
            wall(mat.granite, s0 + 0.35, s1 - 0.35, 0, 0.3);
            // Interior picture: UVs 0..1 across the window (not metres; it is not a tiling texture).
            B.quad(sfEdge ? bakeryInterior : interiorMats[hu % interiorMats.length],
              [at(s0 + 0.35, 0.3, 0.02), at(s1 - 0.35, 0.3, 0.02), at(s1 - 0.35, SIGN[0] - 0.15, 0.02), at(s0 + 0.35, SIGN[0] - 0.15, 0.02)],
              [[0, 0], [1, 0], [1, 1], [0, 1]]);
            wall(mat.frame, s0 + 0.35, s1 - 0.35, SIGN[0] - 0.15, SIGN[0]);
            if (hu % 3 === 0) { // awning
              const am = awningMats[hu % awningMats.length];
              B.quad(am, [at(s0 + 0.3, SIGN[0] - 0.1, 0.05), at(s1 - 0.3, SIGN[0] - 0.1, 0.05), at(s1 - 0.3, SIGN[0] - 0.55, 1.1), at(s0 + 0.3, SIGN[0] - 0.55, 1.1)],
                [[0, 0], [1, 0], [1, 1], [0, 1]]);
            }
          }
          // Sign: a real OSM shop name if one is mapped right here, otherwise a generic category sign.
          const cu = [mid[0] + d[0] * ((s0 + s1) / 2 - L / 2) + n[0] * 3, mid[1] + d[1] * ((s0 + s1) / 2 - L / 2) + n[1] * 3];
          const shop = sfEdge
            ? data.shops.find((sh) => sh.name === data.shopFront.name)
            : data.shops.find((sh) => !usedShops.has(sh) && sh.name !== data.shopFront?.name && Math.hypot(sh.p[0] - cu[0], sh.p[1] - cu[1]) < 6.5);
          let sm;
          if (shop) { usedShops.add(shop); sm = signMat(`n:${shop.name}`, () => signTexture(GENERIC_SIGNS[hu % GENERIC_SIGNS.length], shop.name)); }
          else { const gs = GENERIC_SIGNS[hu % GENERIC_SIGNS.length]; sm = signMat(`g:${gs[1]}`, () => signTexture(gs)); }
          B.quad(sm, [at(s0 + 0.2, SIGN[0], 0.16), at(s1 - 0.2, SIGN[0], 0.16), at(s1 - 0.2, SIGN[1], 0.16), at(s0 + 0.2, SIGN[1], 0.16)],
            [[0, 0], [1, 0], [1, 1], [0, 1]]);
          wall(mat.iron, s0 + 0.2, s1 - 0.2, SIGN[0] - 0.04, SIGN[0], 0.16); // sign edge
        }
      } else {
        wall(mat.granite, 0, L, 0, sf);
      }

      // Windows on upper floors.
      if (near < DETAIL_RADIUS * 1.6 && levels > 1) {
        const count = Math.floor((L - 0.8) / 2.6);
        if (count >= 1) {
          const sp = L / count;
          for (let k = 1; k < levels; k++) {
            const yb = sf + (k - 1) * floorH, yc = yb + floorH * 0.55;
            for (let w = 0; w < count; w++) {
              const sc = sp * (w + 0.5);
              B.quad(mat.frame, [at(sc - 0.62, yc - 0.85, 0.03), at(sc + 0.62, yc - 0.85, 0.03), at(sc + 0.62, yc + 0.85, 0.03), at(sc - 0.62, yc + 0.85, 0.03)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
              B.quad(mat.glass, [at(sc - 0.52, yc - 0.75, 0.05), at(sc + 0.52, yc - 0.75, 0.05), at(sc + 0.52, yc + 0.75, 0.05), at(sc - 0.52, yc + 0.75, 0.05)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
              B.quad(mat.frame, [at(sc - 0.03, yc - 0.75, 0.06), at(sc + 0.03, yc - 0.75, 0.06), at(sc + 0.03, yc + 0.75, 0.06), at(sc - 0.03, yc + 0.75, 0.06)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
            }
          }
          // Fire escape on some tenement fronts.
          if (detailed && levels >= 4 && levels <= 7 && L > 7 && hb % 3 === 0) {
            const sc = L / 2, yaw = -Math.atan2(d[1], d[0]);
            const P = (s, out) => [a[0] + d[0] * s + n[0] * out, a[1] + d[1] * s + n[1] * out];
            for (let k = 1; k < levels; k++) {
              const y = sf + (k - 1) * floorH + 0.05;
              const [px, pz] = P(sc, 0.5);
              B.add(mat.iron, boxGeo(3.4, 0.05, 0.9, px, y, pz, yaw));            // platform
              const [rx, rz] = P(sc, 0.93);
              B.add(mat.iron, boxGeo(3.4, 0.04, 0.04, rx, y + 0.95, rz, yaw));    // top rail
              B.add(mat.iron, boxGeo(3.4, 0.03, 0.03, rx, y + 0.5, rz, yaw));     // mid rail
              for (const e of [-1.68, 1.68, 0]) {
                const [qx, qz] = P(sc + e, 0.93);
                B.add(mat.iron, boxGeo(0.04, 0.95, 0.04, qx, y + 0.47, qz, yaw)); // posts
              }
              if (k + 1 < levels) { // ladder to the next platform
                const [lx, lz] = P(sc + 0.8, 0.5);
                const lg = new THREE.BoxGeometry(0.5, Math.hypot(floorH, 1.6), 0.05);
                lg.rotateZ(Math.atan2(1.6, floorH)); lg.rotateY(yaw); lg.translate(lx, y + floorH / 2, lz);
                B.add(mat.iron, lg);
              }
            }
          }
        }
      }
    }
    // Roof.
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const rg = new THREE.ShapeGeometry(shape);
    rg.rotateX(-Math.PI / 2); rg.translate(0, h, 0);
    B.add(mat.roof, rg);
  }

  // ---- street furniture ----
  const o = new THREE.Object3D();
  const instanced = (geo, m, items, place) => {
    if (!items.length) return null;
    const im = new THREE.InstancedMesh(geo, m, items.length);
    items.forEach((it, i) => {
      o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
      place(o, it); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.castShadow = shadows; im.receiveShadow = true;
    root.add(im);
    return im;
  };

  // Trees: trunk + canopy blobs; street trees get a pit with a low guard.
  const foliage = new THREE.MeshStandardMaterial({ map: foliageTexture(), roughness: 0.95, flatShading: true });
  const r = rng(11);
  const trees = data.trees.map((p) => ({ p, s: 0.85 + r() * 0.4, rot: r() * 6.28 }));
  instanced(new THREE.CylinderGeometry(0.14, 0.2, 4.2, 9).translate(0, 2.1, 0), mat.bark, trees, (ob, t) => {
    ob.position.set(t.p[0], 0, t.p[1]); ob.scale.set(t.s, t.s, t.s); ob.rotation.set(0, t.rot, 0);
  });
  const blobs = trees.flatMap((t) => [0, 1, 2, 3].map((k) => ({
    p: [t.p[0] + Math.cos(t.rot + k * 1.9) * (k ? 1.4 : 0) * t.s, t.p[1] + Math.sin(t.rot + k * 1.9) * (k ? 1.4 : 0) * t.s],
    y: (5.2 + (k ? r() * 1.8 : 1.4)) * t.s, s: (k ? 1.9 : 2.5) * t.s * (0.85 + r() * 0.3),
  })));
  instanced(new THREE.IcosahedronGeometry(1, 1), foliage, blobs, (ob, b) => {
    ob.position.set(b.p[0], b.y, b.p[1]); ob.scale.set(b.s, b.s * 0.8, b.s); ob.rotation.set(0, 0, 0);
  });
  const streetTrees = trees.filter((t) => !inPark(t.p));
  instanced(new THREE.BoxGeometry(1.4, 0.02, 1.4), mat.soil, streetTrees, (ob, t) => { ob.position.set(t.p[0], 0.012, t.p[1]); ob.scale.set(1, 1, 1); ob.rotation.set(0, 0, 0); });
  const guard = mergeGeometries([[0, 0.7], [0, -0.7], [0.7, 0], [-0.7, 0]].map(([x, z], i) =>
    boxGeo(i < 2 ? 1.42 : 0.03, 0.45, i < 2 ? 0.03 : 1.42, x, 0.225, z)));
  instanced(guard, mat.iron, streetTrees, (ob, t) => { ob.position.set(t.p[0], 0, t.p[1]); });

  // Benches: face the nearest park path / sidewalk.
  const allPaths = [...data.paths, ...data.sidewalks].map((x) => x.pts);
  const facing = (p) => {
    let best = null, bd = Infinity;
    for (const pts of allPaths) for (let i = 0; i + 1 < pts.length; i++) {
      const dd = distToSeg(p, pts[i], pts[i + 1]);
      if (dd < bd) { bd = dd; best = [pts[i], pts[i + 1]]; }
    }
    return best ? -Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) : 0;
  };
  const benchWood = mergeGeometries([
    boxGeo(1.8, 0.04, 0.1, 0, 0.45, -0.15), boxGeo(1.8, 0.04, 0.1, 0, 0.45, 0), boxGeo(1.8, 0.04, 0.1, 0, 0.45, 0.15),
    boxGeo(1.8, 0.1, 0.04, 0, 0.7, 0.22), boxGeo(1.8, 0.1, 0.04, 0, 0.86, 0.24),
  ]);
  const benchIron = mergeGeometries([boxGeo(0.06, 0.45, 0.45, -0.8, 0.22, 0), boxGeo(0.06, 0.45, 0.45, 0.8, 0.22, 0),
    boxGeo(0.05, 0.5, 0.05, -0.8, 0.7, 0.24), boxGeo(0.05, 0.5, 0.05, 0.8, 0.7, 0.24)]);
  const benches = data.benches.map((p) => ({ p, yaw: facing(p) }));
  for (const [g, m] of [[benchWood, mat.wood], [benchIron, mat.iron]]) {
    instanced(g, m, benches, (ob, bn) => { ob.position.set(bn.p[0], 0, bn.p[1]); ob.rotation.set(0, bn.yaw, 0); });
  }
  instanced(new THREE.CylinderGeometry(0.3, 0.25, 0.85, 12).translate(0, 0.43, 0), mat.parkGreen, data.bins, (ob, p) => { ob.position.set(p[0], 0, p[1]); ob.rotation.set(0, 0, 0); });

  // Lamp posts and hydrants along the curbs near the route.
  const lamps = [], hydrants = [];
  for (const rd of roadsFlat) {
    if (Math.min(...rd.pts.map(nearRoute)) > 120) continue;
    let acc = 0;
    for (let i = 0; i + 1 < rd.pts.length; i++) {
      const a = rd.pts[i], b = rd.pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], p = [-d[1], d[0]];
      for (let s = 0; s < L; s += 1, acc += 1) {
        for (const side of [-1, 1]) {
          const q = [a[0] + d[0] * s + p[0] * side * (rd.w / 2 + 0.6), a[1] + d[1] * s + p[1] * side * (rd.w / 2 + 0.6)];
          if (nearCrossing(q, 3) || inRoad(q, null, 0.2) || insideOther(q, null)) continue;
          if (acc % 28 === 0) lamps.push({ q, yaw: -Math.atan2(d[1], d[0]) + (side > 0 ? Math.PI / 2 : -Math.PI / 2) });
          if (acc % 47 === 23 && nearRoute(q) < 90) hydrants.push({ q });
        }
      }
    }
  }
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.11, 7.5, 8).translate(0, 3.75, 0),
    boxGeo(0.08, 0.08, 1.7, 0, 7.4, 0.85), boxGeo(0.35, 0.16, 0.6, 0, 7.3, 1.6),
  ]);
  instanced(lampGeo, mat.pole, lamps, (ob, l) => { ob.position.set(l.q[0], 0, l.q[1]); ob.rotation.set(0, l.yaw, 0); });
  const hydrantGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.13, 0.15, 0.62, 10).translate(0, 0.31, 0),
    new THREE.SphereGeometry(0.13, 10, 6, 0, 6.3, 0, 1.6).translate(0, 0.62, 0),
    new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8).rotateZ(Math.PI / 2).translate(0, 0.42, 0),
    new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10).translate(0, 0.05, 0),
  ]);
  instanced(hydrantGeo, M.flat(0xb7b9bb, { roughness: 0.4, metalness: 0.6 }), hydrants, (ob, h) => { ob.position.set(h.q[0], 0, h.q[1]); });

  // Subway entrances (East Broadway F station): green railings and globes.
  for (const p of data.subway) {
    const yaw = facing(p);
    const g = [boxGeo(4.4, 0.05, 0.05, 0, 1.0, -0.9), boxGeo(4.4, 0.05, 0.05, 0, 1.0, 0.9), boxGeo(0.05, 0.05, 1.8, 2.2, 1.0, 0)];
    for (const [x, z] of [[-2.2, -0.9], [-2.2, 0.9], [2.2, -0.9], [2.2, 0.9], [0, -0.9], [0, 0.9]]) g.push(boxGeo(0.05, 1.0, 0.05, x, 0.5, z));
    const rail = mergeGeometries(g); rail.rotateY(yaw); rail.translate(p[0], 0, p[1]);
    B.add(mat.subwayGreen, rail);
    const hole = new THREE.PlaneGeometry(4.3, 1.75).rotateX(-Math.PI / 2).rotateY(yaw).translate(p[0], 0.015, p[1]);
    B.add(M.flat(0x15171a), hole);
    for (const z of [-0.9, 0.9]) {
      const gl = new THREE.SphereGeometry(0.16, 12, 8).translate(-2.2, 1.35, z).rotateY(yaw).translate(p[0], 0, p[1]);
      B.add(mat.globe, gl);
    }
  }

  // Citi Bike station.
  const bike = mergeGeometries([
    new THREE.TorusGeometry(0.33, 0.035, 6, 16).translate(-0.52, 0.36, 0),
    new THREE.TorusGeometry(0.33, 0.035, 6, 16).translate(0.52, 0.36, 0),
    boxGeo(1.0, 0.07, 0.07, 0, 0.62, 0), boxGeo(0.07, 0.45, 0.07, -0.1, 0.62, 0),
    boxGeo(0.55, 0.06, 0.06, 0.45, 1.0, 0), boxGeo(0.2, 0.2, 0.3, 0.6, 0.85, 0),
  ]);
  const bikes = [];
  for (const p of data.bikes) {
    const yaw = facing(p);
    for (let k = -4; k <= 4; k++) bikes.push({ p: [p[0] + Math.cos(-yaw) * k * 0.75, p[1] + Math.sin(-yaw) * k * 0.75], yaw: yaw + Math.PI / 2 });
    B.add(mat.citibike, boxGeo(0.5, 1.8, 0.3, p[0] + Math.cos(-yaw) * 3.6, 0.9, p[1] + Math.sin(-yaw) * 3.6, yaw));
  }
  instanced(bike, mat.citibike, bikes, (ob, bk) => { ob.position.set(bk.p[0], 0, bk.p[1]); ob.rotation.set(0, bk.yaw, 0); });

  // ---- parked cars (curb lanes near the route) ----
  const carBody = mergeGeometries([boxGeo(4.4, 0.7, 1.8, 0, 0.62, 0), boxGeo(2.3, 0.62, 1.62, -0.2, 1.28, 0)]);
  const wheels = mergeGeometries([[-1.4, -0.82], [1.4, -0.82], [-1.4, 0.82], [1.4, 0.82]].map(([x, z]) =>
    new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12).rotateX(Math.PI / 2).translate(x, 0.33, z)));
  const cars = [];
  const truckSpot = data.truck;
  for (const rd of roadsFlat) {
    if (rd.w < 9 || Math.min(...rd.pts.map(nearRoute)) > 70) continue;
    for (let i = 0; i + 1 < rd.pts.length; i++) {
      const a = rd.pts[i], b = rd.pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], p = [-d[1], d[0]];
      for (let s = 4; s < L - 4; s += 6.3) {
        for (const side of [-1, 1]) {
          const q = [a[0] + d[0] * s + p[0] * side * (rd.w / 2 - 1.15), a[1] + d[1] * s + p[1] * side * (rd.w / 2 - 1.15)];
          if (nearCrossing(q, 6) || inRoad(q, rd, 1.5) || nearRoute(q) > 70) continue;
          if (truckSpot && Math.hypot(q[0] - truckSpot.p[0], q[1] - truckSpot.p[1]) < 9) continue;
          if (hash(Math.round(q[0] * 7 + q[1] * 13)) % 5 === 0) continue; // some gaps
          cars.push({ q, yaw: -Math.atan2(d[1], d[0]) });
        }
      }
    }
  }
  const carColors = [0x9aa3ab, 0x1f2a36, 0xe8e8e8, 0x7a1d1d, 0x2d4a6b, 0x111111, 0xc9c2b4, 0x55606b];
  const body = instanced(carBody, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), cars, (ob, c) => {
    ob.position.set(c.q[0], 0, c.q[1]); ob.rotation.set(0, c.yaw, 0);
  });
  if (body) cars.forEach((c, i) => body.setColorAt(i, new THREE.Color(carColors[hash(i + 5) % carColors.length])));
  instanced(wheels, M.flat(0x151515, { roughness: 0.9 }), cars, (ob, c) => { ob.position.set(c.q[0], 0, c.q[1]); ob.rotation.set(0, c.yaw, 0); });
  const windows = mergeGeometries([boxGeo(2.32, 0.5, 1.64, -0.2, 1.3, 0)]);
  instanced(windows, M.flat(0x1a2229, { roughness: 0.1, metalness: 0.7 }), cars, (ob, c) => { ob.position.set(c.q[0], 0, c.q[1]); ob.rotation.set(0, c.yaw, 0); });

  // ---- the white box truck (chapter 2) ----
  if (truckSpot) root.add(buildTruck(truckSpot, M));

  // ---- the dock (chapter 6) ----
  if (data.dockPose) root.add(buildDock(data.dockPose, M));

  B.build(root, { shadows });
  return root;
}

/** Box truck: plain white cargo box (flat), roll-up rear door (ribs), cab, wheels. */
function buildTruck({ p, yaw }, M) {
  const g = new THREE.Group();
  const panel = new THREE.MeshStandardMaterial({ map: panelTexture(3), roughness: 0.55 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.6, 2.45), panel);
  box.position.set(-0.6, 2.35, 0);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(6.62, 0.08, 2.48), M.flat(0x9a9a96, { metalness: 0.6, roughness: 0.4 }));
  rail.position.set(-0.6, 1.45, 0);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(6.65, 0.14, 2.5), M.flat(0x6f706f, { metalness: 0.6, roughness: 0.4 }));
  sill.position.set(-0.6, 1.02, 0);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.3), M.photo('corrugated_iron', { roughness: 0.5, metalness: 0.4 }));
  door.position.set(-3.91, 2.3, 0); door.rotation.y = -Math.PI / 2;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.1, 2.3), M.flat(0xf2f2ee, { roughness: 0.4 }));
  cab.position.set(3.75, 1.55, 0);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 2.0), M.flat(0x1a2229, { roughness: 0.1, metalness: 0.7 }));
  wind.position.set(4.76, 2.05, 0);
  const lights = [];
  for (const z of [-1.05, 1.05]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.18), M.flat(0xb01818, { emissive: 0x500000 }));
    l.position.set(-3.93, 1.25, z); lights.push(l);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.3), M.flat(0xf0d060));
  plate.position.set(-3.93, 1.05, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 16).rotateX(Math.PI / 2);
  const wheelMat = M.flat(0x151515, { roughness: 0.9 });
  const ws = [[-2.6, -1.0], [-2.6, 1.0], [-1.7, -1.0], [-1.7, 1.0], [3.6, -1.0], [3.6, 1.0]].map(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, 0.48, z); return w;
  });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.3, 1.0), M.flat(0x222222));
  chassis.position.set(0, 0.85, 0);
  g.add(box, rail, sill, door, cab, wind, plate, chassis, ...lights, ...ws);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.position.set(p[0], 0, p[1]);
  g.rotation.y = yaw;
  return g;
}

/** Charging dock: pad on the ground + a post with the checkerboard target. */
function buildDock({ p, yaw }, M) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 1.1), M.flat(0x0e7490, { roughness: 0.5 }));
  pad.position.set(0, 0.02, 0);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), M.flat(0x2a2d30, { metalness: 0.5 }));
  post.position.set(0, 0.6, -0.65);
  const t = dockTexture();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0),
    new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.6 }));
  board.position.set(0, 0.85, -0.58);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.flat(0x22c55e, { emissive: 0x22c55e, emissiveIntensity: 1 }));
  lamp.position.set(0, 1.25, -0.65);
  g.add(pad, post, board, lamp);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.position.set(p[0], 0, p[1]);
  g.rotation.y = yaw;
  return g;
}

export { pointInPoly, distToPolyline };
