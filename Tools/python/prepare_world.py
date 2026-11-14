"""
Cinderfall 2 - offline world data preparation (Python, numpy/scipy/PIL).

Reads the CinderRain terrain data produced by the user's existing Blender/Python
pipeline (Documents/CinderRain/data) and writes Unity-ready data:

  WorldData/tiles/h_<tx>_<tz>.r16      513x513 uint16 heightmaps (little endian)
  WorldData/tiles/s_<tx>_<tz>_0.png     splat weights RGBA = dust, dark sand, bedrock, light sediment
  WorldData/tiles/s_<tx>_<tz>_1.png     splat weights R    = gravel / lag
  WorldData/backdrop_h.r16              backdrop height grid (non-walkable horizon terrain)
  WorldData/world.json                  metadata (extents, height range, tile layout)
  Assets/Cinderfall/Resources/Map/survey_map.png   PDA survey map (north up)

Unity convention: 1 unit = 1 metre, +X east, +Z north, +Y up. CinderRain (x, y, z) -> Unity (x, z, y).
The script is deterministic; re-running it reproduces the same output.
"""
import json, os, sys, math
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\USER\Documents\CinderRain\data"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "WorldData")
TILES = os.path.join(OUT, "tiles")
os.makedirs(TILES, exist_ok=True)

EXT = 3072.0            # walkable world spans [-EXT, EXT] on both axes (6.144 km)
CELL = 2.0              # heightmap sample spacing (m)
TILE = 1024.0           # terrain tile edge (m)
NT = int(2 * EXT / TILE)            # 6 tiles per side
RES = int(TILE / CELL) + 1          # 513 samples per tile edge
N = int(2 * EXT / CELL) + 1         # 3073 global samples
H_BASE, H_SIZE = -220.0, 480.0      # Unity terrain height range (m)

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def resample(src, src_min, src_step, xs, ys, order=3):
    """Sample a regular grid (rows = y) at world coordinates xs (cols), ys (rows)."""
    ci = (xs - src_min) / src_step; rj = (ys - src_min) / src_step
    J, I = np.meshgrid(rj, ci, indexing="ij")
    return ndimage.map_coordinates(src.astype(np.float32), [J, I], order=order, mode="nearest").astype(np.float32)

def periodic_free_noise(shape, seed, sigma):
    rng = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(rng.standard_normal(shape).astype(np.float32), sigma, mode="wrap")
    return n / (n.std() + 1e-6)

print("loading CinderRain data from", SRC)
Hf = np.load(os.path.join(SRC, "H_fine.npy")).astype(np.float32)        # 2049^2, [-2048, 2048], 2 m
Ha = np.load(os.path.join(SRC, "H_ringA.npy")).astype(np.float32)       # 385^2, [-6144, 6144], 32 m
Hb = np.load(os.path.join(SRC, "H_ringB.npy")).astype(np.float32)       # 225^2, [-14336, 14336], 128 m
Wf = np.load(os.path.join(SRC, "W_ctrl.npy")).astype(np.float32)        # 5 x 2049^2
Wa = np.load(os.path.join(SRC, "W_ctrl_ringA.npy")).astype(np.float32)  # 5 x 385^2

xs = -EXT + CELL * np.arange(N)
# ---- outer heights: cubic upsample of ring A + procedural detail so it does not look smooth
Hout = resample(Ha, -6144.0, 32.0, xs, xs)
detail = 0.45 * periodic_free_noise((N, N), 11, 6) + 0.12 * periodic_free_noise((N, N), 12, 2.0) + 2.0 * periodic_free_noise((N, N), 13, 30)
Hout = Hout + detail
# ---- place fine data in the centre and blend across a 220 m band
H = Hout.copy()
off = int((EXT - 2048.0) / CELL)   # 512
H[off:off + 2049, off:off + 2049] = Hf
X, Y = np.meshgrid(xs, xs)
d = np.maximum(np.abs(X), np.abs(Y))
wf = 1.0 - ss(1820.0, 2040.0, d)
Hfine_full = Hout.copy(); Hfine_full[off:off + 2049, off:off + 2049] = Hf
band = (d > 1820) & (d < 2048)
print("fine vs ringA mismatch in blend band: mean %.2f m, p95 %.2f m" % (np.abs(Hfine_full - Hout)[band].mean(), np.percentile(np.abs(Hfine_full - Hout)[band], 95)))
H = Hfine_full * wf + Hout * (1 - wf)
print("global height range %.1f .. %.1f" % (H.min(), H.max()))
assert H.min() > H_BASE + 5 and H.max() < H_BASE + H_SIZE - 5, "height range exceeds terrain range"

