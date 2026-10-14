// Pure image math used by widgets. No DOM access here so it can be unit-tested
// in Node (see tools/check_math.mjs).

/** RGBA ImageData-like {data,width,height} -> Float32Array luminance in [0,1]. */
export function toGray({ data, width, height }) {
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    // Rec. 601 luma weights.
    g[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  }
  return g;
}

/** Central-difference gradients. Border pixels use one-sided differences. */
export function gradients(gray, width, height) {
  const Ix = new Float32Array(width * height);
  const Iy = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const xl = x > 0 ? i - 1 : i;
      const xr = x < width - 1 ? i + 1 : i;
      const yu = y > 0 ? i - width : i;
      const yd = y < height - 1 ? i + width : i;
      Ix[i] = (gray[xr] - gray[xl]) / (xr - xl || 1);
      Iy[i] = (gray[yd] - gray[yu]) / ((yd - yu) / width || 1);
    }
  }
  return { Ix, Iy };
}

/**
 * Structure tensor (a.k.a. second-moment matrix, the LK "Hessian" for pure
 * translation) over a square window centred at (cx, cy):
 *
 *   H = sum_w w(x) [ Ix^2   IxIy ]
 *                  [ IxIy   Iy^2 ]
 *
 * `half` is the window half-width (window side = 2*half+1).
 * `sigma` > 0 uses Gaussian weights, otherwise uniform weights of 1.
 * Returns { a, b, c, wsum, samples } where H = [[a, b], [b, c]], wsum is the
 * total weight, and samples holds the per-pixel gradients (for plotting).
 */
export function structureTensor(Ix, Iy, width, height, cx, cy, half, sigma = 0) {
  let a = 0, b = 0, c = 0, wsum = 0;
  const samples = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = y * width + x;
      const w = sigma > 0 ? Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) : 1;
      const gx = Ix[i], gy = Iy[i];
      a += w * gx * gx;
      b += w * gx * gy;
      c += w * gy * gy;
      wsum += w;
      samples.push([gx, gy]);
    }
  }
  return { a, b, c, wsum, samples };
}

/**
 * Eigen-decomposition of the symmetric 2x2 matrix [[a, b], [b, c]].
 * Returns l1 >= l2 and the unit eigenvector v1 for l1 (v2 is v1 rotated 90deg).
 */
export function eig2(a, b, c) {
  const mean = (a + c) / 2;
  const r = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const l1 = mean + r, l2 = mean - r;
  // Eigenvector for l1: (b, l1 - a), or (l1 - c, b); pick the better-conditioned one.
  let vx, vy;
  if (Math.abs(b) > 1e-12) {
    vx = b; vy = l1 - a;
  } else {
    [vx, vy] = a >= c ? [1, 0] : [0, 1];
  }
  const n = Math.hypot(vx, vy) || 1;
  return { l1, l2, v1: [vx / n, vy / n] };
}

/** Harris response R = det(H) - k * trace(H)^2 = l1*l2 - k*(l1+l2)^2. */
export const harris = (a, b, c, k = 0.05) => a * c - b * b - k * (a + c) ** 2;

/** Shi-Tomasi score = min eigenvalue of H. */
export const shiTomasi = (a, b, c) => eig2(a, b, c).l2;

/** Classify by eigenvalues against a single threshold tau. */
export function classify(l1, l2, tau) {
  if (l2 >= tau) return 'corner';
  if (l1 >= tau) return 'edge';
  return 'flat';
}

/**
 * Scan a grayscale frame on a coarse grid and return the best example point
 * for each class (used for the flat / edge / corner presets).
 */
