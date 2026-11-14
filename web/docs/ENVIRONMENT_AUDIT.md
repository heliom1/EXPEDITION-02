# Phase 00 — Environment Audit (read-only)

Date: 2026-11-14. No software was installed and no system settings were changed.

## Hardware / OS
| Item | Value |
|---|---|
| OS | Windows 11 Home Single Language 10.0.26200 |
| CPU | Intel Core i7-13620H (10 cores / 16 threads) |
| RAM | 15.6 GB |
| GPU (discrete) | NVIDIA GeForce RTX 4050 Laptop GPU, driver 32.0.15.6607 |
| GPU (integrated) | Intel UHD Graphics, driver 32.0.101.6790 |
| Disk C: | **3.2 GB free — critically low** |
| Disk D: | 169.7 GB free |
| Disk E: | 421.5 GB free |

## Browsers
| Browser | Version |
|---|---|
| Google Chrome | 157.0.8103.51 |
| Microsoft Edge | 157.0.4341.46 |

WebGL 2: expected to be supported on both browsers with this GPU. **Not yet verified** — will be confirmed on the first localhost run (the boot screen will report the WebGL renderer string).

## Tools
| Tool | Status |
|---|---|
| Node.js / npm | **NOT INSTALLED** — required, blocks Phase 01 |
| Git | Installed (2.56.0) at `C:\Program Files\Git`, but **not on PowerShell PATH** |
| Python | 3.12.12 (offline tooling only, not the game runtime) |
| Blender | Not found on PATH (optional, offline only) |
| VS Code | Installed |
| winget | Available |

## Existing assets found (read-only, nothing moved or modified)
| Path | Notes |
|---|---|
| `Downloads\Space-Game-main\Space-Game-main\` | An earlier **Unity** project. Per the plan, Unity is not used; only its assets may be useful. |
| `...\Assets\3D Environments\MAINBASE_CRIMSONAMALTHEA.glb` (39 MB) | Valid glTF binary. Possibly the outpost/habitat — **ownership/licence to be confirmed by the user**. |
| `...\Assets\3D Environments\colony-rover\textures\*.png` | **Git LFS pointer files (≈130 bytes), not real textures.** No rover mesh present. |
| `...\Assets\3D Environments\moon-gagarin-crater\` (.fbx, textures) | Git LFS pointers; the `.glb` (33 MB) is real. Looks like a third-party download — licence unknown. Lunar, not Martian. |
| `...\Assets\Mineral\hematite.glb` (7.8 MB) | Valid glTF. Licence unknown. |
| `...\Assets\UI\mars__4k_-_nasa_-_photography.glb`, `earth_hologram.glb` | Licence unknown. |
| `Downloads\main base (1).blend` (272 MB) | Possibly the outpost. Needs Blender to inspect/export to .glb. |
| `Documents\CinderRain\CinderRain.blend` (50 MB), `Downloads\CinderRain.blend` | Unknown contents; needs Blender. |

**Not found:** a rover mesh, drilling machine, or astronaut model in a browser-ready format.

## Constraints identified
1. Node.js is missing — nothing can be built until it is installed.
2. C: has only 3.2 GB free. The project (with `node_modules`, builds and assets) should live on **D:**.
3. The large `.blend` files need exporting to `.glb` (Blender) before the browser can load them.
4. Several "assets" are LFS pointers; the real files would have to come from the original Git LFS remote.
5. Laptop has hybrid graphics: Chrome/Edge must be set to use the RTX 4050 (Windows Settings → Display → Graphics) or they may run on Intel UHD.

## Recommended setup order
1. Install Node.js LTS: `winget install OpenJS.NodeJS.LTS` (~100 MB on C:).
2. Add Git to PATH (or rely on Git Bash, which already has it).
3. Create the project at `D:\Cinderfall2`.
4. Later: provide `.glb` exports of the rover, outpost, drill and astronaut, plus confirmation of which found files are yours.

## Post-audit actions (approved by the user)
- Installed Node.js LTS 26.13.1 / npm 11.20 via `winget install OpenJS.NodeJS.LTS`.
- Project location chosen: `D:\Cinderfall2`. It turned out to already contain an earlier Unity attempt with the
  CinderRain world pipeline (Git repo). The browser game was placed in `D:\Cinderfall2\web` and the existing work left
  untouched (one file, `.gitignore`, was briefly overwritten and immediately restored from Git).
- WebGL 2 confirmed working in headless Chrome 157 (ANGLE D3D11, Intel UHD). RTX 4050 use in a visible window still to confirm.
