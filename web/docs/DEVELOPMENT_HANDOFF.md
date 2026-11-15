# Development Handoff

_Last updated: 2026-11-15 — Claude Opus 5.5 (session 3, continued; a Fable session was started and ended without changes)._
Read this first, then `DEVELOPMENT_STATUS.md`, `ASSET_REGISTER.md`, `TECHNICAL_ARCHITECTURE.md`, `NARRATIVE_SOURCE_OF_TRUTH.md`, `VISUAL_DIRECTION.md`.

## Governing documents
1. Original browser master plan (`Cinderfall_2_Browser_Game_Full_Master_Plan.pdf`, Phases 00–21) — applied in `PROJECT_MASTER_PLAN.md`.
2. **Directive "Complete Gameplay Systems, Functional Development & Asset Integration"** (`CINDERFALL-2.pdf`, Systems A–R, Phases 00–14).
   Supersedes the phase numbering of (1) going forward; existing verified work is kept.
3. User outpost layout reference (top view): central MAIN OUTPOST dome; FARM west; STORAGE east; COMMUNICATIONS & SHIELDS north; EXIT south.
4. User toolkit request (2026-11-15): Tripo MCP, HyperFrames, Blender MCP (keep); Theatre.js, Rapier, Playwright (+MCP), glTF Transform,
   three-mesh-bvh, ElevenLabs (Lauren narrator) — see "Toolkit" below.

## Current phase / task
- **Phase 00 audit — DONE.** **Outpost integration — VERIFIED.** **Toolkit — VERIFIED** (Blender dropped by the user; FFmpeg pending).
- **Phase 04 Inventory & resource collection (Systems E + F storage) — VERIFIED 2026-11-15** (see below).
- Next: Phase 05 survival (hydration/food/stamina/exposure, habitat protection via zones) → Phase 07 power grid / colony.

## Phase 04 — Inventory, ore, storage (2026-11-15) — VERIFIED
| Part | Files | Status |
|---|---|---|
| Item catalogue (tools, consumables, mineral samples — real mineralogy, gameplay numbers) | `src/inventory/items.ts` | VERIFIED |
| Inventory (20 slots, stacking, move between containers, tolerant load) + Hotbar (5 quick slots) | `src/inventory/inventory.ts` | VERIFIED (unit) |
| MineableOre / OrePickup: 6 deposits (hematite, olivine, gypsum) near outpost, rover, DRL-2, cliff; procedural crystal clusters per mineral; samples drop toward the player and bob | `src/inventory/ore.ts` | VERIFIED |
| Rock drill = user `drill.glb` as first-person tool (`opt/handdrill.glb`), raise/lower, walk sway, judder while drilling; grind sound | `src/player/toolViewmodel.ts`, `audio.ts` | VERIFIED (screenshot) |
| Quick slots 1–5 + **Q** to use consumables (O₂ +35, battery +40, med kit +40 health) | `main.ts`, `ui/hud.ts` | VERIFIED |
| Supply locker (procedural cabinet, hinged doors animate open/closed, interior light) in the Storage bay's NW corner; deposit/retrieve screen | `src/base/locker.ts`, `src/ui/inventoryUi.ts` | VERIFIED |
| PDA **Inventory** tab with item inspection; optional objective "Collect mineral samples (3)" in Missions | `src/ui/screens.ts` | VERIFIED |
| Discovery records (identity, description, location, Sol/mission time) → PDA Logs | `src/inventory/discoveries.ts` | VERIFIED |
| Save **v3** (inventory, hotbar, storage, ore yields + dropped samples, discoveries) with v2→v3 migration (starting kit, stocked locker) | `src/save/saveSystem.ts` | VERIFIED (unit + reload test) |
Integration (directive Example 2): collect ore → inventory → hotbar/PDA counts → optional objective → discovery record → autosave → survives reload.
Tests: `tests/inventory.test.ts` (9), `tests/save.test.ts` (5), `tests/browser/inventory.spec.ts` (full loop in Chrome, real key presses).
Controls added: 1–5 select, Q use item. New-game kit: rock drill, scanner, 1 med kit, 1 O₂ canister, 1 battery; locker: 3 O₂, 2 batteries, 2 med kits.

**Correction:** the Farm greenhouse is at world **+X** and Storage/vehicle bay at **−X** (earlier notes had them swapped; tests now say
"−X tunnel → Storage", "+X tunnel → Farm"). The visual layout still matches the user's plan; see the mirrored-labels issue.