export function findExamples(gray, width, height, half, tau, step = 6, region = null) {
  const { Ix, Iy } = gradients(gray, width, height);
  const best = { flat: null, edge: null, corner: null };
  const m = half + 2;
  const [rx0, ry0, rx1, ry1] = region ?? [0, 0, width, height];
  for (let y = Math.max(m, ry0 | 0); y < Math.min(height - m, ry1); y += step) {
    for (let x = Math.max(m, rx0 | 0); x < Math.min(width - m, rx1); x += step) {
      const { a, b, c } = structureTensor(Ix, Iy, width, height, x, y, half);
      const { l1, l2 } = eig2(a, b, c);
      const cls = classify(l1, l2, tau);
      // Score: flat -> smallest l1; edge -> largest l1 with smallest l2; corner -> largest l2.
      const score = cls === 'flat' ? -l1 : cls === 'edge' ? l1 - 10 * l2 : l2;
      if (best[cls] && score <= best[cls].score) continue;
      // A good edge example has no corner nearby: a window twice as wide must also be an edge.
      if (cls === 'edge' && x > 2 * half + 2 && y > 2 * half + 2 && x < width - 2 * half - 2 && y < height - 2 * half - 2) {
        const big = structureTensor(Ix, Iy, width, height, x, y, 2 * half);
        const e = eig2(big.a, big.b, big.c);
        if (classify(e.l1, e.l2, tau * 4) !== 'edge') continue;
      } else if (cls === 'edge') continue;
      best[cls] = { x, y, score };
    }
  }
  return best;
}

/** Bilinear sample of a grayscale image at a non-integer (x, y), clamped to the border. */
export function bilinear(gray, width, height, x, y) {
  const cx = Math.min(width - 1.001, Math.max(0, x));
  const cy = Math.min(height - 1.001, Math.max(0, y));
  const x0 = Math.floor(cx), y0 = Math.floor(cy);
  const a = cx - x0, b = cy - y0;
  const i = y0 * width + x0;
  return (1 - a) * (1 - b) * gray[i] + a * (1 - b) * gray[i + 1]
    + (1 - a) * b * gray[i + width] + a * b * gray[i + width + 1];
}

/**
 * Translation-only Lucas-Kanade (forward additive, Gauss-Newton) for one feature.
 *
 *   T: template frame (gray), I: next frame (gray), both width x height.
 *   (x, y): feature position in T. Window side = 2*half+1.
 *   Minimises E(p) = sum_w [I(x + p) - T(x)]^2 by iterating
 *     H dp = b,  H = sum grad I grad I^T,  b = sum grad I (T - I(x + p)),  p <- p + dp
 *   with grad I evaluated (bilinearly) at x + p.
 *
 * Returns { p: [px, py], iterates: [[px, py, E], ...], converged, lambdaMin }.
 */
// minEig: like OpenCV's minEigThreshold, stop when the smallest eigenvalue of H
// per window pixel falls below it (flat or noise-only window: the update would
// be a wild jump, not a measurement).
export function lkTranslation(T, I, width, height, x, y, half, { maxIter = 20, eps = 0.01, init = [0, 0], minEig = 1e-4 } = {}) {
  let px = init[0], py = init[1];
  const iterates = [];
  let converged = false, lambdaMin = 0;
  for (let k = 0; k < maxIter; k++) {
    let a = 0, b = 0, c = 0, bx = 0, by = 0, E = 0;
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const t = T[Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))];
        const sx = x + dx + px, sy = y + dy + py;
        const iv = bilinear(I, width, height, sx, sy);
        const gx = (bilinear(I, width, height, sx + 1, sy) - bilinear(I, width, height, sx - 1, sy)) / 2;
        const gy = (bilinear(I, width, height, sx, sy + 1) - bilinear(I, width, height, sx, sy - 1)) / 2;
        const r = t - iv;
        a += gx * gx; b += gx * gy; c += gy * gy;
        bx += gx * r; by += gy * r;
        E += r * r;
      }
    }
    iterates.push([px, py, E]);
    const det = a * c - b * b;
    lambdaMin = eig2(a, b, c).l2;
    if (Math.abs(det) < 1e-12) break; // H singular: flat patch or pure edge
    if (lambdaMin / ((2 * half + 1) ** 2) < minEig) break; // too little texture to trust a step
    const dpx = (c * bx - b * by) / det;
    const dpy = (a * by - b * bx) / det;
    px += dpx; py += dpy;
    if (Math.hypot(dpx, dpy) < eps) { converged = true; iterates.push([px, py, null]); break; }
  }
  return { p: [px, py], iterates, converged, lambdaMin };
}

