# Performance Baseline

## Machine
i7-13620H · 15.6 GB RAM · RTX 4050 Laptop (4 GB) + Intel UHD · Windows 11 Home 10.0.26200 · Chrome 157 / Edge 157.

## Measured 2026-11-14 — headless Chrome 157, **Intel UHD (ANGLE D3D11)**, 1600×900, High quality
Headless Chrome selected the integrated GPU, so these are a **lower bound**, not the RTX 4050.

| View | FPS | Draw calls | Triangles (incl. shadow pass) | Rocks |
|---|---|---|---|---|
| Spawn (outpost) | 39–47 | 134 | 2.1 M | 8.6 k |
| Plain vista | 44 | 84 | 1.3 M | 3.7 k |
| Rover | 34 | 129 | 2.7 M | 11.5 k |
| Channel / cliff | 25–29 | 140 | 2.4 M | 9.6 k |
| Drill site | 27–34 | 95 | — | — |

Load to playable (dev server, local): 6–13 s headless. Transfer: ~19 MB heights + ~12 MB splats + ~36 MB textures (uncompressed PNG).

Changes made from these measurements: rock mesh detail 2 → 1 (≈4×fewer triangles), rocks only on finest-LOD chunks (4.6 M → 2.4 M triangles at the cliff).

## To measure next (manual, visible browser)
1. `npm run dev`, open http://localhost:5173/ in Chrome with the RTX 4050 selected (Windows Graphics settings).
2. New Game → press F3. Record FPS / draw calls at the outpost, rover (F6), drill (F7), cliff (F8).
3. Repeat in Edge, and with Settings → Graphics: Low.

## Known costs
Shadow pass re-draws near terrain and rocks; terrain fragment shader does ~14 texture fetches; textures are 1024² PNG (not compressed GPU formats yet).