## Last verified working state (2026-11-15)
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` (Vitest) | 24/24 (21 game + 3 toolkit: Rapier, three-mesh-bvh, Theatre.js) |
| `node tools/e2e.mjs` (CDP, RTX 4050 via `CF_GPU=high`) | **30/30** incl. outpost walk-in, airlock door open/close, walls, all 3 tunnels, full mission, save → reload → Continue |
| `npx playwright test` (`CF_URL` = fresh dev server) | **3/3** — Theatre Studio, boot with no console errors, airlock walk-in |
| `node tools/e2e.mjs` after the Theatre fix | **30/30** |
| `npm test` after the Theatre fix | **25/25** (adds a "director becomes ready without Studio" regression test) |

**Bug found and fixed by the browser tests:** Theatre's `project.ready` never resolves without Studio unless saved state is passed;
an empty `state.json` hung boot at "Surveying the cave". `state.json` is now a valid minimal export, the director always passes state,
and boot never waits more than 3 s on cinematics (warns instead).
| Dev server | `npm run dev` → http://localhost:5173/ (a server was already running on 5173) |

## Outpost integration (done this session)
- Source `assets-src/models/main base (1).glb` (385 MB; originals moved out of `public/`, SHA-256 verified identical, `ORIGINALS_SHA256.json`,
  gitignored) → `npm run optimize-models` → `public/assets/models/opt/outpost.glb` (12.3 MB, 111 meshes / 117 primitives, 841 k tris,
  textures 512² WebP, meshopt). Also optimised: astronaut (477 → 10.4 MB, Walk/Idle/Run kept), rover, vehicle, handdrill.
- Placement: scale 1.0, no rotation, dome centre on (−1250, 1150), terrain levelled by `WorldData.flattenRect` (pad = mean core height).
  Rocks kept out of the footprint. Spawn moved to just outside the south airlock (`SPAWN` in `core/config.ts`).
- Collision generated from the art: `src/world/structureGrid.ts` (0.25 m cells; floors from up-facing tris, solids from tris in the
  0.45–1.85 m body band; ~600 ms at load). Two invisible single-sided panels at the W/E tunnel mouths are opened via `OUTPOST_MODEL.openings`.
- Doors (System G, first door): `src/world/doors.ts` — auto-opening, eased (smootherstep), holds open while near, closes after 1.5 s,
  blocks collision while not open, procedural servo/hiss sound. South airlock leaf `CF_DOOR_south` is split out of the fused source mesh
  by the optimiser (`splitParts`) and sinks 4.4 m into the floor.
- Distance culling of small base meshes (`OUTPOST_LOD`); only big meshes cast sun shadows.
- Performance (headless, 1600×900): RTX 4050 — 46–60 FPS at/inside the base, 60 elsewhere; Intel UHD — 15–17 FPS at the base (below target).
- Diagnostics: `node tools/outpost-grid.mjs dx0 dx1 dz0 dz1 [step]` prints the collision map + owning meshes.

## Toolkit (2026-11-15)
| # | Tool | Status | Version / where | Verification |
|---|---|---|---|---|
| 1 | Tripo | **Available through Blender MCP** (community add-on has Tripo/Hyper3D/Sketchfab/Poly Haven generation → MCP tool `generate_3d`). Official standalone `tripo-mcp` 0.1.2 is alpha, unmaintained since 2025-04 and Blender-only → **not installed** (would duplicate) | — | Tripo API key is entered in Blender's add-on panel (user) |
| 2 | HyperFrames | CLI works via `npx -y hyperframes@0.9.46` (Apache-2.0, HeyGen). **No skills/plugin installed yet; FFmpeg missing** | 0.9.46 (2026-11-14) | `hyperframes --version`, `doctor`: Chrome ✓, FFmpeg ✗, FFprobe ✗ |
| 3 | Blender MCP | Blender 5.3 has **two** MCP add-ons, both on port **9876** (conflict): community `mcp-for-blender` (v2.x, `scripts/addons/blender_mcp.py`) and Blender Lab's official `MCP` 1.0.3 (extension). Claude-side server registered: `uvx mcp-for-blender==2.2.9` in `D:\Cinderfall2\.mcp.json` | 2.2.9 | MCP handshake ✓ (server "MCP for Blender" 1.30.0, 10 tools). Live Blender calls need Blender open with one add-on running |
| 4 | Theatre.js | `@theatre/core` (dep), `@theatre/studio` (devDep). `src/cinematics/director.ts`: camera sheet "Outpost flyover" relative to the dome; `?studio` (dev only) opens Studio and the menu camera follows it; `?cine` plays the saved sequence; state in `src/cinematics/state.json` (empty until authored) | 0.7.2 | Vitest: keyframed sequence evaluates ✓; Playwright Studio test — see results |
| 5 | Rapier | `@dimforge/rapier3d-compat` (dep). Not yet used by gameplay: planned for the drivable rover (Phase 08) and loose physics props; the player keeps the analytic controller | 0.21.0 | Vitest: body falls under Mars gravity and rests on ground ✓ |
| 6 | Playwright + MCP | `@playwright/test` (devDep), `playwright.config.ts`, `tests/browser/*.spec.ts`, system Chrome (`channel: 'chrome'`, no browser download). MCP `@playwright/mcp@0.0.85` registered in `.mcp.json` | 1.65.1 / 0.0.85 | MCP handshake ✓ (25 tools); test runs — see results |
| 7 | glTF Transform | Libraries (core/extensions/functions) + CLI (devDeps); pipeline `tools/optimize-models.mjs` | 4.5.1 | Used for all optimised models; `npx gltf-transform inspect` ✓ |
| 8 | three-mesh-bvh | dep; planned for interaction raycasts / structure queries | 0.9.18 | Vitest: BVH raycast equals brute force ✓ |
| 9 | ElevenLabs | MCP `uvx elevenlabs-mcp==0.12.2` registered in `.mcp.json` with `ELEVENLABS_API_KEY=<redacted — set ELEVENLABS_API_KEY locally>` (expanded from the environment; key never stored in files). Audio output → `assets-src/audio/voice/` | 0.12.2 | Package installs and starts; exits with "ELEVENLABS_API_KEY … required" (expected without a key) |

**Update 2026-11-15 (after the user supplied the key):**
- ElevenLabs key stored as the Windows **user** environment variable `ELEVENLABS_API_KEY` (not in any file). Account: **free tier**,
  60 / 10 000 characters used. **Rotate the key** (it was pasted into chat) and replace the env var value.
- MCP handshake with the key ✓ — server "ElevenLabs" 1.30.0, 27 tools (text_to_speech, search_voice_library, …).
- **Lauren confirmed** via the ElevenLabs shared-voice API: `DODLEQrClDo8wCz460ld` = "Lauren - Friendly, Comforting and Soft"
  (female, American, conversational). She is **not yet in the account's My Voices** (`GET /v1/voices/{id}` → 400), so TTS with her needs
  her added first (account change → user approval). Free-tier output is non-commercial/attribution-required per ElevenLabs' plan terms —
  check before shipping narration.
- **HyperFrames:** `/plugin` is unavailable in the VS Code extension, so the official skills were installed project-scoped with
  `npx skills@1.8.1 add heygen-com/hyperframes --agent claude-code` into `D:\Cinderfall2\.claude\skills`; kept `hyperframes`,
  `hyperframes-cli`, `hyperframes-registry`, `media-use` (removed unrelated figma/slideshow/remotion/reverse-video/style-sampling).
  `hyperframes skills check` ✓ 4 current. HyperFrames telemetry (PostHog, on by default) **disabled** (`npx hyperframes telemetry disable`).
- **Blender: dropped by the user's request** ("forget blender"). The `blender` entry stays in `.mcp.json` but is unused; remove it if wanted.
  Tripo therefore is not available (it only worked through Blender).

`.mcp.json` (project scope, `D:\Cinderfall2\.mcp.json`): playwright, blender, elevenlabs. Claude Code asks for approval of project servers on
first use; restart the Claude Code session (or run `/mcp`) to load them. Probe any server with `node tools/mcp-probe.mjs <command> [args]`.

Notes: `npm audit` reports 4 moderate advisories inside the dev-only glTF Transform **CLI** (glob/minimatch via its arg parser); not
shipped, affects only CLI use on untrusted paths. The Blender MCP server's telemetry is opt-in (uploads screenshots if consented) — decline.

## Requires the user's action / authorisation
1. ~~ElevenLabs API key~~ done. **Rotate the key** later (pasted in chat). **Approve adding Lauren to My Voices** + a short test line.
2. **FFmpeg** for HyperFrames rendering (system-level install): `winget install --id Gyan.FFmpeg -e`, then restart VS Code.
3. ~~HyperFrames Claude integration~~ done (project skills).
4. ~~Blender~~ dropped.
5. Restart the Claude Code session in `D:\Cinderfall2` and approve the project MCP servers (playwright, elevenlabs) when prompted.

## Known issues
- **Mirrored world labels (pre-existing):** the renderer is right-handed; with +Z = north, +X appears to the **west** on screen, but the
  HUD/compass/heading treat +X as east (turning right *decreases* heading; compass marker and world marker disagree — see door.png).
  The outpost itself renders correctly (top view matches the user's plan). Fix options: relabel east = −X in heading/compass/minimap/PDA
  (UI-only) or re-import CinderRain with z = −Y (regenerates tiles and moves every site). Needs a decision.
- Intel UHD frame rate at the base is 15–17 FPS (target hardware RTX 4050 runs 46–60).
- Headless runs that reload the full game 5+ times in one tab can exhaust GPU resources (texture decode / shader validate errors); single
  loads are clean.
- Older known issues: see `KNOWN_ISSUES.md`.

## Files created / modified this session
New: `src/base/outpostModel.ts`, `src/world/structureGrid.ts`, `src/world/doors.ts`, `src/cinematics/director.ts`, `src/cinematics/state.json`,
`tools/inspect-glb.mjs`, `tools/optimize-models.mjs`, `tools/glb-heaviest.mjs`, `tools/glb-find.mjs`, `tools/glb-components.mjs`,
`tools/outpost-grid.mjs`, `tools/mcp-probe.mjs`, `tests/integrations.test.ts`, `tests/browser/*.spec.ts`, `playwright.config.ts`,
`D:\Cinderfall2\.mcp.json`, `docs/DEVELOPMENT_HANDOFF.md`.
Modified: `src/main.ts`, `src/world/worldData.ts` (meanHeight, flattenRect), `src/world/rocks.ts` (keepOut), `src/cave/ground.ts`
(structures), `src/player/controller.ts` (structure collision), `src/core/config.ts` (spawn), `src/audio/audio.ts` (door sound),
`vite.config.ts` (vitest include), `tools/e2e.mjs`, `tools/shoot.mjs`, `tools/cdp.mjs` (`CF_GPU=high`), `.gitignore`, `package.json`,
`docs/ASSET_REGISTER.md`.

## Key technical decisions
- Outpost = user model at scale 1.0; collision derived from the model's triangles (no hand-placed colliders).
- `drill.glb` is a hand drill → first-person tool; the DRL-2 drilling machine stays procedural.
- `VEHICLE.glb` vs `ROVER.glb` for the drivable rover: decide in Phase 08 (VEHICLE keeps separable parts).
- Rapier is for vehicles/props, not the player controller (the analytic controller is verified and exact on the heightfield).
- Theatre Studio is dev-only; shipped builds use `@theatre/core` + exported JSON state.

## Overhaul pass 1 (2026-11-15, user's "full immersive overhaul" brief) — Priority 1 items
Two Claude sessions work in parallel: **cinderfall2-33** owns cutscenes (`src/cinematics/{cutscene,actor,scenes}.ts`, Mode 'cutscene',
`.cine` CSS, `AudioEngine.pad()/cue()`, e2e cutscene skips); **cinderfall2-e1** (this file's author) owns the items below. Edit `main.ts`
only with small edits; re-read first.

| Item | Files | Status / evidence |
|---|---|---|
| Hand drill blown out white (user screenshot) — cause: helmet lamp 0.4 m behind it. Tool now drawn in its own pass with own lights (sun dir, cave daylight, soft lamp fill), never clips walls; 34 cm | `src/player/toolViewmodel.ts` | VERIFIED (cave+lamp and daylight screenshots) |
| **Rover R-1 drivable** — user ROVER.glb; fused wheel mesh split at load (bounding-box clustering → 6 wheels; quantised attributes expanded first); kinematic drive (throttle/brake/drag, Mars-gravity slope term, 28° slope limit, pivot turns, corner-wheel steering, 6-probe pitch/roll, per-wheel suspension travel), collisions with structures/colliders, battery drain + charging pad south-east of the airlock, condition damage; chase camera (orbit + zoom) and **mast camera** (pan/tilt/zoom); board/exit (locked until the R-1 diagnostic objective); HUD rover panel; saved in v3 (`rover` optional) | `src/vehicles/drivableRover.ts`, `main.ts`, `ui/hud.ts`, `core/input.ts` (wheel) | VERIFIED `tests/browser/rover.spec.ts` |
| **Astronaut body + third person (V)** — user astronaut.glb via the cutscene `Actor` (own instance); idle/walk/run by measured speed, stride-matched; faces travel; over-the-shoulder camera blocked by structures and cave rock; hides when forced < 1.2 m | `src/player/playerBody.ts` | VERIFIED `tests/browser/body.spec.ts` |
| **PDA** — holographic open/close animation; new tabs **Environment** (NASA REF values with source on hover: mean pressure, composition, gravity, RAD dose; SIMULATED: local Sol time, temperature model, local pressure, dose with shielding) and **Rover R-1** (telemetry + **live mast-camera feed** rendered off-screen, refreshed 2×/s); every tab tested | `src/ui/screens.ts`, `main.ts`, `styles.css` | VERIFIED `tests/browser/pda.spec.ts` |
| Disk: C: hit 0 MB — 6.1 GB of headless-Chrome profiles left by `tools/cdp.mjs`/`shoot.mjs`; deleted; tools now use `D:\Cinderfall2\.tmp` and remove profiles after each run | `tools/cdp.mjs`, `tools/shoot.mjs` | VERIFIED (C: 6.2 GB free) |

Not done yet from the brief (honest status): first-person arms (body is third-person only), jump/land/interaction animations
(no such clips in the model — need procedural layers), NASA DEM/HiRISE terrain import (CinderRain is the user's terrain; a NASA/MOLA/HiRISE
data pass is a separate task), cave expansion/branches + ice shaders, rover instruments (scan/photo/mark), audio logs (ElevenLabs Lauren
not yet added to the account's voices — needs user OK), story acts 1–4 (the user has now authorised writing the full story; not started
in this session — cinderfall2-33 is building cutscenes).

**Verification after overhaul pass 1:** typecheck ✓ · Vitest 35/35 · Playwright 7/7 (body, cinematics, inventory, outpost ×2, pda, rover)
· `node tools/e2e.mjs` **32/32** (now skips the ice + transmission cutscenes with Space ×2 like a player; cliff check waits on state).
Test tooling: `cdp.mjs` fails fast if an orphaned browser holds port 9333 (an interrupted run had left one, which made every later
run hang). C: free space was 1.8 GB at the end of the session: Blender autosaves in %TEMP% (~820 MB, user's), uv cache (~800 MB),
npx cache (~380 MB) — not deleted; user decision (see report).

## Last full verification (2026-11-15, after Phase 04)
typecheck ✓ · Vitest 35/35 · Playwright 4/4 (`CF_GPU=high npx playwright test`) · `node tools/e2e.mjs` 30/30 · RTX 4050 60 FPS in the
deposit/storage views.

## Exact next steps
1. Record the Playwright results (re-run `CF_GPU=high npx playwright test`) in this file.
2. User items above (ElevenLabs key, FFmpeg, HyperFrames plugin, Blender add-on choice).
3. Decide the east/west labelling fix.
4. Commit the session's work (branch `web-vertical-slice`; GLBs and `public/` stay untracked).
5. Directive Phase 04 inventory/ore + Phase 07 power grid using the outpost zones (Farm/Storage/Comms/dome).

## EXPEDITION 02 overhaul — pass 1 (astronaut + visor)

**Done and verified in Chrome (screenshots in `tools/out/intro_v*.png`):**
- `src/player/astronautMotion.ts` — an aim-IK procedural layer on the Mixamo rig.
  - Arms rest relaxed at the sides (they no longer sit locked in front), and the body breathes and shifts weight.
  - The head follows the view direction.
  - Randomised idles with cooldowns: checkWrist, checkPalm, adjustGlove, lookAround, suitStatus, wristRoll. They yield to movement, interaction and cutscenes.
- `src/cinematics/visor.ts`:
  - `VisorRig` is a layered physical visor: dark metal shell, gold thin-film iridescence, clear coat, and a procedural scratch/dust/smudge roughness map. Its reflections come from a live cube-camera probe at the helmet, which runs only while active.
  - `DebrisGust` blows rock fragments and soft dust under Mars gravity.
- Narrated intro now has 9 shots. Shot 6 is a visor push-in beside Rover R-1: 4.2 m → 0.78 m, fov 38 → 26. The close-up lands on "You are one of them!". Debris crosses the frame and shows in the visor reflection. Hooks are `IntroWorld.visor` (narratedIntro) → main `playNarratedIntro`.
- Test API:
  - `seekCutscene(t, play?)` can resume playback, so cues fire.
  - `state()` exposes `cutT`, `cutLen` and `visorOn`.

**Regression:** unit 35/35; e2e 32/32; Playwright pda + cinematics pass.

**Not done yet (next passes):** cutscene pre/post buffer transitions, DOF, EXPEDITION 02 branding, weather/day-night, rover traction per surface, NASA terrain data, story/credits, and setting `body.busy` from gameplay modes.

## EXPEDITION 02 — pass 2: working outpost facilities

The logic is in `src/base/facilities.ts` (pure, unit-tested in `tests/facilities.test.ts`). The props are in `src/base/facilityProps.ts`, and main.ts wires everything up. State is saved as `SaveData.base`, which is optional, so older saves load with fresh facilities.

- **Farm** (+X module): 4 grow beds at dome-relative (21.3/25.6, ±2.1).
  - E cycles through Plant (uses a seed pack), Water, Harvest and Clear.
  - A crop takes 150 s to grow and its water lasts 100 s. A bed that stays dry for 120 s dies.
  - A harvest gives 2 food rations (+25 health), and a seed pack comes back 60% of the time.
  - Plants scale with growth, wilt and brown when dry, and show fruit when ripe. The grow lights glow when powered.
  - The first crew left bed 1 growing. The locker now stocks 3 seed packs.
- **Power**: 40.2 kW output against life support (31.5), shields (+6) and grow lights (1.2 per growing bed). In a deficit the grow lights are shed and crops pause, with HUD notices. The base status terminal now shows real power numbers and farm health.
- **Shields** (north module, east side): toggles the shield generator. The field spins up over 4 s and the rings spin faster as it rises. The habitat dose multiplier goes from 0.4 to 0.15, shown in PDA › Environment.
- **Comms** (north module, west side): the console screen shows live status.
  - E transmits new findings: each new discovery or batch of 3 samples earns 1 supply credit.
  - With nothing new to report, E spends a credit on a supply drop: 2 O₂, 1 battery, 2 seed packs and 1 ration, delivered to the locker after 45 s. Drops have a 180 s cooldown.
- **Test API**: `giveItem(id, n)`, `baseTick(seconds)`. `state().base` holds the beds, power, dose and prop positions.
- **Verified**:
  - `tests/browser/facilities.spec.ts` passes the full loop in Chrome (screenshots `tools/out/{farm_ready,shields_on,comms}.png`).
  - Unit tests 40/40; e2e 32/32.

## EXPEDITION 02 — master directive overhaul (2026-11-15, Claude Opus 5.5)
Full report: `docs/EXPEDITION02_REPORT.md`. Summary of the new structure:
- `src/space/` — orbital scene (NASA Mars colour + MOLA relief, star map, moons, satellites, station) and the procedural
  spacecraft (transit stage → aeroshell → 3 parachutes → lander HORIZON). Textures: `tools/build-space-textures.mjs`.
- Menu = ORBITAL COMMAND (`MainMenu` in `ui/screens.ts`; render branch "orbital view" in `main.ts`). Clicking Mars opens the
  mission sidebar; NEW EXPEDITION → briefing → LAUNCH plays prologue → `cinematics/opening.ts` (space + landing) → gameplay.
- Landing site `LANDING` + ridge `RIDGE` (`core/config.ts`); new games start beside the lander.
- Campaign: `missions/missions.ts` (45 objectives, chapters), `campaign/director.ts` (approach/activation/completion,
  flags `appr.*`/`done.*`/`s.*`), `campaign/cines.ts` (camera grammars), `campaign/props.ts` (all new props).
- Vehicles: MEV-1 (`vehicles/mannedVehicle.ts`, VEHICLE.glb, garage on the west apron) is driven; R-1 is remote-only via PDA.
- Voice: `tools/campaign-lines.mjs` merges the script into `audio/voiceLines.json`; ElevenLabs via `tools/generate-voice.mjs`
  (skips Kokoro speakers); PDA lines via Kokoro (`E:\DevCache\kokoro\gen.mjs`); `tools/voice-durations.mjs` → durations.
- HyperFrames title: `assets-src/hf-title` → `public/assets/video/title_expedition02.webm`.
- Save v4 (campaign migration from v3). Checks: `tools/check-orbital.mjs [--opening]`, `tools/check-campaign.mjs [--shots]`,
  `tools/check-vehicle.mjs`. Superseded specs in `tests/legacy/`.
- Known: Vitest cannot start in this environment (even a trivial probe fails); `tools/e2e.mjs` mission steps target the
  old 7-objective chain.
