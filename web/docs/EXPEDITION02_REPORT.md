# EXPEDITION 02 — Development Report (overhaul pass, 2026-11-15)

Governing documents: the user's **"GAME IDEATION (4)" master directive** (Parts 1–16) and **"GAME CUTSCENES AND OBJECTIVES"**
(the cinematic script). This report covers what was actually implemented, what was tested, and what is still missing.

## 1. Features implemented

| Directive part | What exists now | Main files |
|---|---|---|
| 2 · Orbital Command menu | A real-time 3D Mars renders behind the menu: NASA Viking MDIM colour mosaic + MOLA-derived relief, Minnaert limb darkening, reddened terminator, thin limb haze/scattering shell, NASA Tycho star map + procedural nebula, 6 000 twinkling stars, sun and Earth sprites, Phobos/Deimos (NASA textures, real orbit radii), 3 relay satellites on dashed orbits, an orbital station, the EXPEDITION 02 spacecraft orbiting, and drifting particles. The menu shows EXPEDITION 02 / EXPLORE. DISCOVER. SURVIVE., NEW EXPEDITION · CONTINUE MISSION · SETTINGS (controls included) · CREDITS · EXIT, plus a live orbital telemetry read-out. | `src/space/spaceScene.ts`, `src/ui/screens.ts` (MainMenu), `styles.css` |
| 3 · Interactive Mars | Hovering Mars highlights it and clicking selects it: the camera eases in, a survey grid and landing-site ring appear on the globe, and the mission sidebar slides in. The sidebar holds destination/designation/status, the overview text, NASA Fact Sheet data (diameter, gravity, temperature, atmosphere, pressure, distance, sol), the landing region, and LAUNCH EXPEDITION. Close (×) returns to orbit. Mission Control voices the briefing (script scene 02). | `main.ts` (orbital menu block) |
| 4 · New-expedition cinematic | It plays only after NEW EXPEDITION → LAUNCH (CONTINUE loads the save directly). The sequence runs: the user's narrated prologue, then **space** (HyperFrames title, top-down → chase on the transit vehicle, flip + orbit-insertion burn, porthole reveal → wide shot of the craft against Mars, transit-stage separation, atmospheric entry with plasma, buffeting and radio interference), then **surface** on the real terrain (3 parachutes, heat-shield jettison, backshell cut-away, powered descent with exterior / landing-gear / cabin / ground cameras and the altitude call-outs, touchdown dust burst, leg compression, dust settling, hatch, astronaut steps out), then a hand-off to first person beside the lander. Each segment is skippable (Space ×2). It is cut to the measured length of every voice line. | `src/cinematics/opening.ts`, `landingFx.ts`, `src/space/spacecraft.ts` |
| 5 · Objective cinematics | An event-driven **campaign director** runs the script's 8 chapters + epilogue (**45 objectives**). Each objective has an approach moment (proximity/start → dialogue ± camera), gameplay activation, and a completion moment (unique camera + dialogue). Eight camera grammars (push, glance, orbit, reveal, pan, crane, establish, track) are parameterised per objective with its own subject, framing, timing and lines. Bespoke sequences: emergency power (lights come up in steps), the ice-chamber reveal (major event, physically discovered, then a WATER ICE DETECTED card), the archived 2035 video, the storm time-lapse, the final assessment, the three recommendations, and the finale. Flags (`appr.*`, `done.*`, `s.*`) are saved, so nothing replays. Skipping never affects progress. Chapter title cards appear between chapters. | `src/campaign/director.ts`, `cines.ts`, `props.ts`, `src/missions/missions.ts`, `records.ts` |
| 8 · Manned vehicle | MEV-1 = the user's **VEHICLE.glb**, auto-normalised from its wheel nodes. Wheels are re-pivoted for spin and steering, and the driver door swings open on enter and exit. Driving has throttle/brake/reverse, bicycle-model steering, Mars-gravity slope term, 4-probe pitch/roll, per-wheel suspension travel, collisions, battery drain, charging in the hangar bay, headlights (L) and steering-wheel animation. Cameras: chase (collision-aware, suspension bob) and cockpit (C). The HUD shows speed, battery and condition. It lives in a new procedural **hangar** on the west apron (rolling door, light strips, workbench, charging pad, status wall, maintenance terminal). | `src/vehicles/mannedVehicle.ts`, `src/campaign/props.ts` (GarageProp) |
| 9 · Remote rover via PDA | R-1 (**ROVER.glb**) can no longer be boarded. PDA › Rover R-1 › TAKE REMOTE CONTROL drives the real rover in the world: the mast camera is the default view (pan/tilt/zoom), C switches to chase, G scans, E/Tab ends the link. Relay signal strength falls with distance (link lost past ~3.2 km). The PDA still shows telemetry and the live feed. Rover position and state are saved. | `main.ts` (vehicles block), `src/ui/screens.ts` |
| 10 · Distances | New sites follow the directive's bands: lander → outpost ~190 m (major objective, walkable over the ridge), hangar 52 m from the dome, facilities inside the outpost 5–30 m. Long legs (survey point 570 m, DRL-2 / cave ~1.6 km, facility) are vehicle legs. | `core/config.ts`, `main.ts` |
| 13 · Audio | Engine/entry rumble bed, storm wind, PDA "device" voice treatment, an "archive recording" treatment for Expedition One, radio squelch on Mission Control, sentence-paced subtitles, and an interference overlay during entry. | `src/audio/audio.ts`, `voice.ts` |
| 14 · Saves | **Save v4.** v3 saves migrate: the old objective index maps to the same story point and earlier objectives are marked done. MEV-1 state is saved. Overwriting a save always asks for confirmation (New Expedition and Launch). | `src/save/saveSystem.ts` |

