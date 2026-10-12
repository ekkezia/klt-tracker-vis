#!/usr/bin/env python3
"""Generate the placeholder clip + ground-truth track file.

Pure stdlib (no numpy) plus the ffmpeg CLI. The "camera" is a 640x480 window
panning across a large synthetic world image, so every feature position is
known exactly. The track file is GROUND TRUTH with simulated failures (losses
during the fast "sprint" segment, synthetic err values) -- it is NOT the output
of a real KLT tracker. Replace it with real tracker output for real footage.

Usage (from klt-tracker/):
    python3 tools/make_placeholder.py
"""
import json
import math
import os
import random
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CLIP_OUT = os.path.join(ROOT, "assets", "clips", "placeholder.mp4")
TRACK_OUT = os.path.join(ROOT, "assets", "tracks", "placeholder.json")

FW, FH = 640, 480          # frame size (keep in sync with js/config.js STAGE)
FPS = 24
FRAMES_PER_CHAPTER = 120
# Pan speed (px/frame) per chapter 0..7. Chapter 4 is the "sprint".
SPEEDS = [1.0, 2.5, 1.0, 2.0, 7.0, 2.0, 1.2, 0.0]
BOB = [3, 4, 2, 4, 16, 5, 2, 0]           # vertical bob amplitude per chapter
N = FRAMES_PER_CHAPTER * len(SPEEDS)
MARGIN = 3                                # px margin for "in frame"

random.seed(7)


def camera_path():
    """Per-frame integer (x, y) offset of the window into the world."""
    xs, ys = [], []
    x = 0.0
    for f in range(N):
        ch = f // FRAMES_PER_CHAPTER
        local = f % FRAMES_PER_CHAPTER
        v = SPEEDS[ch]
        # Ease speed across chapter boundaries (12 frames).
        if local < 12 and ch > 0:
            a = local / 12.0
            v = SPEEDS[ch - 1] * (1 - a) + v * a
        # Docking: decelerate to a full stop by the end of chapter 6.
        if ch == 6:
            v = SPEEDS[6] * max(0.0, 1 - local / (FRAMES_PER_CHAPTER - 10))
        x += v
        amp = BOB[ch]
        y = 40 + amp * math.sin(f * (0.9 if ch == 4 else 0.12))
        xs.append(int(round(x)))
        ys.append(int(round(y)))
    return xs, ys


XS, YS = camera_path()
WW = max(XS) + FW + 40
WH = 480 + 100


def chapter_x_range(ch):
    seg = XS[ch * FRAMES_PER_CHAPTER:(ch + 1) * FRAMES_PER_CHAPTER]
    return min(seg), max(seg) + FW


class World:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = bytearray(w * h * 3)

    def fill(self, x0, y0, x1, y1, rgb):
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(self.w, x1), min(self.h, y1)
        if x1 <= x0 or y1 <= y0:
            return
        row = bytes(rgb) * (x1 - x0)
        for y in range(y0, y1):
            i = (y * self.w + x0) * 3
            self.px[i:i + len(row)] = row

    def noise(self, amp):
        r = random.Random(11)
        p = self.px
        for i in range(len(p)):
            v = p[i] + r.randint(-amp, amp)
            p[i] = 0 if v < 0 else 255 if v > 255 else v


PALETTE = [
    (52, 61, 70), (176, 74, 58), (64, 110, 142), (214, 170, 72),
    (92, 128, 92), (140, 98, 140), (30, 34, 38), (226, 214, 196),
]
BG = (196, 190, 180)
WALL = (236, 233, 226)


