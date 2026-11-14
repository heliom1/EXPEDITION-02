# Development Status

_Last updated: 2026-11-14 (session 2)_

## Where things are
- Repository: `D:\Cinderfall2` (Git, branch `web-vertical-slice`). The earlier Unity attempt and offline CinderRain
  pipeline at the repo root are untouched.
- Browser game: `D:\Cinderfall2\web\`.

## Verified
| Phase | State | Evidence |
|---|---|---|
| 00 Audit | Done | `docs/ENVIRONMENT_AUDIT.md` |
| 01 Bootstrap | Done | dev + preview servers; typecheck, tests, build pass |
| 02 Prototype | Done | Collision: heightfield + cave SDF + cylinders (TECHNICAL_ARCHITECTURE) |
| 03 Player controller | Done | Unit tests; e2e walk into the cave |
| 04 Surface world | Done | CinderRain streamed LOD terrain |
| 05 Landmarks | Partial | Outpost, reactor, rover, drill, cave sites; PDA map; dev teleports |
| 06 Rock scatter | Done | Instanced, splat-driven, mouth kept clear |
| 07 Materials/atmosphere | Partial | No dust storm yet |
| **08 Cave geometry** | **Done** | SDF cave (mouth, throat, hall, west room, deep passage, ice chamber) meshed by surface nets in a Web Worker (~57k tris, ~2 s); terrain mouth cut generated from the same SDF; unit tests: walkable floor + 2.1 m headroom on every passage, mouth opens to the outside, deep chambers sealed under >60 m of rock, winding correct |
| **09 Cave geology & ice** | **Done** | Triplanar cave rock, strata, dust on ledges, baked AO, frost near the ice; daylight fades with depth (sun/sky only — lamp unaffected); layered water-ice deposit, frozen pool, ice columns/icicles, Expedition 1 survey lamp, 5 survey beacons, equipment case, debris; e2e reaches every clue |
| 10 Base systems | Partial | No power simulation consequences yet |
| 11 Rover | Partial | No driving yet |
| 12 Drilling | Partial | No fault state |
| 13 Interactions | Done for current needs | Access/inspect/activate/recharge; status text; focus cone |
| 14 PDA | Partial | Map, missions, logs; now persisted via saves |
| 15 Story | Partial | 8-step route: terminal → rover → drill → cliff → beacons → ice → report; drafts flagged |
| 16 Survival | Partial | O₂/power/health; lamp drains power |
| **17 Audio** | **Partial** | Procedural WebAudio: muffled Mars wind, suit hum, breathing, footsteps, cave rumble + reverb + ice drips, positional drill, UI cues; volume setting; starts on user gesture. Not yet heard by a human |
| **18 Save/load** | **Done** | IndexedDB, versioned schema with migration (v1→v2) and validation; autosave (30 s, objectives, pause, tab hide); Continue; confirmed reset. Unit tests + e2e reload/Continue |
| 19 Optimisation | Partial | Headless Intel UHD numbers only |
| 20 QA | Partial | e2e 23/23 on dev **and** production build |
| 21 Build | Partial | build + preview verified; not deployed |

## Not yet verified by a human
Mouse feel/pointer lock, audio mix, RTX 4050 frame rate in a visible window.

## Next task
1. Human playtest (Chrome, RTX 4050): walk the full route, listen to the audio, report FPS (F3).
2. Rover driving (Phase 11) and power simulation affecting facilities (Phase 10).
3. Dust storm event with visibility/audio and base power response (Phases 16–17).
4. Post-processing (bloom, subtle film grain) behind the quality setting.