Chapter 4 adds a dust storm: fog, sun dimming, heavy dust motes and wind, driven by the story and eased.

## 2. MCPs, plugins and tools — actually used / not usable

| Tool | Result |
|---|---|
| **ElevenLabs (local MCP + REST key, free tier)** | **Used.** Generated **52 new voice lines** (113 new lines in total with the PDA; 12 earlier lines kept) for every human character: Mission Control = Daniel, Astronaut = Will, rover = River, Expedition One researcher = Lily (premade voices). The account went from 2,094 to 6,469 / 10,000 characters (3,531 left this month). |
| **ElevenLabs (claude.ai connector)** | **Could not be used.** The first generation failed: *"Unusual activity… Free Tier access has been disabled"* (that account would need a paid plan). Nothing was spent. |
| **Kokoro-82M (free, Apache-2.0)** | **Used** as the free fallback the user allowed, for the **PDA** voice (`af_heart`, offline, 61 lines). The earlier Sarah takes of 7 PDA lines are kept in `assets-src/audio/voice/pda_sarah_takes/`. |
| **HyperFrames (local skills + CLI 0.9.46 + FFmpeg)** | **Used.** Authored and rendered the EXPEDITION 02 title sequence (`assets-src/hf-title`, check: no errors) to a transparent WebM, `public/assets/video/title_expedition02.webm`, which plays over the opening's first shot. The hosted HyperFrames MCP's `compose` is disabled for CLI agents by design. |
| **Higgsfield (claude.ai connector)** | **Could not generate.** The connector is read-only (balance, model list, history). The account has 10 free credits and no generations. Only reference/catalogue access was possible. |
| **Tripo** | **Not available.** It was only reachable through the Blender MCP add-on, Blender was dropped earlier, and the Blender MCP server failed to connect this session. The spacecraft, lander, parachutes, hangar and campaign props are procedural three.js models instead. |
| **NASA data** | **Used.** NASA 3D Resources: Mars colour mosaic, Phobos, Deimos, Tycho star map, Earth. PDS MGS MOLA MEGDR 4 px/deg topography for the globe relief. NASA Fact Sheet values appear in the sidebar. |
| **Playwright / CDP tooling** | **Used** for all browser verification (`tools/check-orbital.mjs`, `tools/check-campaign.mjs`, specs). |

