#!/usr/bin/env python3
"""Run a real KLT tracker over a video and write a klt-tracks/v1 file.

Detection: Shi-Tomasi (cv2.goodFeaturesToTrack). Tracking: pyramidal
Lucas-Kanade (cv2.calcOpticalFlowPyrLK). Verification: forward-backward error,
which is also written as each point's `err` (px). Lost features are replaced
by fresh detections in empty regions, each with a new id.

Requires:  pip install opencv-python-headless numpy

Usage (from klt-tracker/):
    python3 tools/track_video.py assets/clips/my_clip.mp4 assets/tracks/my_clip.json
    python3 tools/track_video.py in.mp4 out.json --max-corners 150 --fb-thresh 1.0

The coordinates are in the video's own pixel grid. Keep the clip at the size
set in js/config.js (STAGE, default 640x480) or the overlay is rescaled.
"""
import argparse
import json
import sys

try:
    import cv2
    import numpy as np
except ImportError:
    sys.exit("Needs OpenCV + numpy:  pip install opencv-python-headless numpy")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--max-corners", type=int, default=120)
    ap.add_argument("--quality", type=float, default=0.01, help="Shi-Tomasi quality level (fraction of best score)")
    ap.add_argument("--min-dist", type=int, default=12, help="min distance between features (px)")
    ap.add_argument("--win", type=int, default=21, help="LK window size (px, odd)")
    ap.add_argument("--levels", type=int, default=3, help="pyramid levels above the base")
    ap.add_argument("--fb-thresh", type=float, default=1.0, help="forward-backward error to drop a track (px)")
    ap.add_argument("--min-eig", type=float, default=1e-3,
                    help="absolute floor on the Shi-Tomasi score (cv2.cornerMinEigenVal, block 7) for "
                         "detecting AND keeping a feature; rejects compression noise on blank surfaces")
    ap.add_argument("--clip", default=None, help="clip id stored in the file (default: video file name)")
    a = ap.parse_args()

    cap = cv2.VideoCapture(a.video)
    if not cap.isOpened():
        sys.exit(f"Cannot open {a.video}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    lk = dict(winSize=(a.win, a.win), maxLevel=a.levels,
              criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))

    frames, prev, pts, ids = [], None, np.empty((0, 1, 2), np.float32), []
    next_id = 1
    width = height = None
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        height, width = gray.shape
        min_eig = cv2.cornerMinEigenVal(gray, 7, 3)
        score = lambda x, y: float(min_eig[min(height - 1, max(0, int(round(y)))), min(width - 1, max(0, int(round(x))))])
        out = []
        kept_pts, kept_ids = [], []

        if prev is not None and len(pts):
            nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, gray, pts, None, **lk)
            back, st2, _ = cv2.calcOpticalFlowPyrLK(gray, prev, nxt, None, **lk)
            fb = np.linalg.norm((pts - back).reshape(-1, 2), axis=1)
            for k, (p, i) in enumerate(zip(nxt.reshape(-1, 2), ids)):
                x, y = float(p[0]), float(p[1])
                inside = 0 <= x < width and 0 <= y < height
                good = (st[k, 0] == 1 and st2[k, 0] == 1 and fb[k] < a.fb_thresh and inside
                        and score(x, y) >= 0.5 * a.min_eig)  # feature degraded into an edge / blank
                if good:
                    out.append({"id": i, "x": round(x, 2), "y": round(y, 2), "status": "tracked", "err": round(float(fb[k]), 3)})
                    kept_pts.append(p)
                    kept_ids.append(i)
                else:
                    q = pts[k, 0]  # report the last trusted position
                    out.append({"id": i, "x": round(float(q[0]), 2), "y": round(float(q[1]), 2), "status": "lost"})

        # Top up with new Shi-Tomasi corners away from live tracks.
        need = a.max_corners - len(kept_pts)
        if need > 0:
            mask = np.full_like(gray, 255)
            for p in kept_pts:
                cv2.circle(mask, (int(p[0]), int(p[1])), a.min_dist, 0, -1)
            new = cv2.goodFeaturesToTrack(gray, need, a.quality, a.min_dist, mask=mask, blockSize=7)
            if new is not None:
                for p in new.reshape(-1, 2):
                    if score(p[0], p[1]) < a.min_eig:
                        continue
                    out.append({"id": next_id, "x": round(float(p[0]), 2), "y": round(float(p[1]), 2), "status": "new"})
                    kept_pts.append(p)
                    kept_ids.append(next_id)
                    next_id += 1

        frames.append(out)
        pts = np.array(kept_pts, np.float32).reshape(-1, 1, 2)
        ids = kept_ids
        prev = gray
        if len(frames) % 100 == 0:
            print(f"  frame {len(frames)}: {len(ids)} tracks", file=sys.stderr)

    data = {
        "schema": "klt-tracks/v1",
        "clip": a.clip or a.video.rsplit("/", 1)[-1].rsplit(".", 1)[0],
        "fps": fps, "width": width, "height": height, "frameCount": len(frames),
        "tracker": {"detector": "shi-tomasi", "minEig": a.min_eig, "lk": {"win": a.win, "levels": a.levels}, "fbThresh": a.fb_thresh,
                    "minDist": a.min_dist, "maxCorners": a.max_corners},
        "frames": frames,
    }
    with open(a.out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"wrote {a.out}: {len(frames)} frames, {next_id - 1} tracks total, {width}x{height} @ {fps:g} fps")


if __name__ == "__main__":
    main()
