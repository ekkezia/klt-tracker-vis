#!/usr/bin/env python3
"""Render the article's figures from the recorded footage and its KLT tracks.

Requires:  pip install opencv-python-headless numpy
Usage (from klt-tracker/):
    python3 tools/make_figures.py

Reads assets/clips/chinatown.mp4, assets/tracks/chinatown.json.gz and
js/data/route.js (key frames); writes assets/figures/*.jpg|png.
"""
import gzip
import json
import os
import re

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "figures")
CLIP = os.path.join(ROOT, "assets", "clips", "chinatown.mp4")
TRACKS = os.path.join(ROOT, "assets", "tracks", "chinatown.json.gz")
YELLOW, GREEN, RED, CYAN, WHITE = (32, 176, 255), (110, 211, 52), (68, 68, 239), (252, 211, 125), (255, 255, 255)


def keys():
    src = open(os.path.join(ROOT, "js", "data", "route.js")).read()
    return json.loads(re.search(r'"keys": (\{.*?\})', src, re.S).group(1))


def frame(cap, f):
    cap.set(cv2.CAP_PROP_POS_FRAMES, f)
    ok, img = cap.read()
    assert ok, f"cannot read frame {f}"
    return img


def tensor_maps(gray, half=7):
    g = cv2.GaussianBlur(gray.astype(np.float32) / 255.0, (0, 0), 1.0)
    ix = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    iy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    k = (2 * half + 1, 2 * half + 1)
    a = cv2.boxFilter(ix * ix, -1, k, normalize=False)
    b = cv2.boxFilter(ix * iy, -1, k, normalize=False)
    c = cv2.boxFilter(iy * iy, -1, k, normalize=False)
    r = np.sqrt(((a - c) / 2) ** 2 + b * b)
    return ix, iy, (a + c) / 2 + r, (a + c) / 2 - r, (a, b, c)


def label(img, text, org, scale=0.6, color=WHITE):
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)


