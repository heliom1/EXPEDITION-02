# Cinderfall 2 — browser game

First-person Mars exploration game (Mars, 2043) built with **TypeScript + Three.js + Vite**. No Unity.
The surface is the team's **CinderRain** terrain (6.1 km × 6.1 km, 2 m heightfield) streamed in the browser.

## Requirements
- Node.js 20+ (verified with Node 26.13.1, npm 11.20)
- Chrome or Edge (verified headless: Chrome 157). On laptops with two GPUs, set the browser to
  "High performance" in **Windows Settings → System → Display → Graphics**, or it may run on the integrated GPU.

## Commands (from `D:\Cinderfall2\web`)
| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run sync-assets` | Copy CinderRain world data + generated textures from the repo root into `public/` (already done; rerun after re-running the Python world tools) |
| `npm run dev` | Development server → **http://localhost:5173/** |
| `npm run typecheck` | TypeScript check (also serves as lint) |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build → **http://localhost:4173/** |
| `npm run shot` | Headless screenshots of key views into `tools/out/` (needs dev server running) |
| `npm run e2e` | Headless end-to-end mission run (needs dev server running; pass a URL to test preview: `node tools/e2e.mjs http://localhost:4173/`) |

## Controls
W A S D move · mouse look · Shift sprint · Space jump · E interact · Tab PDA · 1–5 tool bar · Esc pause · F3 developer overlay
(with F3 open: F5 outpost, F6 rover, F7 drill site, F8 cliff base teleports).

## Adding your models
Export to glTF binary and drop them into `public/assets/models/` as `outpost.glb`, `rover.glb`, `drill.glb`
(and later `astronaut.glb`). They replace the labelled placeholders automatically on next load; adjust scale/rotation
in `src/world/modelSlots.ts` (`SLOT_TRANSFORMS`). The F3 overlay shows which slots are using your models.

## Deploying
`dist/` is a static site (relative paths, no server code). Any static host works; `.r16` files are served as
binary (`application/octet-stream`). **Nothing has been deployed** — publishing needs your approval.

## Docs
See `docs/` — status, architecture, narrative source of truth, asset register, performance, tests, known issues.
