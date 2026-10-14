// Track files: one JSON per clip (optionally gzipped, *.json.gz). Schema "klt-tracks/v1":
// {
//   schema: "klt-tracks/v1", clip: string, fps: number,
//   width: number, height: number, frameCount: number,
//   frames: [ [ { id: number, x: number, y: number,
//                 status: "tracked" | "lost" | "new", err?: number } ] ]
// }
// frames[i] lists every point reported in frame i. Coordinates are in the
// footage's native pixel grid (origin top-left). `err` is an optional
// per-point tracking error in px (e.g. forward-backward or residual-based).

const STATUSES = new Set(['tracked', 'lost', 'new']);
const cache = new Map();

export async function loadTracks(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Track file ${url}: HTTP ${r.status}`);
      // Large track files ship gzipped (*.json.gz); the browser inflates them here.
      if (url.split('?')[0].endsWith('.gz')) return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
      return r.json();
    })
    .then((data) => validate(data, url));
  cache.set(url, p);
  return p;
}

function validate(d, url) {
  const fail = (msg) => { throw new Error(`Track file ${url}: ${msg}`); };
  if (d.schema !== 'klt-tracks/v1') fail(`unknown schema "${d.schema}"`);
  for (const k of ['fps', 'width', 'height']) if (!(d[k] > 0)) fail(`missing ${k}`);
  if (!Array.isArray(d.frames)) fail('frames must be an array');
  d.frameCount = d.frameCount ?? d.frames.length;
  // Spot-check a few frames rather than walking megabytes of JSON.
  for (const f of [0, d.frames.length >> 1, d.frames.length - 1]) {
    for (const pt of d.frames[f] ?? []) {
      if (!STATUSES.has(pt.status)) fail(`frame ${f}: bad status "${pt.status}"`);
    }
  }
  d.byId = indexById(d.frames);
  return d;
}

// id -> Map(frame -> point), used to draw trails and flow vectors.
function indexById(frames) {
  const m = new Map();
  frames.forEach((pts, f) => {
    for (const p of pts) {
      if (!m.has(p.id)) m.set(p.id, new Map());
      m.get(p.id).set(f, p);
    }
  });
  return m;
}

/** Aggregate numbers for the HUD. */
export function frameStats(points) {
  let tracked = 0, lost = 0, fresh = 0, errSum = 0, errN = 0;
  for (const p of points) {
    if (p.status === 'tracked') tracked++;
    else if (p.status === 'lost') lost++;
    else fresh++;
    if (p.status !== 'lost' && typeof p.err === 'number') { errSum += p.err; errN++; }
  }
  return {
    tracked, lost, fresh,
    active: tracked + fresh,
    meanErr: errN ? errSum / errN : null,
  };
}
