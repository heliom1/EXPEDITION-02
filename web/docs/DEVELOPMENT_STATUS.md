# Development Status

_Last updated: 2026-11-14 (session 1)_

## Where things are
- Repository: `D:\Cinderfall2` (Git). It already contained an earlier **Unity** attempt (Assets/, Packages/, ProjectSettings/)
  plus the offline CinderRain world pipeline (Tools/python, WorldData/). That work is untouched.
- Browser game: `D:\Cinderfall2\web\` (this folder). Unity is not used.

## Verified this session
| Phase | State | Evidence |
|---|---|---|
| 00 Audit | Done | `docs/ENVIRONMENT_AUDIT.md` |
| 01 Bootstrap | Done | Vite + TS + Three.js; dev and preview servers run; typecheck, tests, build pass |
| 02 Prototype | Done (folded into 03/04) | Collision approach chosen: analytic heightfield + cylinder colliders (see TECHNICAL_ARCHITECTURE) |
| 03 Player controller | Done | Pointer lock, Mars gravity, slope limit, structure/rock collision, fall recovery, sensitivity/invert. Unit tests |
| 04 Surface world | Done | CinderRain 6.1 km² heightfield streamed as LOD chunks with skirts; backdrop to 14 km |
| 05 Landmarks | Partial | Outpost, reactor, rover, drill, cliff-base sites placed on validated flat ground; dev overlay coordinates; PDA map |
| 06 Rock scatter | Done | Instanced, splat/slope-driven, 6 shapes, collision on large rocks |
| 07 Materials/atmosphere | Partial | 5-layer splat material, triplanar bedrock, strata banding, Mars sky, fog, dust motes. No dust storm yet |
| 08–09 Cave | Not started | Cliff-base objective marks the location |
| 10 Base systems | Partial | Placeholder outpost, read-only systems panel, suit recharge. No power simulation consequences yet |
| 11 Rover | Partial | Placeholder rover + log interaction. **No driving yet** |
| 12 Drilling | Partial | Activation, progress, completion, record. No fault state |
| 13 Interactions | Partial | Data-driven `Interactable` (access/inspect/activate/recharge), focus cone, prompts |
| 14 PDA | Partial | Map, missions, logs. Not persisted |
| 15 Story | Partial | 4-step vertical-slice route; drafts flagged |
| 16 Survival | Partial | O₂ / suit power / health, warnings, recoverable failure |
| 17 Audio | Not started | |
| 18 Save/load | Not started | Continue button disabled |
| 19 Optimisation | Partial | Headless Intel UHD numbers only — see PERFORMANCE_BASELINE |
| 20 QA | Partial | Automated e2e of the slice passes on dev **and production build** (15/15) |
| 21 Build | Partial | `npm run build` + `npm run preview` verified. Not deployed |

## Not yet verified by a human
- Real mouse feel, pointer lock behaviour and frame rate on the RTX 4050 in a visible browser window
  (headless Chrome picked the Intel GPU; pointer lock cannot be exercised headless).

## Blockers / dependencies
- User models (rover, outpost, drill, astronaut) not supplied as .glb — placeholders in use.
- Fuller story needed for diary/log content and the cave discovery beats.

## Next task
1. Human playtest on the RTX 4050 (Chrome/Edge), record FPS in PERFORMANCE_BASELINE.
2. Phase 08 cave: entrance at the cliff base (-190, -305), throat, chamber, ice discovery area.
3. Phase 18 save/load (IndexedDB, versioned) so Continue works.
4. Rover driving (Phase 11) once the rover model's scale/wheel layout is known.