# ---- splat weights on the same 2 m grid
Wout = np.stack([resample(Wa[k], -6144.0, 32.0, xs, xs, order=1) for k in range(5)])
W = Wout.copy()
W[:, off:off + 2049, off:off + 2049] = Wf
W = W * wf + Wout * (1 - wf)
W = np.clip(W, 0, None); W /= W.sum(0, keepdims=True) + 1e-6

# ---- write tiles (row index = +Z north, column = +X east, as Unity's TerrainData.SetHeights expects [z, x])
for tz in range(NT):
    for tx in range(NT):
        j0 = tz * (RES - 1); i0 = tx * (RES - 1)
        h = H[j0:j0 + RES, i0:i0 + RES]
        q = np.clip((h - H_BASE) / H_SIZE, 0, 1)
        (np.round(q * 65535).astype("<u2")).tofile(os.path.join(TILES, f"h_{tx}_{tz}.r16"))
        w = W[:, j0:j0 + RES - 1, i0:i0 + RES - 1]   # 512 x 512 alphamap
        a0 = (np.clip(w[0:4], 0, 1) * 255 + 0.5).astype(np.uint8).transpose(1, 2, 0)
        a1 = np.zeros((RES - 1, RES - 1, 4), np.uint8); a1[..., 0] = (np.clip(w[4], 0, 1) * 255 + 0.5).astype(np.uint8); a1[..., 3] = 255
        Image.fromarray(a0[::-1], "RGBA").save(os.path.join(TILES, f"s_{tx}_{tz}_0.png"))   # PNG row 0 = top = north
        Image.fromarray(a1[::-1], "RGBA").save(os.path.join(TILES, f"s_{tx}_{tz}_1.png"))

# ---- backdrop: 257 x 257 grid over [-14336, 14336] (112 m) from ring A inside +-6144, ring B outside
BN = 257; bx = np.linspace(-14336.0, 14336.0, BN)
Bb = resample(Hb, -14336.0, 128.0, bx, bx)
Ba = resample(Ha, -6144.0, 32.0, np.clip(bx, -6144, 6144), np.clip(bx, -6144, 6144))
BX, BY = np.meshgrid(bx, bx); bd = np.maximum(np.abs(BX), np.abs(BY))
wa = 1 - ss(5200.0, 6100.0, bd)
B = Ba * wa + Bb * (1 - wa)
qB = np.clip((B - (-400.0)) / 900.0, 0, 1)
(np.round(qB * 65535).astype("<u2")).tofile(os.path.join(OUT, "backdrop_h.r16"))

# ---- PDA survey map (north up), hillshade + elevation tint, 2048 px over [-EXT, EXT]
gy, gx = np.gradient(H, CELL)
az, alt = math.radians(315), math.radians(40)
nrm = np.sqrt(gx * gx + gy * gy + 1)
hs = np.clip((-gx * math.cos(alt) * math.sin(az) - gy * math.cos(alt) * math.cos(az) + math.sin(alt)) / nrm, 0, 1)
hn = (H - H.min()) / (H.max() - H.min())
r = 0.30 + 0.50 * hn; g = 0.17 + 0.30 * hn; b = 0.11 + 0.16 * hn
shade = 0.30 + 0.70 * hs
img = np.stack([r * shade, g * shade, b * shade], -1)
# contour lines every 25 m
cont = (np.abs(((H + 1000) % 25.0) - 12.5) > 11.9).astype(np.float32)
img = img * (1 - 0.18 * cont[..., None])
img8 = (np.clip(img, 0, 1)[::-1] * 255).astype(np.uint8)
mp = os.path.join(ROOT, "Assets", "Cinderfall", "Resources", "Map"); os.makedirs(mp, exist_ok=True)
Image.fromarray(img8).resize((2048, 2048), Image.LANCZOS).save(os.path.join(mp, "survey_map.png"))

meta = dict(source=SRC, extent=EXT, cell=CELL, tile=TILE, tilesPerSide=NT, tileRes=RES, alphaRes=RES - 1,
            heightBase=H_BASE, heightSize=H_SIZE, backdrop=dict(res=BN, extent=14336.0, base=-400.0, size=900.0),
            minHeight=float(H.min()), maxHeight=float(H.max()))
with open(os.path.join(OUT, "world.json"), "w") as f: json.dump(meta, f, indent=2)
print("wrote", NT * NT, "tiles to", TILES)
