# Test Plan

## Automated
| Suite | Command | Covers | Last result (2026-11-14) |
|---|---|---|---|
| Typecheck | `npm run typecheck` | All src + tests | Pass |
| Unit | `npm test` | PNG decoder; heightfield range, continuity, seams, sites; controller; missions; suit; **cave walkability, headroom, sealing, mesh winding/AO; save schema migration/validation** | 21/21 pass |
| Screenshots | `npm run shot` | menu, spawn, rover, drill, cliff, vista render with no console errors | 6/6 views, 0 errors/warnings |
| End-to-end | `npm run e2e` (dev) / `node tools/e2e.mjs http://localhost:4173/` (production) | Load → terminal focus + E → record → close → airlock focus → rover log → PDA open/close → drill start/complete → cliff base → end-of-build card; console clean | 23/23 on dev **and** production build (now: cave walk with real collision, lamp, beacon, ice scan, report, save → reload → Continue) |

The e2e uses a `?e2e` hook only to position/aim the player; key presses go through the real `Input` → `InteractionSystem` → `MissionState` path.

## Manual (cannot be automated headless)
1. Pointer lock: New Game → Begin captures the mouse; Esc pauses; Resume re-captures; Tab opens/closes PDA and re-captures.
2. Walk from the outpost to the rover (≈1.4 km) without falling through terrain or hitting invisible walls; LOD changes not distracting.
3. Climb toward a cliff: blocked above ~40°, slides back on steep ground.
4. Let oxygen fall (or wait): warning at 30%, critical at 10%, failure card, recovery at outpost.
5. Settings: sensitivity, invert Y, quality Low/High change immediately and persist after reload.
6. Resize the window; switch tabs and come back.
