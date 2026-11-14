# Project Master Plan

The full directive is the user's **Cinderfall_2_Browser_Game_Full_Master_Plan.pdf** (browser-first, no Unity, Phases 00–21).
This file records how it is being applied; per-phase progress lives in `DEVELOPMENT_STATUS.md`.

## Scope
A first-person browser game (Chrome/Edge, Windows 11) with a streamed Mars surface, a connected cave, the user's
rover/outpost/drill/astronaut models, rover/base/drilling interactions, PDA and objectives, the supplied story's
investigation elements, resource systems, saved progress and a tested production web build.

## Decisions taken
- **Terrain source:** the user's CinderRain data (6.1 km × 6.1 km, 2 m), not new procedural noise. Slightly larger than the
  5 km × 5 km target; the full extent is kept.
- **Layout:** browser game lives in `D:\Cinderfall2\web`; the earlier Unity project and offline Python pipeline stay untouched at the repo root.
- **Visual direction:** the master plan's reference images, captured in `docs/VISUAL_DIRECTION.md`.
- **Collision:** analytic heightfield + cylinders (no physics engine) — see TECHNICAL_ARCHITECTURE.
- **Mission sites:** outpost (-1250, 1150), reactor (-1335, 1225), rover (150, 900), DRL-2 drill (-20, -320), cliff base / future cave (-190, -305).

## Acceptance
Each phase's definition of done from the PDF applies; a phase is only marked Done in DEVELOPMENT_STATUS once verified.
