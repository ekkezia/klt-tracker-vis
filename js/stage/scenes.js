// Per-chapter overlay layer drawn on top of the footage + track dots.
// renderScene(sceneId, t, ctx, info)
//   sceneId  chapter.scene
//   t        progress through the chapter's frame range, 0..1
//   ctx      2D context of the overlay canvas (native footage pixel grid)
//   info     { frame, points, tracks, width, height, colors }
//
// Every scene here is a deliberately plain placeholder.
// TODO(creative): replace each scene with richer annotation once real footage lands.

const scenes = {
  boot(ctx, t, info) {
    // Hairline reticle at frame centre: "this is where I am looking".
    const { width: w, height: h, colors, px } = info;
    ctx.strokeStyle = colors.hairline;
    ctx.lineWidth = 1.25 * px;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 14, h / 2); ctx.lineTo(w / 2 + 14, h / 2);
    ctx.moveTo(w / 2, h / 2 - 14); ctx.lineTo(w / 2, h / 2 + 14);
    ctx.stroke();
  },

  lobby(ctx, t, info) {
    drawFlowVectors(ctx, info, 4, 3);
  },

  wall(ctx, t, info) {
    // Outline every active point's window so the reader sees what is being tested.
    ctx.strokeStyle = info.colors.hairline;
    ctx.lineWidth = info.px;
    ctx.setLineDash([4 * info.px, 4 * info.px]);
    for (const p of info.points) {
      if (p.status === 'lost') continue;
      ctx.strokeRect(p.x - 7.5, p.y - 7.5, 15, 15);
    }
    ctx.setLineDash([]);
  },

  corridor(ctx, t, info) {
    // Label a few ids so "identity across frames" is visible.
    ctx.font = `${11 * info.px}px ui-monospace, monospace`;
    ctx.fillStyle = info.colors.label;
    info.points.filter((p) => p.status !== 'lost').slice(0, 8)
      .forEach((p) => ctx.fillText(`#${p.id}`, p.x + 6, p.y - 6));
  },

  sprint(ctx, t, info) {
    drawFlowVectors(ctx, info, 1, 1);
  },

  crowd(ctx, t, info) {
    // TODO(creative): needs footage with forward motion to show expansion / FOE.
    drawFlowVectors(ctx, info, 6, 4);
  },

  docking(ctx, t, info) {
    // Error vector from the target's tracked centroid to the frame centre.
    const pts = info.points.filter((p) => p.status !== 'lost');
    if (!pts.length) return;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const { width: w, height: h, colors, px } = info;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2 * px;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(w / 2, h / 2); ctx.stroke();
    ctx.font = `${13 * px}px ui-monospace, monospace`;
    const label = `error e = (${(cx - w / 2).toFixed(1)}, ${(cy - h / 2).toFixed(1)}) px`;
    ctx.lineWidth = 4 * px;
    ctx.strokeStyle = colors.halo;
    ctx.strokeText(label, w / 2 + 16 * px, h / 2 - 16 * px);
    ctx.fillStyle = colors.label;
    ctx.fillText(label, w / 2 + 16 * px, h / 2 - 16 * px);
  },

  debrief() {},
};

/** Arrow from where each point was `lag` frames ago to where it is now, scaled. */
function drawFlowVectors(ctx, info, lag, scale) {
  const { points, tracks, frame, colors, px } = info;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1.5 * px;
  for (const p of points) {
    if (p.status === 'lost') continue;
    const prev = tracks.byId.get(p.id)?.get(frame - lag);
    if (!prev) continue;
    const dx = (p.x - prev.x) * scale, dy = (p.y - prev.y) * scale;
    if (Math.hypot(dx, dy) < 1) continue;
    arrow(ctx, p.x, p.y, p.x + dx, p.y + dy, 6 * px);
  }
}

export function arrow(ctx, x0, y0, x1, y1, s = 4) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - s * Math.cos(a - 0.5), y1 - s * Math.sin(a - 0.5));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - s * Math.cos(a + 0.5), y1 - s * Math.sin(a + 0.5));
  ctx.stroke();
}

export function renderScene(sceneId, t, ctx, info) {
  (scenes[sceneId] ?? (() => {}))(ctx, t, info);
}