## 3. Assets generated and integrated
- `public/assets/space/*`: Mars colour/normal/height, Phobos, Deimos, Earth, star map (`tools/build-space-textures.mjs`).
- `public/assets/audio/voice/*.mp3`: 113 new lines. `src/audio/voiceDurations.json` is from `tools/voice-durations.mjs`.
- `public/assets/video/title_expedition02.webm` (HyperFrames).
- Procedural: spacecraft (transit stage, aeroshell, lander HORIZON, parachutes); hangar; reactor console; electrical panel; water recycler; O₂ generator; lab station; holo-map table; survey beacon; Expedition 1 survey station; equipment case; original research facility.

## 4. Tests performed
| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `tools/check-campaign.mjs` (headless Chrome, RTX 4050): **all 45 objectives in order → finale → end card**, real interactables, cinematics skipped like a player, MEV-1 boarded and driven, R-1 remote link + scan | **ALL OBJECTIVES COMPLETED · 0 console errors** |
| `tools/check-orbital.mjs --opening`: menu renders (≈144 FPS headless), Mars click opens the sidebar, Launch → prologue → space opening → landing → gameplay at the lander | pass (frames reviewed in `tools/out/orbital_*.png`) |
| `tools/check-vehicle.mjs`: hangar + MEV-1 render | pass (after the environment-lighting fix) |
| Playwright `tests/browser` (8 specs: audio, body, cinematics, facilities, inventory, outpost ×2, pda) | **8/8 passed** (final run, 4.7 min) |
| HyperFrames `check` on the title composition | 0 errors (2 craft warnings accepted: intentionally empty first frame of an overlay; small coordinates text) |
| Vitest unit tests | **not runnable here** (environment issue, see limitations) |

Bugs found and fixed by these runs: props crashed on `Object.assign` to a read-only `position`; the archive recording could hang
without audio; MEV-1 rendered as a black silhouette (near-black metallic materials without an environment); several opening
shots framed Mars's night side or empty space; automated test views were interrupted by story cinematics.

## 5. Remaining limitations (honest)
- **Astronaut model / hands / foot IK (Part 6):** no new model work this pass. The existing procedural idle/aim layer stays. Finger articulation, heel-to-toe and slope foot IK are not implemented. Tripo was unavailable for suit parts.
- **Terrain (Part 11):** the play area is still the user's CinderRain terrain. NASA data is used for the orbital globe only (no HiRISE DEM import). The landing region is labelled "Arcadia Planitia (NASA ice-mapping target) — local terrain fictional" in-game.
- **Ch.4 storm** has no exterior shutters in the outpost model. Storm mode dims the lights instead.
- **Orbital close-ups:** the NASA colour mosaic is 1440×720, so very close orbit shots look soft despite the shader micro-detail; a higher-resolution mosaic (e.g. USGS Viking MDIM 2.1 tiles) would fix it.
- **Opening:** the cabin and landing-gear views are camera placements with overlays, not modelled interiors.
- Interior cinematics are deliberately short push-ins and glances, so cameras cannot pass through the outpost's walls.
- **Unit tests (Vitest)** cannot run in this environment right now: even a one-line probe test fails with "Vitest failed to find the current suite" (Node 26.13 + Vitest 5.1.0). This is not caused by game code.
- The older `tools/e2e.mjs` mission walkthrough targets the pre-campaign 7-objective chain. Its mission steps are superseded by `tools/check-campaign.mjs`. `tests/browser/rover.spec.ts` (boarding R-1) and `voice.spec.ts` (old objective triggers) were moved to `tests/legacy/`.
- ElevenLabs free-tier output is non-commercial / attribution-required. Rotate the API key that was pasted in chat earlier.
