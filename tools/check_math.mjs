// Sanity checks for js/lib/imageOps.js and the worked examples quoted in
// chapters.js. Run from klt-tracker/:  node tools/check_math.mjs
import assert from 'node:assert/strict';
import {
  gradients, structureTensor, eig2, harris, classify, lkTranslation,
} from '../js/lib/imageOps.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// --- eig2 against a hand-computed matrix: [[2,1],[1,2]] -> 3, 1 ---------------
{
  const { l1, l2, v1 } = eig2(2, 1, 2);
  close(l1, 3); close(l2, 1);
  close(Math.abs(v1[0]), Math.SQRT1_2); close(Math.abs(v1[1]), Math.SQRT1_2);
  // Harris: det - k tr^2 = 3 - 0.05*16 = 2.2
  close(harris(2, 1, 2, 0.05), 2.2);
}

// --- flat / edge / corner on synthetic 21x21 images ---------------------------
function img(fn, n = 21) {
  const g = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g[y * n + x] = fn(x, y);
  return g;
}
function tensorAtCentre(g, n = 21, half = 5) {
  const { Ix, Iy } = gradients(g, n, n);
  const H = structureTensor(Ix, Iy, n, n, 10, 10, half);
  return { ...H, ...eig2(H.a, H.b, H.c) };
}
const tau = 0.05;
{
  const flat = tensorAtCentre(img(() => 0.5));
  assert.equal(classify(flat.l1, flat.l2, tau), 'flat');

  const edge = tensorAtCentre(img((x) => (x >= 10 ? 1 : 0)));
  assert.equal(classify(edge.l1, edge.l2, tau), 'edge');
  close(edge.l2, 0);
  // Gradient is horizontal, so the dominant eigenvector is (+-1, 0).
  close(Math.abs(edge.v1[0]), 1);

  const corner = tensorAtCentre(img((x, y) => (x >= 10 && y >= 10 ? 1 : 0)));
  assert.equal(classify(corner.l1, corner.l2, tau), 'corner');
  assert.ok(harris(corner.a, corner.b, corner.c) > 0, 'corner: Harris R > 0');
  assert.ok(harris(edge.a, edge.b, edge.c) < 0, 'edge: Harris R < 0');
}

// --- Chapter 1 worked example: 1D blob moves +1 -------------------------------
// f1 = 0 0 0 9 0 0 0, f2 = 0 0 0 0 9 0 0.
// Ix by central differences on f1, It = f2 - f1, u = -sum(Ix It) / sum(Ix^2).
{
  const f1 = [0, 0, 0, 9, 0, 0, 0];
  const f2 = [0, 0, 0, 0, 9, 0, 0];
  let sxt = 0, sxx = 0;
  const pointwise = [];
  for (let i = 1; i < f1.length - 1; i++) {
    const Ix = (f1[i + 1] - f1[i - 1]) / 2;
    const It = f2[i] - f1[i];
    sxt += Ix * It; sxx += Ix * Ix;
    pointwise.push(Ix ? -It / Ix + 0 : null); // +0 normalises -0
  }
  close(-sxt / sxx, 1); // least squares over the window recovers +1 exactly
  // ...while single pixels disagree: i=2 says 0, i=3 undefined, i=4 says 2.
  assert.deepEqual(pointwise.slice(1, 4), [0, null, 2]);
}

// --- Chapter 3: one Gauss-Newton step on a smooth 1D signal ------------------
// T(x) = sin(x/3); I(x) = T(x - 0.8). Iterating Hd = b should converge to 0.8.
{
  const T = (x) => Math.sin(x / 3);
  const I = (x) => T(x - 0.8);
  const dI = (x) => Math.cos((x - 0.8) / 3) / 3;
  let p = 0;
  for (let it = 0; it < 6; it++) {
    let H = 0, b = 0;
    for (let x = -10; x <= 10; x++) {
      const g = dI(x + p);
      H += g * g;
      b += g * (T(x) - I(x + p));
    }
    p += b / H;
  }
  close(p, 0.8, 1e-6);
}

// --- lkTranslation recovers a known sub-pixel shift of a smooth 2D blob -------
{
  const W = 64, Hh = 64;
  const blob = (x, y) => Math.exp(-((x - 30) ** 2 + (y - 32) ** 2) / 60)
    + 0.5 * Math.exp(-((x - 36) ** 2 + (y - 26) ** 2) / 30);
  const T = new Float32Array(W * Hh), I = new Float32Array(W * Hh);
  const sx = 2.3, sy = -1.6; // true motion
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    T[y * W + x] = blob(x, y);
    I[y * W + x] = blob(x - sx, y - sy);
  }
  const r = lkTranslation(T, I, W, Hh, 32, 30, 9, { maxIter: 30, eps: 1e-4 });
  assert.ok(r.converged, 'LK converged');
  close(r.p[0], sx, 0.05); close(r.p[1], sy, 0.05);
  // Error decreases from the first to the last evaluated iterate.
  const Es = r.iterates.map((it) => it[2]).filter((e) => e != null);
  assert.ok(Es[Es.length - 1] < Es[0], 'SSD decreases');
}

console.log('check_math: all assertions passed');