def fig_flow(cap, tr, f, lag=6, scale=4, cap_px=40):
    img = frame(cap, f)
    prev = {p["id"]: p for p in tr["frames"][f - lag] if p["status"] != "lost"}
    for p in tr["frames"][f]:
        q = prev.get(p["id"])
        if p["status"] == "lost" or not q:
            continue
        x0, y0 = p["x"], p["y"]
        if np.hypot(p["x"] - q["x"], p["y"] - q["y"]) > cap_px:   # skip re-detections / outliers
            continue
        x1, y1 = x0 + (p["x"] - q["x"]) * scale, y0 + (p["y"] - q["y"]) * scale
        cv2.arrowedLine(img, (int(x0), int(y0)), (int(x1), int(y1)), YELLOW, 2, cv2.LINE_AA, tipLength=0.25)
        cv2.circle(img, (int(x0), int(y0)), 3, YELLOW, -1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(OUT, "flow-field.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 85])


def pick(l1, l2, kind, region, gray=None, tau=0.1):
    x0, y0, x1, y1 = region
    L1, L2 = l1[y0:y1, x0:x1], l2[y0:y1, x0:x1]
    if kind == "corner":
        score = L2
    elif kind == "edge":
        score = np.where(L2 < tau, L1 - 10 * L2, -1)
    else:   # flat: least texture among mid-grey pixels (not clipped black/white)
        g = gray[y0:y1, x0:x1]
        score = np.where((g > 60) & (g < 200), -L1, -1e9)
    y, x = np.unravel_index(np.argmax(score), score.shape)
    return x + x0, y + y0


def fig_aperture(img, ix, iy, l1, l2, abc):
    h, w = l1.shape
    x, y = pick(l1, l2, "edge", (60, 60, w - 60, h // 2))
    a, b, c = (m[y, x] for m in abc)
    ang = 0.5 * np.arctan2(2 * b, a - c)                # direction of the dominant gradient
    g = np.array([np.cos(ang), np.sin(ang)]); e = np.array([-g[1], g[0]])
    s = 90
    crop = img[max(0, y - s):y + s, max(0, x - s):x + s].copy()
    crop = cv2.resize(crop, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    cx, cy = (x - max(0, x - s)) * 2.5, (y - max(0, y - s)) * 2.5
    half = 7 * 2.5
    cv2.rectangle(crop, (int(cx - half), int(cy - half)), (int(cx + half), int(cy + half)), CYAN, 2)
    p = lambda v, k: (int(cx + v[0] * k), int(cy + v[1] * k))
    cv2.arrowedLine(crop, p(g, 0), p(g, 110), GREEN, 3, cv2.LINE_AA, tipLength=0.2)
    cv2.arrowedLine(crop, p(e, 0), p(e, 110), RED, 3, cv2.LINE_AA, tipLength=0.2)
    cv2.imwrite(os.path.join(OUT, "aperture.jpg"), crop, [cv2.IMWRITE_JPEG_QUALITY, 88])


def fig_tensor(img, ix, iy, l1, l2):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    vals = {}
    h, w = l1.shape
    tiles = []
    for kind in ("flat", "edge", "corner"):
        x, y = pick(l1, l2, kind, (40, 40, w - 40, int(h * 0.6)), gray)
        vals[kind] = (float(l1[y, x]), float(l2[y, x]))
        half = 7
        patch = cv2.resize(img[y - half:y + half + 1, x - half:x + half + 1], (240, 240), interpolation=cv2.INTER_NEAREST)
        gx = ix[y - half:y + half + 1, x - half:x + half + 1].ravel()
        gy = iy[y - half:y + half + 1, x - half:x + half + 1].ravel()
        plot = np.full((240, 240, 3), 30, np.uint8)
        cv2.line(plot, (120, 0), (120, 240), (90, 90, 90), 1); cv2.line(plot, (0, 120), (240, 120), (90, 90, 90), 1)
        k = 100 / max(0.02, np.abs(np.concatenate([gx, gy])).max())
        for u, v in zip(gx, gy):
            cv2.circle(plot, (int(120 + u * k), int(120 + v * k)), 2, WHITE, -1)
        cov = np.array([[np.mean(gx * gx), np.mean(gx * gy)], [np.mean(gx * gy), np.mean(gy * gy)]])
        ev, evec = np.linalg.eigh(cov)
        ang = np.degrees(np.arctan2(evec[1, 1], evec[0, 1]))
        axes = (max(1, int(np.sqrt(max(ev[1], 0)) * k * 2)), max(1, int(np.sqrt(max(ev[0], 0)) * k * 2)))
        cv2.ellipse(plot, (120, 120), axes, ang, 0, 360, (12, 65, 194), 2, cv2.LINE_AA)
        col = np.vstack([patch, plot])
        tiles.append(col)
        tiles.append(np.full((480, 12, 3), 255, np.uint8))
    out = np.hstack(tiles[:-1])
    cv2.imwrite(os.path.join(OUT, "flat-edge-corner.png"), out)
    return vals


def fig_pyramid(cap, tr, f, levels=4):
    img = frame(cap, f)
    cur = {p["id"]: p for p in tr["frames"][f] if p["status"] == "tracked"}
    prev = {p["id"]: p for p in tr["frames"][f - 1] if p["status"] != "lost"}
    best = max((i for i in cur if i in prev), key=lambda i: abs(cur[i]["x"] - prev[i]["x"]) + abs(cur[i]["y"] - prev[i]["y"]))
    d = np.hypot(cur[best]["x"] - prev[best]["x"], cur[best]["y"] - prev[best]["y"])
    lvl, H = [img], img.shape[0]
    for _ in range(1, levels):
        lvl.append(cv2.pyrDown(lvl[-1]))
    tiles = []
    for l, im in enumerate(lvl):
        im = im.copy()
        s = 2 ** l
        c = (int(cur[best]["x"] / s), int(cur[best]["y"] / s))
        cv2.circle(im, c, max(4, 18 // s), YELLOW, 2, cv2.LINE_AA)
        t = np.full((H, im.shape[1] + 16, 3), 255, np.uint8)
        t[H - im.shape[0]:, 8:8 + im.shape[1]] = im
        tiles.append(t)
    cv2.imwrite(os.path.join(OUT, "pyramid.jpg"), np.hstack(tiles), [cv2.IMWRITE_JPEG_QUALITY, 85])
    return d


LOOP_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" font-family="Helvetica, Arial, sans-serif">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker></defs>
  <rect width="720" height="300" fill="#fff"/>
  <g font-size="15" text-anchor="middle">
    <rect x="30" y="40" width="150" height="70" rx="10" fill="#e8f3ff" stroke="#1f5f8b"/><text x="105" y="70" font-weight="700">1. Detect</text><text x="105" y="92" font-size="12">Shi–Tomasi corners</text>
    <rect x="540" y="40" width="150" height="70" rx="10" fill="#fff4e5" stroke="#b4441c"/><text x="615" y="70" font-weight="700">2. Track</text><text x="615" y="92" font-size="12">pyramidal Lucas–Kanade</text>
    <rect x="540" y="190" width="150" height="70" rx="10" fill="#fdecec" stroke="#b91c1c"/><text x="615" y="220" font-weight="700">3. Verify</text><text x="615" y="242" font-size="12">FB error, residual, λmin</text>
    <rect x="30" y="190" width="150" height="70" rx="10" fill="#eaf7ee" stroke="#15803d"/><text x="105" y="220" font-weight="700">4. Replenish</text><text x="105" y="242" font-size="12">new corners in gaps</text>
    <text x="360" y="140" font-size="18" font-weight="700">one loop per frame</text>
    <text x="360" y="164" font-size="12" fill="#555">keeps ~N tracks alive</text>
  </g>
  <g stroke="#333" stroke-width="2" fill="none" marker-end="url(#a)">
    <path d="M180 75 H538"/><path d="M615 110 V188"/><path d="M540 225 H182"/><path d="M105 190 V112"/>
  </g>
  <g font-size="12" fill="#333" text-anchor="middle">
    <text x="360" y="66">points x_t</text><text x="660" y="155">x_{t+1}</text><text x="360" y="216">surviving tracks</text><text x="60" y="155">back to N</text>
  </g>
</svg>
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    k = keys()
    tr = json.load(gzip.open(TRACKS))
    cap = cv2.VideoCapture(CLIP)
    fig_flow(cap, tr, k["sprintStart"] + 40)
    img = frame(cap, k["truckStop"] + 24)
    ix, iy, l1, l2, abc = tensor_maps(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    fig_aperture(img, ix, iy, l1, l2, abc)
    for kind, (a, b) in fig_tensor(img, ix, iy, l1, l2).items():
        print(f"{kind}: l1={a:.3f} l2={b:.4f}")
    d = fig_pyramid(cap, tr, k["sprintStart"] + 60)
    open(os.path.join(OUT, "klt-loop.svg"), "w").write(LOOP_SVG)
    print("pyramid frame", k["sprintStart"] + 60)
    print("figures written to assets/figures/ (pyramid feature moved %.1f px)" % d)


if __name__ == "__main__":
    main()
