# Asset Register

## In use
| Asset | Source | Licence | Status |
|---|---|---|---|
| CinderRain heightfield tiles, splats, backdrop, survey map | User's CinderRain Blender/Python pipeline → `../Tools/python/prepare_world.py` → `../WorldData` | User-owned | Integrated (copied by `npm run sync-assets`) |
| Terrain layer textures (Dust, DarkSand, Bedrock, Sediment, Gravel, Rock, CaveRock, Ice) | Generated from noise by `../Tools/python/make_textures.py` | Original (project) | Integrated (Cave/Ice reserved for the cave) |
| three.js | npm | MIT | Runtime dependency |

## User models — NOT YET SUPPLIED (placeholders in use)
| Slot | Drop file at | Placeholder | Integration status |
|---|---|---|---|
| Rover | `public/assets/models/rover.glb` | `src/vehicles/rover.ts` (primitive 6-wheel rover) | Slot ready; scale/orientation unknown |
| Outpost / habitat | `public/assets/models/outpost.glb` | `src/base/outpost.ts` | Slot ready |
| Drilling machine | `public/assets/models/drill.glb` | `src/base/drill.ts` (placeholder animation) | Slot ready |
| Astronaut / player | `public/assets/models/astronaut.glb` | none — first-person camera | Not wired (needs rig/animation info) |

Placeholders are labelled in code (`userData.placeholder`, object names `*_PLACEHOLDER`), in the F3 overlay and in Credits.

## Found on disk, not used (needs the user's decision)
| Path | Notes |
|---|---|
| `Downloads/Space-Game-main/.../MAINBASE_CRIMSONAMALTHEA.glb` (39 MB) | Valid glTF; possibly an outpost. Ownership/licence unknown. |
| `Downloads/main base (1).blend` (272 MB) | Possibly the outpost source. Needs Blender export to .glb. |
| `Documents/CinderRain/CinderRain.blend` | Terrain source scene. |
| `Downloads/Space-Game-main/.../colony-rover/textures/*.png`, `GagarinLP.fbx` | **Git LFS pointer files**, not real data. |
| `moon_-_gagarin_crater.glb`, `hematite.glb`, `mars__4k_-_nasa_-_photography.glb`, `earth_hologram.glb` | Look like third-party downloads; licences unknown. |
