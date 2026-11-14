# Changelog

## 0.1.0 — 2026-11-14 — first playable vertical slice
- Phase 00 audit; Node.js LTS installed (approved).
- Vite + TypeScript + Three.js project in `web/`, alongside (not replacing) the earlier Unity attempt.
- CinderRain terrain streamed in the browser with LOD chunks, skirts, splat-blended layer materials, horizon backdrop.
- Mars sky, haze fog, low sun with shadows, drifting dust; instanced rock scatter with collision.
- Placeholder outpost (habitats, greenhouse dome, comms tower, dish, airlock, terminals), fission reactor, rover, drill rig.
- First-person controller with Mars gravity, slope limits and collision.
- HUD (objective, compass, minimap, vitals, tool bar, prompts), main menu, intro, pause, record reader, PDA (map/missions/logs).
- Suit O₂/power/health with warnings and recoverable failure.
- Four-step mission route: terminal → rover log → DRL-2 drill → cliff base.
- Model slots for user .glb files.
- Unit tests, headless screenshot tool, e2e mission test (dev + production build).

## 0.2.0 — 2026-11-14 — the cave, saving and sound
- Cave beneath the mesa south of DRL-2: signed-distance-field design shared by meshing, collision, tests and shaders;
  surface-nets mesher in a Web Worker; terrain (and its shadows) cut at the entrance by generated GLSL.
- Cave rendering: triplanar rock with strata, dust ledges, baked AO, frost near the ice; daylight blocked with depth
  while the suit lamp and the first expedition's lamp still light the rock; eye adaptation, dark fog, fewer dust motes.
- Suit lamp (F) with power drain; ice deposit, frozen pool, ice columns and icicles; five survey beacons pulsing deeper;
  Expedition 1 equipment case (optional record); breakdown debris; talus boulders at the entrance.
- Mission extended: beacons → spectrometer scan of the deposit → transmit findings at the outpost (end card).
- Save/load: versioned IndexedDB saves, migration, validation, autosave, Continue, confirmed new game.
- Procedural audio (no files), volume setting.
- Tests: cave walkability/sealing/winding, save schema; e2e extended to 23 checks including save → reload → Continue.
