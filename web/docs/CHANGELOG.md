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
