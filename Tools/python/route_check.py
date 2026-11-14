"""Route validation: least-cost traversable path between mission sites on the prepared heightmap.
Usage: route_check.py  -> prints max slope along each leg and writes WorldData/routes.json"""
import os, json, heapq, math
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
meta = json.load(open(os.path.join(ROOT, "WorldData", "world.json")))
NT, RES, EXT = meta["tilesPerSide"], meta["tileRes"], meta["extent"]
N = NT * (RES - 1) + 1
H = np.zeros((N, N), np.float32)
for tz in range(NT):
    for tx in range(NT):
        t = np.fromfile(os.path.join(ROOT, "WorldData", "tiles", f"h_{tx}_{tz}.r16"), "<u2").reshape(RES, RES)
        H[tz * (RES - 1):tz * (RES - 1) + RES, tx * (RES - 1):tx * (RES - 1) + RES] = meta["heightBase"] + t / 65535.0 * meta["heightSize"]
STEP = 4                      # analyse on an 8 m grid
Hs = H[::STEP, ::STEP]; cs = meta["cell"] * STEP; n = Hs.shape[0]
def ij(x, z): return int(round((z + EXT) / cs)), int(round((x + EXT) / cs))
def xz(j, i): return (-EXT + i * cs, -EXT + j * cs)
def height(x, z):
    j = (z + EXT) / meta["cell"]; i = (x + EXT) / meta["cell"]; return float(H[int(round(j)), int(round(i))])
MAXSLOPE = 22.0
def route(a, b):
    s = ij(*a); g = ij(*b)
    dist = np.full((n, n), np.inf); prev = {}
    dist[s] = 0; pq = [(0.0, s)]
    nb = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    while pq:
        d, (j, i) = heapq.heappop(pq)
        if (j, i) == g: break
        if d > dist[j, i]: continue
        for dj, di in nb:
            jj, ii = j + dj, i + di
            if not (0 <= jj < n and 0 <= ii < n): continue
            run = cs * math.hypot(dj, di); rise = abs(Hs[jj, ii] - Hs[j, i])
            sl = math.degrees(math.atan2(rise, run))
            if sl > MAXSLOPE: continue
            c = run * (1 + (sl / 10.0) ** 2)
            if d + c < dist[jj, ii]:
                dist[jj, ii] = d + c; prev[(jj, ii)] = (j, i); heapq.heappush(pq, (d + c, (jj, ii)))
    if g not in prev: return None
    path = [g]
    while path[-1] != s: path.append(prev[path[-1]])
    path.reverse()
    pts = [xz(j, i) for j, i in path]
    L = sum(math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1))
    return pts, L

def site_report(name, x, z, r=12):
    j = int(round((z + EXT) / meta["cell"])); i = int(round((x + EXT) / meta["cell"])); k = int(r / meta["cell"])
    p = H[j - k:j + k + 1, i - k:i + k + 1]
    gy, gx = np.gradient(p, meta["cell"]); s = np.degrees(np.arctan(np.hypot(gx, gy)))
    print(f"site {name:10s} ({x:6.0f},{z:6.0f}) h={height(x, z):7.1f} relief={p.max() - p.min():5.1f} m  p90 slope={np.percentile(s, 90):4.1f}")

sites = {"outpost": (-1250, 1150), "rover": (150, 900), "cave": (-190, -305)}
import sys
for a in sys.argv[1:]:
    k, v = a.split("="); x, z = v.split(","); sites[k] = (float(x), float(z))
for k, v in sites.items(): site_report(k, *v)
out = {}
legs = [("outpost", "rover"), ("rover", "cave")]
for a, b in legs:
    r = route(sites[a], sites[b])
    if r is None: print(f"leg {a}->{b}: NO ROUTE under {MAXSLOPE} deg"); continue
    pts, L = r
    print(f"leg {a}->{b}: length {L:.0f} m (straight {math.dist(sites[a], sites[b]):.0f} m), waypoints {len(pts)}")
    out[f"{a}-{b}"] = [[round(p[0], 1), round(p[1], 1)] for p in pts[::6]] + [[round(pts[-1][0], 1), round(pts[-1][1], 1)]]
json.dump(out, open(os.path.join(ROOT, "WorldData", "routes.json"), "w"))
