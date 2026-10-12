#!/usr/bin/env python3
"""Cut a 4x3 expression sheet (transparent PNG) into 12 aligned frames.

Every frame is placed on the same canvas size, then registered to frame 01
(SIFT + RANSAC on the rigid parts of the figure; scale + translation only) so swapping frames
for talking / stop-motion doesn't make the character bob. All frames are then trimmed to a common bottom edge. Stray fringe pixels
(bits of halo detached from the figure) are dropped.

Requires:  pip install opencv-python-headless numpy

Usage (from klt-tracker/):
    python3 tools/split_sprites.py assets/characters/kanade.png kanade
    python3 tools/split_sprites.py assets/characters/robot.png wren

Writes assets/characters/<name>/01.png ... 12.png (row by row) and a
contact sheet <name>/_sheet.png for checking. Expression names and mouth
states live in js/data/expressions.js.
"""
import os
import sys

import cv2
import numpy as np

COLS, ROWS = 4, 3
PAD = 16         # transparent margin around the largest figure (room for registration shifts)
ALPHA_MIN = 24   # alpha below this counts as background


def figures(rgba):
    """Return 12 boolean masks, one per figure, ordered row by row."""
    alpha = rgba[:, :, 3]
    solid = (alpha >= ALPHA_MIN).astype(np.uint8)
    # Close small gaps so a figure is one component, but not enough to merge neighbours.
    solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, labels, stats, cents = cv2.connectedComponentsWithStats(solid, connectivity=8)
    big = sorted(range(1, n), key=lambda i: stats[i, cv2.CC_STAT_AREA], reverse=True)[:COLS * ROWS]
    if len(big) < COLS * ROWS:
        sys.exit(f"found only {len(big)} figures")
    smallest, largest = stats[big[-1], cv2.CC_STAT_AREA], stats[big[0], cv2.CC_STAT_AREA]
    if smallest < 0.4 * largest:
        sys.exit("figure sizes are too uneven; the sheet may not be a clean 4x3 grid")
    # Order by grid cell of the centroid.
    h, w = alpha.shape
    def cell(i):
        cx, cy = cents[i]
        return (int(cy / h * ROWS), int(cx / w * COLS))
    big.sort(key=cell)
    cells = [cell(i) for i in big]
    if len(set(cells)) != COLS * ROWS:
        sys.exit(f"figures don't map one-to-one onto a {COLS}x{ROWS} grid: {cells}")
    return [labels == i for i in big]


def register(frames):
    """Align every frame to frame 01, then trim all frames to a common bottom edge.

    SIFT keypoints + RANSAC similarity to find inliers, then a least-squares
    fit of uniform scale + translation (no rotation) on those inliers.
    Rigid parts (hair, glasses, collar, tie, pin) agree; points on the moving
    mouth/eyes are rejected as outliers. Falls back to no change if too few
    inliers are found.
    """
    def gray(f):
        g = cv2.cvtColor(f[:, :, :3], cv2.COLOR_BGR2GRAY)
        return np.where(f[:, :, 3] >= ALPHA_MIN, g, 0).astype(np.uint8)
    H, W = frames[0].shape[:2]
    sift = cv2.SIFT_create(nfeatures=2000)
    k0, d0 = sift.detectAndCompute(gray(frames[0]), None)
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    out = [frames[0]]
    for i, f in enumerate(frames[1:], 2):
        k1, d1 = sift.detectAndCompute(gray(f), None)
        pairs = matcher.knnMatch(d1, d0, k=2) if d1 is not None else []
        good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
        M = None
        if len(good) >= 12:
            src = np.float32([k1[m.queryIdx].pt for m in good])
            dst = np.float32([k0[m.trainIdx].pt for m in good])
            M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.0)
            if M is not None and inl.sum() >= 12:
                # Keep scale + translation only: a head tilt belongs to the expression,
                # and rotating the frame would slant the bottom edge of the bust.
                a_, b_ = src[inl.ravel() == 1], dst[inl.ravel() == 1]
                ma, mb = a_.mean(0), b_.mean(0)
                sc = float(((a_ - ma) * (b_ - mb)).sum() / ((a_ - ma) ** 2).sum())
                tx, ty = mb - sc * ma
                M = np.float32([[sc, 0, tx], [0, sc, ty]])
            else:
                M = None
        if M is None:
            print(f"  frame {i:02d}: not enough matches, left as is")
            out.append(f)
            continue
        out.append(cv2.warpAffine(f, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)))
    bottom = min(int(np.nonzero(f[:, :, 3].max(axis=1) >= ALPHA_MIN)[0].max()) for f in out)
    for f in out:
        f[bottom + 1:] = 0
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, name = sys.argv[1], sys.argv[2]
    rgba = cv2.imread(src, cv2.IMREAD_UNCHANGED)
    if rgba is None or rgba.shape[2] != 4:
        sys.exit(f"{src}: expected an RGBA PNG")
    masks = figures(rgba)

    boxes = []
    for m in masks:
        ys, xs = np.nonzero(m)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    W = max(b[2] - b[0] for b in boxes) + 2 * PAD
    H = max(b[3] - b[1] for b in boxes) + 2 * PAD

    out_dir = os.path.join(os.path.dirname(src), name)
    os.makedirs(out_dir, exist_ok=True)
    frames = []
    for k, (m, (x0, y0, x1, y1)) in enumerate(zip(masks, boxes), 1):
        crop = rgba[y0:y1, x0:x1].copy()
        keep = m[y0:y1, x0:x1]
        # Soft edge: keep the original alpha inside the figure (grown by 1 px for antialiasing).
        keep = cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        crop[~keep] = 0
        canvas = np.zeros((H, W, 4), np.uint8)
        cw, ch = x1 - x0, y1 - y0
        ox = (W - cw) // 2          # centred horizontally
        oy = H - PAD - ch           # bottom-aligned
        canvas[oy:oy + ch, ox:ox + cw] = crop
        frames.append(canvas)

    frames = register(frames)
    for k, f in enumerate(frames, 1):
        cv2.imwrite(os.path.join(out_dir, f"{k:02d}.png"), f)

    # Contact sheet on a mid-grey background, numbered.
    sheet = np.full((ROWS * H, COLS * W, 3), 90, np.uint8)
    for k, f in enumerate(frames):
        r, c = divmod(k, COLS)
        a = f[:, :, 3:4] / 255.0
        tile = sheet[r * H:(r + 1) * H, c * W:(c + 1) * W]
        tile[:] = (f[:, :, :3] * a + tile * (1 - a)).astype(np.uint8)
        cv2.putText(tile, f"{k + 1:02d}", (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2)
    cv2.imwrite(os.path.join(out_dir, "_sheet.png"), sheet)
    print(f"{name}: 12 frames, {W}x{H} px each -> {out_dir}/")


if __name__ == "__main__":
    main()
