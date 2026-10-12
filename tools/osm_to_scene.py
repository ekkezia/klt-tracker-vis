#!/usr/bin/env python3
"""Turn OpenStreetMap data into the scene description used by sim/ (Three.js).

Data (c) OpenStreetMap contributors, ODbL 1.0. The attribution is written into
the output and shown in the simulator.

Usage (from klt-tracker/):
    python3 tools/osm_to_scene.py osm.json sim/scene-data.json

`osm.json` is an Overpass API result (see fetch query in HANDOFF.md, section 6).
Coordinates are converted to metres in a local frame centred on the start:
    x = east, z = south (Three.js: y is up, -z is north).
The route is the shortest walk along mapped sidewalks/crossings/footpaths
from the start shop to the dock point inside the destination park.
"""
import heapq
import json
import math
import sys

START_NAME = "Happy Star Bakery"     # shop where the delivery starts (OSM name prefix)
DEST_PARK = "Seward Park"            # park where the robot docks
MARGIN = 90                          # keep map features within this many metres of the route
WALKABLE = {"footway", "pedestrian", "path", "steps", "living_street"}

ROAD_WIDTH = {  # curb-to-curb, metres (typical Manhattan values)
    "primary": 17.0, "secondary": 13.0, "tertiary": 11.0, "residential": 9.0,
    "unclassified": 9.0, "service": 5.0, "living_street": 6.0,
}


