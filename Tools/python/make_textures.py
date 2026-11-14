"""
Cinderfall 2 - procedural, tileable PBR textures (original, generated from noise).

Writes to Assets/Cinderfall/Art/Textures/Generated:
  <Name>_A.png  albedo (sRGB)
  <Name>_N.png  tangent-space normal map (OpenGL convention, +Y up)
  <Name>_M.png  mask map  R = metallic (0), G = ambient occlusion, B = height, A = smoothness
All textures tile seamlessly (all noise is periodic on the texture domain).
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Assets", "Cinderfall", "Art", "Textures", "Generated")
os.makedirs(OUT, exist_ok=True)
S = 1024

def noise(seed, sigma):
    """Periodic gaussian-filtered white noise, zero mean, unit std."""
    r = np.random.default_rng(seed).standard_normal((S, S)).astype(np.float32)
    n = ndimage.gaussian_filter(r, sigma, mode="wrap")
    return (n - n.mean()) / (n.std() + 1e-6)

def fbm(seed, base_sigma, octaves=5, gain=0.5):
    tot = np.zeros((S, S), np.float32); amp = 1.0; norm = 0.0; s = base_sigma
    for o in range(octaves):
        tot += amp * noise(seed + o * 17, max(s, 0.6)); norm += amp; amp *= gain; s *= 0.5
    return tot / norm

def worley(seed, n_pts):
    """Periodic Worley noise: returns F1, F2 distances (in pixels) and cell id."""
    rng = np.random.default_rng(seed)
    pts = rng.random((n_pts, 2)) * S
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    f1 = np.full((S, S), 1e9, np.float32); f2 = np.full((S, S), 1e9, np.float32); cid = np.zeros((S, S), np.int32)
    for k, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, S - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, S - dy)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d)); cid = np.where(closer, k, cid); f1 = np.where(closer, d, f1)
    return f1, f2, cid

def warp(a, seed, amt):
    u = noise(seed, 24) * amt; v = noise(seed + 1, 24) * amt
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    return ndimage.map_coordinates(a, [(yy + v) % S, (xx + u) % S], order=1, mode="wrap")

def norm01(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-6)

def save(name, albedo, height, smooth, normal_strength=4.0, ao_strength=1.0):
    h = norm01(height)
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * S / 64.0 * normal_strength
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * S / 64.0 * normal_strength
    n = np.stack([-gx, gy, np.ones_like(h)], -1)   # image row 0 is top (+V), so flip y gradient for OpenGL
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    cav = h - ndimage.gaussian_filter(h, 6, mode="wrap")
    ao = np.clip(1.0 + cav * 3.0 * ao_strength, 0.35, 1.0)
    alb = np.clip(albedo * (0.82 + 0.18 * ao[..., None]), 0, 1)
    Image.fromarray((alb * 255 + 0.5).astype(np.uint8), "RGB").save(os.path.join(OUT, name + "_A.png"))
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), "RGB").save(os.path.join(OUT, name + "_N.png"))
    m = np.stack([np.zeros_like(h), ao, h, np.clip(smooth, 0, 1)], -1)
    Image.fromarray((m * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(OUT, name + "_M.png"))
    print("wrote", name)

def tint(base, var, *mods):
    """base RGB, var = scalar field in ~[-1,1]; mods = (field, rgb_delta) pairs."""
    c = np.ones((S, S, 3), np.float32) * np.array(base, np.float32)
    c *= (1.0 + 0.10 * var[..., None])
    for f, d in mods:
        c += f[..., None] * np.array(d, np.float32)
    return c

only = set(sys.argv[1:])
def want(n): return not only or n in only

# ---------------------------------------------------------------- regolith dust
if want("Dust"):
    lo = fbm(1, 90, 3); mid = fbm(2, 14, 4); grain = noise(3, 0.7)
    h = 0.6 * lo + 0.35 * mid + 0.12 * grain
    alb = tint((0.60, 0.35, 0.21), 0.6 * lo + 0.3 * mid,
               (np.clip(fbm(4, 40, 3), 0, 1), (0.05, 0.035, 0.02)),       # paler dust patches
               (np.clip(-fbm(5, 30, 3), 0, 1), (-0.06, -0.04, -0.02)),    # darker patches
               (grain * 0.5, (0.025, 0.015, 0.01)))
    save("Dust", alb, h, 0.12 + 0.05 * mid, 2.5)

# ---------------------------------------------------------------- dark basaltic sand with ripples
if want("DarkSand"):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    ph = (xx + yy * 0.25) / S * 2 * np.pi * 22 + 2.2 * fbm(11, 60, 3)
    rip = np.sin(ph + 0.6 * np.sin(ph)) * (0.7 + 0.3 * fbm(12, 50, 2))
    grain = noise(13, 0.7)
    h = 0.55 * rip + 0.3 * fbm(14, 80, 3) + 0.1 * grain
    alb = tint((0.30, 0.20, 0.155), 0.5 * fbm(15, 50, 3),
               (np.clip(rip, 0, 1) * 0.5, (0.04, 0.025, 0.015)),
               (grain * 0.5, (0.02, 0.015, 0.012)))
    save("DarkSand", alb, h, 0.18 + 0.05 * grain, 3.0)

# ---------------------------------------------------------------- bedrock: fractured, layered blocks
if want("Bedrock"):
    f1, f2, cid = worley(21, 70)
    edge = np.clip((f2 - f1) / 10.0, 0, 1)
    blocks = np.random.default_rng(22).random(70).astype(np.float32)[cid]
    rough = fbm(23, 10, 5)
    yy, _ = np.mgrid[0:S, 0:S].astype(np.float32)
    bands = np.sin(warp(yy, 24, 40) / S * 2 * np.pi * 9) * 0.5
    h = 0.55 * edge ** 0.5 + 0.25 * blocks + 0.3 * rough + 0.1 * bands
    alb = tint((0.43, 0.24, 0.15), 0.6 * rough + 0.5 * (blocks - 0.5),
               (bands, (0.03, 0.02, 0.012)),
               (1 - edge, (-0.12, -0.08, -0.05)),
               (np.clip(fbm(25, 30, 3), 0, 1), (-0.08, -0.05, -0.03)))   # basalt-dark varnish
    save("Bedrock", alb, h, 0.22 + 0.1 * rough, 5.0, 1.4)

# ---------------------------------------------------------------- light layered sediment, polygonal fracture
if want("Sediment"):
    f1, f2, cid = worley(31, 150)
    crack = 1 - np.clip((f2 - f1) / 4.0, 0, 1)
    plate = np.random.default_rng(32).random(150).astype(np.float32)[cid]
    rough = fbm(33, 18, 4)
    h = 0.7 - 0.5 * crack + 0.12 * plate + 0.2 * rough
    alb = tint((0.70, 0.49, 0.34), 0.5 * rough + 0.4 * (plate - 0.5),
               (crack, (-0.18, -0.13, -0.09)),
               (np.clip(fbm(34, 60, 3), 0, 1), (0.05, 0.04, 0.03)))
    save("Sediment", alb, h, 0.16 + 0.05 * rough, 3.5, 1.2)

# ---------------------------------------------------------------- gravel / lag deposit
if want("Gravel"):
    f1, f2, cid = worley(41, 900)
    rnd = np.random.default_rng(42)
    size = rnd.random(900).astype(np.float32)[cid]
    dark = (rnd.random(900) < 0.45).astype(np.float32)[cid]
    dome = np.clip(1 - f1 / (9 + 10 * size), 0, 1) ** 0.6
    sep = np.clip((f2 - f1) / 3.0, 0, 1)
    pebble = dome * sep
    h = 0.75 * pebble + 0.15 * fbm(43, 12, 3)
    base = tint((0.52, 0.31, 0.19), 0.5 * fbm(44, 40, 3))
    peb_col = np.where(dark[..., None] > 0.5, np.array([0.20, 0.15, 0.13], np.float32), np.array([0.48, 0.27, 0.17], np.float32))
    peb_col = peb_col * (0.85 + 0.3 * size[..., None])
    m = np.clip(pebble * 2.2, 0, 1)[..., None]
    alb = base * (1 - m) + peb_col * m
    save("Gravel", alb, h, 0.2 + 0.15 * pebble, 4.0, 1.3)

# ---------------------------------------------------------------- boulder rock (used on rock meshes)
if want("Rock"):
    rough = fbm(51, 20, 6); speck = noise(52, 0.8)
    f1, f2, _ = worley(53, 40); fr = 1 - np.clip((f2 - f1) / 6.0, 0, 1)
    h = 0.6 * rough + 0.25 * speck * 0.3 - 0.35 * fr
    alb = tint((0.36, 0.21, 0.145), 0.7 * rough,
               (speck * 0.4, (0.02, 0.015, 0.012)),
               (fr, (-0.1, -0.07, -0.05)),
               (np.clip(fbm(54, 50, 3) - 0.3, 0, 1), (0.10, 0.06, 0.035)))   # dust-coated tops variation
    save("Rock", alb, h, 0.25 + 0.1 * rough, 5.0, 1.3)

# ---------------------------------------------------------------- cave basalt with iron-oxide seams and vesicles
if want("CaveRock"):
    rough = fbm(61, 16, 6)
    f1, f2, _ = worley(62, 500); ves = np.clip(1 - f1 / 3.5, 0, 1) * (noise(63, 30) > 0.3)
    yy, _ = np.mgrid[0:S, 0:S].astype(np.float32)
    seam = np.exp(-((np.sin(warp(yy, 64, 70) / S * 2 * np.pi * 5) ) / 0.12) ** 2) * np.clip(fbm(65, 40, 3) + 0.4, 0, 1)
    h = 0.6 * rough - 0.5 * ves - 0.15 * seam
    alb = tint((0.13, 0.105, 0.095), 0.8 * rough,
               (seam, (0.22, 0.09, 0.03)),
               (np.clip(fbm(66, 60, 3), 0, 1) * 0.6, (0.09, 0.04, 0.015)),
               (ves, (-0.06, -0.05, -0.045)))
    save("CaveRock", alb, h, 0.3 + 0.15 * rough, 6.0, 1.5)

# ---------------------------------------------------------------- water ice
if want("Ice"):
    f1, f2, _ = worley(71, 60); crack = 1 - np.clip((f2 - f1) / 2.5, 0, 1)
    bub = np.clip(1 - worley(72, 700)[0] / 2.2, 0, 1)
    cloud = fbm(73, 50, 4)
    h = 0.5 + 0.2 * cloud - 0.4 * crack + 0.1 * bub
    alb = tint((0.74, 0.83, 0.90), 0.5 * cloud,
               (crack, (0.12, 0.1, 0.08)),
               (np.clip(fbm(74, 70, 3), 0, 1), (-0.12, -0.08, -0.04)),      # embedded dust layers
               (bub, (0.08, 0.08, 0.08)))
    save("Ice", alb, h, 0.86 - 0.3 * crack, 2.0, 0.6)