/**
 * Shi–Tomasi score λ_min of every pixel's (2·half+1)² window (uniform weights),
 * via integral images of Ix², IxIy, Iy², so the cost is O(width·height).
 */
export function minEigenMap(Ix, Iy, width, height, half) {
  const W = width + 1;
  const sa = new Float64Array(W * (height + 1)), sb = new Float64Array(sa.length), sc = new Float64Array(sa.length);
  for (let y = 0; y < height; y++) {
    let ra = 0, rb = 0, rc = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x, gx = Ix[i], gy = Iy[i];
      ra += gx * gx; rb += gx * gy; rc += gy * gy;
      const j = (y + 1) * W + x + 1;
      sa[j] = sa[j - W] + ra; sb[j] = sb[j - W] + rb; sc[j] = sc[j - W] + rc;
    }
  }
  const out = new Float32Array(width * height);
  const box = (s, x0, y0, x1, y1) => s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(width, x + half + 1);
      const a = box(sa, x0, y0, x1, y1), b = box(sb, x0, y0, x1, y1), c = box(sc, x0, y0, x1, y1);
      out[y * width + x] = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
    }
  }
  return out;
}

/** One pyramid level: 2×2 box average (a cheap low-pass) then subsample by 2. */
export function downsample2(gray, width, height) {
  const w = width >> 1, h = height >> 1, out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * width + 2 * x;
      out[y * w + x] = (gray[i] + gray[i + 1] + gray[i + width] + gray[i + width + 1]) / 4;
    }
  }
  return { gray: out, w, h };
}

/** (2·half+1)² samples of `gray` centred on (cx, cy), bilinear, row-major. */
export function samplePatch(gray, width, height, cx, cy, half, step = 1) {
  const n = 2 * half + 1, out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) out[j * n + i] = bilinear(gray, width, height, cx + (i - half) * step, cy + (j - half) * step);
  }
  return out;
}

/**
 * Pyramidal (coarse-to-fine) Lucas–Kanade translation, after Bouguet (2000).
 * pyr0 / pyr1: arrays of { gray, w, h } (level 0 = full resolution).
 * Solves at the top level from a zero guess, then doubles the estimate as the
 * starting guess for each finer level. Returns the full-resolution shift
 * (relative to the rounded start point) and a per-level log.
 */
export function lkPyramid(pyr0, pyr1, x, y, half, levels, opts = {}) {
  let g = [0, 0];
  const log = [];
  for (let l = levels - 1; l >= 0; l--) {
    const s = 2 ** l, L0 = pyr0[l], L1 = pyr1[l];
    const cx = Math.round(x / s), cy = Math.round(y / s);
    const r = lkTranslation(L0.gray, L1.gray, L0.w, L0.h, cx, cy, half, { maxIter: 30, eps: 0.02, ...opts, init: g });
    log.push({ level: l, guess: g, p: r.p, steps: r.iterates.length - 1, converged: r.converged });
    g = l ? [2 * r.p[0], 2 * r.p[1]] : r.p;
  }
  return { p: g, log };
}

/** Gaussian-free image pyramid by repeated 2×2 averaging (see downsample2). */
export function buildPyramid(gray, width, height, levels) {
  const pyr = [{ gray, w: width, h: height }];
  for (let l = 1; l < levels; l++) pyr.push(downsample2(pyr[l - 1].gray, pyr[l - 1].w, pyr[l - 1].h));
  return pyr;
}