def main():
    src, out = sys.argv[1], sys.argv[2]
    els = json.load(open(src))["elements"]
    nodes = {e["id"]: (e["lat"], e["lon"]) for e in els if e["type"] == "node" and "lat" in e}
    ways = [e for e in els if e["type"] == "way"]
    tagged_nodes = [e for e in els if e["type"] == "node" and e.get("tags")]

    start = next(e for e in tagged_nodes if e["tags"].get("name", "").startswith(START_NAME))
    lat0, lon0 = start["lat"], start["lon"]
    kx = 111320 * math.cos(math.radians(lat0))
    kz = 110540

    def xy(lat, lon):
        return [round((lon - lon0) * kx, 2), round(-(lat - lat0) * kz, 2)]

    def wxy(w):
        return [xy(*nodes[n]) for n in w["nodes"] if n in nodes]

    # ---- route over the pedestrian graph --------------------------------------
    graph = {}
    for w in ways:
        t = w.get("tags", {})
        if t.get("highway") not in WALKABLE and t.get("footway") is None:
            continue
        ns = [n for n in w["nodes"] if n in nodes]
        for a, b in zip(ns, ns[1:]):
            d = math.dist(xy(*nodes[a]), xy(*nodes[b]))
            graph.setdefault(a, []).append((b, d))
            graph.setdefault(b, []).append((a, d))

    park = next(w for w in ways if w.get("tags", {}).get("name") == DEST_PARK and w["tags"].get("leisure") == "park")
    park_poly = wxy(park)
    pcx = sum(p[0] for p in park_poly) / len(park_poly)
    pcz = sum(p[1] for p in park_poly) / len(park_poly)

    def nearest(pt, pred=lambda n: True):
        return min((n for n in graph if pred(n)), key=lambda n: math.dist(xy(*nodes[n]), pt))

    src_n = nearest([0, 0])
    # Dock: a walkable node inside the park, as close to its centre as possible.
    inside = lambda n: point_in_poly(xy(*nodes[n]), park_poly)
    dst_n = nearest([pcx, pcz], inside)
    path = dijkstra(graph, src_n, dst_n)
    route = [xy(*nodes[n]) for n in path]
    route = [[0.0, 0.0]] + route  # leave from the shop door
    length = sum(math.dist(a, b) for a, b in zip(route, route[1:]))

    xs = [p[0] for p in route]; zs = [p[1] for p in route]
    box = (min(xs) - MARGIN, min(zs) - MARGIN, max(xs) + MARGIN, max(zs) + MARGIN)
    inbox = lambda p: box[0] <= p[0] <= box[2] and box[1] <= p[1] <= box[3]

    # ---- features ---------------------------------------------------------------
    buildings, roads, crossings, parks, sidewalks, paths = [], [], [], [], [], []
    for w in ways:
        t = w.get("tags", {})
        pts = wxy(w)
        if len(pts) < 2 or not any(inbox(p) for p in pts):
            continue
        if "building" in t and len(pts) >= 4:
            h = height_of(t)
            buildings.append({"id": w["id"], "poly": pts[:-1] if pts[0] == pts[-1] else pts, "h": h,
                              "levels": int(t.get("building:levels", max(1, round(h / 3.3)))),
                              "kind": t.get("building", "yes")})
        elif t.get("highway") in ROAD_WIDTH and t.get("area") != "yes":
            roads.append({"name": t.get("name", ""), "kind": t["highway"], "w": road_width(t), "pts": pts,
                          "oneway": t.get("oneway") == "yes", "layer": int(t.get("layer", 0) or 0)})
        elif t.get("footway") == "crossing" or t.get("highway") == "crossing":
            crossings.append({"pts": pts, "marked": t.get("crossing") in ("marked", "zebra", "traffic_signals", None)})
        elif t.get("footway") == "sidewalk":
            sidewalks.append({"pts": pts})
        elif t.get("highway") in ("footway", "path", "pedestrian") and not t.get("footway"):
            paths.append({"pts": pts, "w": 3.0 if t.get("highway") == "pedestrian" else 2.4})
        elif t.get("leisure") == "park" and len(pts) >= 4:
            parks.append({"name": t.get("name", ""), "poly": pts[:-1]})

    def pts_of(pred):
        return [e for e in tagged_nodes if pred(e["tags"]) and inbox(xy(e["lat"], e["lon"]))]

    trees = [xy(e["lat"], e["lon"]) for e in pts_of(lambda t: t.get("natural") == "tree")]
    benches = [xy(e["lat"], e["lon"]) for e in pts_of(lambda t: t.get("amenity") == "bench")]
    bins = [xy(e["lat"], e["lon"]) for e in pts_of(lambda t: t.get("amenity") == "waste_basket")]
    bikes = [xy(e["lat"], e["lon"]) for e in pts_of(lambda t: t.get("amenity") == "bicycle_rental")]
    hydrants = [xy(e["lat"], e["lon"]) for e in pts_of(lambda t: t.get("emergency") == "fire_hydrant")]
    subway = [xy(e["lat"], e["lon"]) for e in pts_of(lambda t: t.get("railway") == "subway_entrance")]
    shops = [{"p": xy(e["lat"], e["lon"]), "name": e["tags"].get("name", ""),
              "kind": e["tags"].get("shop") or e["tags"].get("amenity")}
             for e in pts_of(lambda t: ("shop" in t or t.get("amenity") in
                                         ("restaurant", "cafe", "fast_food", "pharmacy", "bank", "bar")) and "name" in t)]

    data = {
        "attribution": "Map data (c) OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright)",
        "origin": {"lat": lat0, "lon": lon0, "name": start["tags"]["name"]},
        "frame": "metres; x = east, z = south",
        "route": {"pts": route, "length": round(length, 1), "from": start["tags"]["name"], "to": DEST_PARK},
        "dock": route[-1],
        "buildings": buildings, "roads": roads, "crossings": crossings, "sidewalks": sidewalks, "paths": paths, "parks": parks,
        "trees": trees, "benches": benches, "bins": bins, "bikes": bikes, "hydrants": hydrants,
        "subway": subway, "shops": shops,
    }
    with open(out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"route {length:.0f} m over {len(route)} points; {len(buildings)} buildings, {len(roads)} roads, "
          f"{len(crossings)} crossings, {len(trees)} trees, {len(shops)} named shops -> {out}")


def height_of(t):
    for k in ("height", "building:height"):
        try:
            return float(str(t[k]).split()[0])
        except (KeyError, ValueError):
            pass
    try:
        return float(t["building:levels"]) * 3.3 + 1.0
    except (KeyError, ValueError):
        return 15.0


def road_width(t):
    try:
        return float(str(t["width"]).split()[0])
    except (KeyError, ValueError):
        pass
    w = ROAD_WIDTH.get(t["highway"], 9.0)
    try:
        lanes = int(t["lanes"])
        w = max(w, lanes * 3.3 + 2.4)
    except (KeyError, ValueError):
        pass
    return w


def dijkstra(graph, a, b):
    dist, prev, pq = {a: 0.0}, {}, [(0.0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b:
            break
        if d > dist.get(u, math.inf):
            continue
        for v, w in graph[u]:
            nd = d + w
            if nd < dist.get(v, math.inf):
                dist[v], prev[v] = nd, u
                heapq.heappush(pq, (nd, v))
    if b not in dist:
        sys.exit("no walkable route found")
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    return path[::-1]


def point_in_poly(p, poly):
    x, z = p
    inside = False
    for (x1, z1), (x2, z2) in zip(poly, poly[1:] + poly[:1]):
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            inside = not inside
    return inside


if __name__ == "__main__":
    main()