def build_world():
    world = World(WW, WH)
    world.fill(0, 0, WW, WH, BG)
    features = []  # world-space (x, y) of true corners

    wall_x0, wall_x1 = chapter_x_range(2)
    wall_x0 += 100
    wall_x1 -= 100
    dock_x0, dock_x1 = chapter_x_range(6)

    # Textured rectangles on a jittered grid (no overlaps -> every corner is real).
    cell = 112
    for gx in range(0, WW - cell, cell):
        for gy in range(0, WH - cell + 1, cell):
            if wall_x0 - cell < gx < wall_x1:
                continue
            if gx > dock_x1 - FW - cell:
                continue  # leave docking area for the target
            w = random.randint(34, 90)
            h = random.randint(34, 90)
            x0 = gx + random.randint(8, cell - w - 8)
            y0 = gy + random.randint(8, cell - h - 8)
            world.fill(x0, y0, x0 + w, y0 + h, random.choice(PALETTE))
            features += [(x0, y0), (x0 + w, y0), (x0, y0 + h), (x0 + w, y0 + h)]

    # The white wall (chapter 2): flat paint, one long baseboard edge, one door corner.
    world.fill(wall_x0, 0, wall_x1, WH, WALL)
    base_y = 40 + 400
    world.fill(wall_x0, base_y, wall_x1, WH, (120, 112, 104))  # long horizontal edge
    door_x = (wall_x0 + wall_x1) // 2 + 120
    door_top = 40 + 150
    world.fill(door_x, door_top, door_x + 110, base_y, (92, 84, 76))
    features += [(door_x, door_top), (door_x + 110, door_top)]

    # Docking target (chapter 6 end): checkerboard centered in the final view.
    cx = XS[7 * FRAMES_PER_CHAPTER - 1] + FW // 2
    cy = YS[7 * FRAMES_PER_CHAPTER - 1] + FH // 2
    sq, n = 24, 6
    ox, oy = cx - sq * n // 2, cy - sq * n // 2
    world.fill(ox - 12, oy - 12, ox + sq * n + 12, oy + sq * n + 12, (245, 243, 238))
    for i in range(n):
        for j in range(n):
            if (i + j) % 2 == 0:
                world.fill(ox + i * sq, oy + j * sq, ox + (i + 1) * sq, oy + (j + 1) * sq, (24, 24, 24))
    for i in range(1, n):
        for j in range(1, n):
            features.append((ox + i * sq, oy + j * sq))

    world.noise(3)
    return world, features


def build_tracks(features):
    """Ground-truth tracks with simulated loss/re-detection in fast motion."""
    next_id = [1]

    def new_id():
        next_id[0] += 1
        return next_id[0] - 1

    state = [{"id": None, "dead": 0} for _ in features]
    frames = []
    rng = random.Random(3)
    for f in range(N):
        ox, oy = XS[f], YS[f]
        speed = abs(XS[f] - XS[f - 1]) if f else 0
        out = []
        for k, (wx, wy) in enumerate(features):
            s = state[k]
            x, y = wx - ox, wy - oy
            inside = MARGIN <= x < FW - MARGIN and MARGIN <= y < FH - MARGIN
            if s["dead"] > 0:
                s["dead"] -= 1
                continue
            if not inside:
                if s["id"] is not None:
                    out.append({"id": s["id"], "x": round(x, 1), "y": round(y, 1), "status": "lost"})
                    s["id"] = None
                continue
            # Simulated failure: fast motion makes some tracks drop out.
            if s["id"] is not None and speed > 4 and rng.random() < 0.03:
                out.append({"id": s["id"], "x": round(x, 1), "y": round(y, 1), "status": "lost"})
                s["id"] = None
                s["dead"] = rng.randint(6, 18)
                continue
            err = round(0.05 + 0.04 * speed + abs(rng.gauss(0, 0.05)), 2)
            if s["id"] is None:
                s["id"] = new_id()
                out.append({"id": s["id"], "x": round(x, 1), "y": round(y, 1), "status": "new", "err": err})
            else:
                out.append({"id": s["id"], "x": round(x, 1), "y": round(y, 1), "status": "tracked", "err": err})
        frames.append(out)
    return {
        "schema": "klt-tracks/v1",
        "clip": "placeholder",
        "fps": FPS,
        "width": FW,
        "height": FH,
        "frameCount": N,
        "synthetic": True,
        "frames": frames,
    }


def encode(world):
    os.makedirs(os.path.dirname(CLIP_OUT), exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{FW}x{FH}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "medium",
        "-g", "12", "-movflags", "+faststart", CLIP_OUT,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    stride = world.w * 3
    for f in range(N):
        ox, oy = XS[f], YS[f]
        buf = bytearray()
        for y in range(oy, oy + FH):
            i = y * stride + ox * 3
            buf += world.px[i:i + FW * 3]
        proc.stdin.write(buf)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")


def main():
    world, features = build_world()
    tracks = build_tracks(features)
    os.makedirs(os.path.dirname(TRACK_OUT), exist_ok=True)
    with open(TRACK_OUT, "w") as fh:
        json.dump(tracks, fh, separators=(",", ":"))
    encode(world)
    print(f"world {WW}x{WH}, {len(features)} features, {N} frames")
    print("wrote", os.path.relpath(CLIP_OUT, ROOT), "and", os.path.relpath(TRACK_OUT, ROOT))


if __name__ == "__main__":
    main()
