import './ui/styles.css';
import { AnimationMixer, Box3, Color, PMREMGenerator, Group, MeshStandardMaterial, PerspectiveCamera, PointLight, SpotLight, Vector3, WebGLRenderTarget, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SIM_HZ, SITES, SPAWN, SUN_DIR, PALETTE, yawTowards, LANDING, RIDGE } from './core/config';
import { GameLoop } from './core/loop';
import { Input } from './core/input';
import { events } from './core/events';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { createRenderContext, FOG_DENSITY, type RenderContext } from './rendering/renderer';
import { loadLayerTextures } from './rendering/textures';
import { createSky } from './rendering/sky';
import { DustMotes } from './rendering/dust';
import { WorldData } from './world/worldData';
import { Terrain, QUALITY_HIGH, QUALITY_LOW } from './world/terrain';
import { createBackdrop } from './world/backdrop';
import { RockField } from './world/rocks';
import { ColliderSet } from './world/colliders';
import type { SlotResult } from './world/modelSlots';
import { buildOutpost, buildReactor } from './base/outpost';
import { loadOutpostModel, outpostKeepOut, prepareOutpostPad, type OutpostModel } from './base/outpostModel';
import { DoorSystem } from './world/doors';
import { CinematicDirector, maybeStartStudio } from './cinematics/director';
import cinematicState from './cinematics/state.json';
import { CutscenePlayer, type Pose } from './cinematics/cutscene';
import { Actor } from './cinematics/actor';
import { buildCutscene, CUTSCENE_IDS, type CutsceneId, type CutsceneWorld } from './cinematics/scenes';
import { DrillRig } from './base/drill';
import { buildRover } from './vehicles/rover';
import { DrivableRover } from './vehicles/drivableRover';
import { PlayerBody } from './player/playerBody';
import { Cave } from './cave/cave';
import { Ground } from './cave/ground';
import { NODES, caveDepthFactor, caveSdf, nearCave } from './cave/caveDef';
import { PlayerController } from './player/controller';
import { SuitSystem } from './player/suit';
import { InteractionSystem } from './player/interaction';
import { MissionState, OBJECTIVES } from './missions/missions';
import { RECORDS, baseStatusRecord, type StoryRecord } from './missions/records';
import { AudioEngine } from './audio/audio';
import { VoiceDirector } from './audio/voice';
import { narratedIntro, type NarrationCue } from './cinematics/narratedIntro';
import { DebrisGust, VisorRig } from './cinematics/visor';
import { AstronautMotion } from './player/astronautMotion';
import { defaultInventoryState, saveStore, SAVE_VERSION, type SaveData } from './save/saveSystem';
import { Hotbar, Inventory } from './inventory/inventory';
import { itemDef, STARTING_HOTBAR } from './inventory/items';
import { OreField, type Pickup } from './inventory/ore';
import { discoveryRecord, discoveryRecordId, type Discovery } from './inventory/discoveries';
import { StorageScreen } from './ui/inventoryUi';
import { ToolViewmodel } from './player/toolViewmodel';
import { Footprints } from './world/footprints';
import { LockerProp } from './base/locker';
import { Facilities, FACILITY, type FacilityEvent } from './base/facilities';
import { CommsConsoleProp, GrowBedProp, ShieldGeneratorProp } from './base/facilityProps';
import { Hud } from './ui/hud';
import { SurveyMap, type MapMarker } from './ui/minimap';
import { LoadingScreen, MainMenu, Pda, RecordReader, card, introCard } from './ui/screens';
import { h } from './ui/dom';
import { SpaceScene } from './space/spaceScene';
import { Spacecraft } from './space/spacecraft';
import { LandingDust } from './cinematics/landingFx';
import { spaceOpening, landingCutscene, type OpeningFx } from './cinematics/opening';
import { CampaignDirector } from './campaign/director';
import { triggerLength } from './campaign/cines';
import { MannedVehicle } from './vehicles/mannedVehicle';
import { iceCutscene } from './cinematics/scenes';
import type { Cutscene as CutsceneDef } from './cinematics/cutscene';

type Mode = 'menu' | 'intro' | 'cutscene' | 'playing' | 'driving' | 'paused' | 'reading' | 'pda' | 'storage' | 'failed' | 'end';

declare global {
  interface Window { __cf?: Record<string, unknown> }
}

const objIndex = (id: string) => OBJECTIVES.findIndex((o) => o.id === id);

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  const automated = !!shot;
  const loading = new LoadingScreen(ui);
  const status: Record<string, unknown> = { ready: false, errors: [] as string[] };
  window.__cf = status;

  let ctx: RenderContext;
  try {
    ctx = createRenderContext(canvas, () => loading.fail('The graphics context was lost (GPU reset or driver issue). Reload the page to continue.'));
  } catch (e) {
    loading.fail(`WebGL 2 could not be started in this browser.\n${String(e)}\n\nUse a current Chrome or Edge with hardware acceleration enabled.`);
    return;
  }
  const { renderer, scene, camera } = ctx;
  renderer.info.autoReset = false; // F3 shows whole-frame totals across render passes
  scene.add(camera); // the suit lamp is parented to the camera
  const settings = loadSettings();
  ctx.setQuality(settings.quality);
  window.addEventListener('resize', () => ctx.resize());

  const base = import.meta.env.BASE_URL;
  const world = await WorldData.load(`${base}world/`, (f) => loading.set(f * 0.62, 'Loading CinderRain terrain'));
  const layers = await loadLayerTextures(`${base}textures/`, renderer, (f) => loading.set(0.62 + f * 0.13, 'Loading surface materials'));
  const map = await SurveyMap.load(`${base}world/survey_map.png`, world.meta.extent);
  loading.set(0.77, 'Building the surface');
  await new Promise((r) => setTimeout(r, 0));
  // Level the ground under the outpost before anything samples the terrain.
  const padY = prepareOutpostPad(world, SITES.outpost.x, SITES.outpost.z);
  // EXPEDITION 02 landing site: a low ridge between the lander and the base (the first viewpoint) and a level pad.
  world.raiseRidge(RIDGE.x, RIDGE.z, RIDGE.len, RIDGE.width, RIDGE.height, RIDGE.angle);
  const landerY = world.meanHeight(LANDING.x - 5, LANDING.x + 5, LANDING.z - 5, LANDING.z + 5);
  world.flattenRect(LANDING.x - 6, LANDING.x + 6, LANDING.z - 6, LANDING.z + 6, landerY, 9);
  // Campaign sites: MEV-1 hangar (west apron), first-survey point, Expedition 1 survey station, original research facility.
  const GARAGE = { x: SITES.outpost.x - 52, z: SITES.outpost.z - 14, yaw: Math.PI };
  const SURVEY = { x: SITES.outpost.x + 560, z: SITES.outpost.z - 120 };
  const STATION = { x: -120, z: -288 };
  const FAC_SITE = { x: -510, z: -150, yaw: -Math.PI / 2 };
  for (const [x, z, hw, hd] of [[GARAGE.x, GARAGE.z, 6, 8], [FAC_SITE.x, FAC_SITE.z, 10, 10], [STATION.x, STATION.z, 3, 3]]) {
    world.flattenRect(x - hw, x + hw, z - hd, z + hd, world.meanHeight(x - hw, x + hw, z - hd, z + hd), 8);
  }

  // ---------- world ----------
  const sky = createSky(SUN_DIR);
  scene.add(sky);
  scene.add(createBackdrop(world, layers));
  const terrain = new Terrain(world, layers);
  terrain.quality = settings.quality === 'high' ? QUALITY_HIGH : QUALITY_LOW;
  scene.add(terrain.group);
  const rocks = new RockField(world, layers);
  rocks.meshes.forEach((m) => scene.add(m));
  rocks.keepOut.push(outpostKeepOut(SITES.outpost.x, SITES.outpost.z));
  rocks.keepOut.push({ x0: LANDING.x - 12, x1: LANDING.x + 12, z0: LANDING.z - 12, z1: LANDING.z + 12 });
  for (const [x, z, r] of [[GARAGE.x, GARAGE.z, 11], [FAC_SITE.x, FAC_SITE.z, 13], [STATION.x, STATION.z, 5]]) rocks.keepOut.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r });
  rocks.minSegs = terrain.quality.lods[0][1];
  terrain.onChunk = (...a) => rocks.onChunk(...a);
  const dust = new DustMotes();
  scene.add(dust.points);

  const colliders = new ColliderSet();
  // Placeholder outpost colliders are kept separate: they only apply if the user's model fails to load.
  const placeholderColliders = new ColliderSet();
  const outpost = buildOutpost(world, SITES.outpost.x, SITES.outpost.z, placeholderColliders);
  scene.add(outpost.group);
  const slotBase = `${base}assets/models/`;
  loading.set(0.79, 'Loading the outpost');
  let outpostModel: OutpostModel | null = null;
  let outpostSlot: SlotResult;
  try {
    outpostModel = await loadOutpostModel(slotBase, renderer, SITES.outpost.x, SITES.outpost.z, padY);
    scene.add(outpostModel.root);
    outpost.group.visible = false;
    // Interaction points inside/at the real base (relative to the dome centre; +Z north). Airlock = south entrance.
    outpost.anchors.airlock.copy(outpostModel.at(1.6, -12.5, 1.3));
    outpost.anchors.terminal.copy(outpostModel.at(-3.5, -3.0, 1.2));
    outpost.anchors.baseStatus.copy(outpostModel.at(4.5, -3.0, 1.2));
    outpost.anchors.blinkers.length = 0;
    const s = outpostModel.stats, g = outpostModel.grid.stats;
    outpostSlot = { slot: 'outpost', status: 'loaded', detail: `${s.meshes} meshes, ${(s.triangles / 1000).toFixed(0)}k tris, ${s.textures} tex; collision ${g.solidCells} solid / ${g.floorCells} floor cells in ${g.ms} ms` };
  } catch (e) {
    console.warn('Outpost model unavailable, using placeholder:', e);
    colliders.circles.push(...placeholderColliders.circles);
    outpostSlot = { slot: 'outpost', status: 'placeholder', detail: String(e) };
  }
  scene.add(buildReactor(world, SITES.reactor.x, SITES.reactor.z, colliders));
  // Placeholder rover colliders are only used if the user's rover model fails to load (the real rover moves).
  const placeholderRoverColliders = new ColliderSet();
  const rover = buildRover(world, SITES.rover.x, SITES.rover.z, Math.PI * 0.92, placeholderRoverColliders);
  scene.add(rover.group);
  const drill = new DrillRig(world, SITES.drill.x, SITES.drill.z, 0.6, colliders);
  scene.add(drill.group);

  loading.set(0.82, 'Surveying the cave');
  const cave = new Cave(world, layers, colliders);
  scene.add(cave.group);
  await cave.build();

  // ---------- EXPEDITION 02: orbital scene (menu + opening) and lander HORIZON at the landing site ----------
  loading.set(0.88, 'Plotting Mars orbit');
  const space = new SpaceScene(base);
  await space.ready.catch((e) => console.warn('Orbital textures unavailable:', e));
  const landerYaw = Math.atan2(SITES.outpost.x - LANDING.x, SITES.outpost.z - LANDING.z); // hatch (+Z) faces the outpost
  const landerSite = new Vector3(LANDING.x, world.heightAt(LANDING.x, LANDING.z), LANDING.z);
  const lander = new Spacecraft('minimal');
  lander.travelMode = false;
  lander.root.position.copy(landerSite);
  lander.root.rotation.y = landerYaw;
  lander.setStage('landed'); lander.hatchOpen = 1; lander.compress = 0.06; lander.update(0);
  scene.add(lander.root);
  const landerShell = new Spacecraft('none');
  landerShell.travelMode = false;
  landerShell.root.visible = false;
  scene.add(landerShell.root);
  colliders.circles.push({ x: LANDING.x, z: LANDING.z, r: 2.7, bottom: landerSite.y - 1, top: landerSite.y + 7.5 });
  const landingDust = new LandingDust(scene);
  // Image-based lighting for vehicles/spacecraft only (the terrain keeps its own lighting).
  const pmrem = new PMREMGenerator(renderer);
  const vehicleEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  lander.setEnvironment(vehicleEnv); landerShell.setEnvironment(vehicleEnv); space.craft.setEnvironment(vehicleEnv);

  // Suit lamp: a spot light on the helmet plus a faint near-field fill (light bouncing off nearby rock).
  const lamp = new SpotLight(0xfff0dc, 0, 70, 0.78, 0.65, 1.25);
  lamp.position.set(0.18, -0.12, 0.05);
  lamp.target.position.set(0, -0.2, -6);
  const lampFill = new PointLight(0xffe2c8, 0, 7, 2);
  camera.add(lamp, lamp.target, lampFill);

  // Campaign director (EXPEDITION 02 chapters) — created once the facilities exist; it retargets every objective marker.
  let campaign: CampaignDirector | null = null;
  /** Height to place a waypoint for each objective (underground targets come from the campaign). */
  const targetHeight = (id: string, x: number, z: number) => campaign?.targetY(id) ?? world.heightAt(x, z);
  // Habitat lighting restored by the campaign (emergency power → full distribution); one constant light, eased.
  const domeLight = new PointLight(0xffe2c4, 0, 30, 1.3);
  domeLight.position.set(SITES.outpost.x, (outpostModel?.floorY ?? padY) + 4.2, SITES.outpost.z);
  scene.add(domeLight);
  let outpostPower = 0;
  let storm = 0;
  let stormOverride: number | null = null;
  const stormFog = new Color(0x8a5a3c);

  // Cinematics (Theatre.js): sheet coordinates are relative to the dome centre at floor level.
  const studioOn = await maybeStartStudio(params);
  // Without Studio, Theatre only becomes ready when given saved state, so state.json must always be a valid export.
  const cine = new CinematicDirector(cinematicState, new Vector3(SITES.outpost.x, outpostModel?.floorY ?? padY, SITES.outpost.z));
  const cineReady = await Promise.race([cine.ready().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 3000))]);
  if (!cineReady) console.warn('Cinematics: Theatre project not ready after 3 s; continuing without cinematics.');
  if (params.has('cine')) void cine.play();
  status.studio = studioOn;

  // Rover and drilling-machine models are integrated in their own phases (08/09); drill.glb is a hand tool.
  const slotResults: SlotResult[] = [
    outpostSlot,
    { slot: 'rover', status: 'placeholder', detail: 'ROVER.glb / VEHICLE.glb optimised; drivable integration is Phase 08' },
    { slot: 'drill', status: 'placeholder', detail: 'DRL-2 rig stays procedural; drill.glb is a hand drill (tool)' },
    { slot: 'astronaut', status: 'placeholder', detail: 'first-person camera; optimised body model ready (opt/astronaut.glb)' },
  ];

  terrain.update(SPAWN.x, SPAWN.z, 0);
  terrain.flush();
  rocks.commit();
  loading.set(0.95, 'Compiling shaders');
  await new Promise((r) => setTimeout(r, 0));
  lamp.intensity = 0.0001; // keep light count constant from the first compile
  renderer.compile(scene, camera);

  // ---------- gameplay state ----------
  const input = new Input(canvas);
  const ground = new Ground(world);
  if (outpostModel) ground.structures.push(outpostModel.grid);

  // ---------- Rover R-1 (System N): the user's ROVER.glb, drivable; falls back to the static placeholder ----------
  let drivable: DrivableRover | null = null;
  const roverGround = { height: (x: number, z: number, yRef: number) => ground.at(x, z, yRef).h };
  /** Moving collider so the astronaut cannot walk through the parked rover (updated every frame). */
  const roverCollider = { x: 0, z: 0, r: 1.45, bottom: -1e4, top: -1e4 };
  const roverObstacles = {
    blocked: (x: number, z: number, y: number, r: number) => {
      for (const c of colliders.circles) if (c !== roverCollider && y < c.top && y + 2 > c.bottom && Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
      return ground.structures.some((s) => Math.abs(y - s.baseY) < 3 && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => s.isSolid(x + dx, z + dz)));
    },
  };
  const roverPad = new Vector3(SITES.outpost.x + 20, 0, SITES.outpost.z - 22); // charging pad on the apron south-east of the airlock
  const roverStart = { x: SITES.rover.x, z: SITES.rover.z, yaw: 0.6 };
  try {
    drivable = await DrivableRover.load(`${slotBase}opt/rover.glb`);
    drivable.place(roverStart.x, roverStart.z, roverStart.yaw, roverGround);
    scene.add(drivable.group);
    rover.group.visible = false;
    colliders.circles.push(roverCollider);
    slotResults[1] = { slot: 'rover', status: 'loaded', detail: 'ROVER.glb — drivable; 6 wheels split from the fused wheel mesh' };
  } catch (e) {
    console.warn('Drivable rover unavailable, using placeholder:', e);
    colliders.circles.push(...placeholderRoverColliders.circles);
  }
  // ---------- MEV-1 manned exploration vehicle (garage; user's VEHICLE.glb) — distinct from the remote rover R-1 ----------
  let mev: MannedVehicle | null = null;
  const mevCollider = { x: 0, z: 0, r: 1.9, bottom: -1e4, top: -1e4 };
  const mevDoorPos = new Vector3();
  try {
    mev = await MannedVehicle.load(`${slotBase}opt/vehicle.glb`);
    mev.setEnvironment(vehicleEnv);
    scene.add(mev.group);
    colliders.circles.push(mevCollider);
  } catch (e) { console.warn('MEV-1 unavailable:', e); }
  const syncMev = () => {
    if (!mev) return;
    mevCollider.x = mev.pos.x; mevCollider.z = mev.pos.z; mevCollider.bottom = mev.pos.y - 1; mevCollider.top = mev.pos.y + 2.4;
    mevDoorPos.copy(mev.toWorld(mev.exitPoint.clone().setY(1.3)).lerp(mev.pos.clone().setY(mev.pos.y + 1.3), 0.35));
  };
  const mevObstacles = {
    blocked: (x: number, z: number, y: number, r: number) => {
      for (const c of colliders.circles) if (c !== mevCollider && y < c.top && y + 2 > c.bottom && Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
      return ground.structures.some((s) => Math.abs(y - s.baseY) < 3 && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => s.isSolid(x + dx, z + dz)));
    },
  };
  let driven: 'mev' | 'r1' = 'r1';
  let mevCam: 'chase' | 'cockpit' = 'chase';
  let roverCam: 'chase' | 'mast' = 'chase';
  const roverLook = { yaw: 0, pitch: 0 };
  let roverZoom = 1;
  let roverHudTimer = 0;
  const boardPos = new Vector3();
  /** Keeps the rover's interaction points and player collider attached to the (moving) rover. */
  const syncRoverAnchors = () => {
    if (!drivable) return;
    drivable.group.updateMatrixWorld(true);
    rover.servicePanel.copy(drivable.toWorld(new Vector3(1.55, 1.0, 0.2)));
    boardPos.copy(drivable.toWorld(new Vector3(-1.55, 1.0, -0.2)));
    roverCollider.x = drivable.pos.x; roverCollider.z = drivable.pos.z;
    roverCollider.bottom = drivable.pos.y - 1; roverCollider.top = drivable.pos.y + 2.2;
  };
  syncRoverAnchors();

  // ---------- PDA live data: environment readings, rover telemetry, mast-camera feed ----------
  const SOL = 88775; // s (24 h 39 m 35 s)
  const SOL_START = (15 / 24) * SOL; // missions start at 15:00 local (Mars) time — matches the low western sun
  const indoors = () => !!outpostModel && outpostModel.grid.floorAt(player.pos.x, player.pos.z) !== null
    && Math.hypot(player.pos.x - SITES.outpost.x, player.pos.z - SITES.outpost.z) < 40;
  const FACT = 'NASA Mars Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html)';
  const environmentReadings = () => {
    const tSol = (SOL_START + playSeconds) % SOL, phase = tSol / SOL;
    const hh = Math.floor((tSol / SOL) * 24), mm = Math.floor(((tSol / SOL) * 24 * 60) % 60);
    const inside = indoors(), cave = adapt;
    const tempC = inside ? 21 : -48 + 40 * Math.sin(2 * Math.PI * (phase - 0.25)) + cave * 25; // caves buffer the swing
    const pres = 6.1 * Math.exp(-(player.pos.y - padY) / 11100);
    const dose = 0.67 * (inside ? facilities.habitatDose : 1) * (1 - 0.9 * cave);
    return [
      { label: 'Local time', value: `Sol ${Math.floor((SOL_START + playSeconds) / SOL) + 1}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, kind: 'sim' as const, source: 'Mission clock; one sol = 24 h 39 m 35 s (NASA)' },
      { label: 'Location', value: inside ? 'Outpost habitat (pressurised)' : cave > 0.3 ? 'Underground (cave)' : 'Surface', kind: 'sim' as const },
      { label: 'Air temperature', value: `${tempC.toFixed(0)} °C`, kind: 'sim' as const, source: 'Diurnal model spanning Curiosity REMS ranges at Gale crater; habitat set-point 21 °C' },
      { label: 'Pressure (here)', value: inside ? '1013 mbar (habitat)' : `${pres.toFixed(2)} mbar`, kind: 'sim' as const, source: 'Model: 6.1 mbar reference with an 11.1 km scale height' },
      { label: 'Mean surface pressure', value: '≈ 6.1 mbar (≈ 4 – 8.7)', kind: 'nasa' as const, source: FACT },
      { label: 'Atmosphere', value: 'CO₂ 95.1% · N₂ 2.59% · Ar 1.94% · O₂ 0.16% · CO 0.06%', kind: 'nasa' as const, source: FACT },
      { label: 'Surface gravity', value: '3.71 m/s²', kind: 'nasa' as const, source: FACT },
      { label: 'Surface radiation dose', value: '≈ 0.67 mSv/day', kind: 'nasa' as const, source: 'Curiosity RAD, Gale crater (Hassler et al., Science 2014)' },
      { label: 'Your dose rate', value: `${dose.toFixed(2)} mSv/day`, kind: 'sim' as const, source: 'Game model: surface reference reduced by habitat / rock shielding' },
      { label: 'Suit O₂ / power', value: `${suit.oxygen.toFixed(0)}% / ${suit.power.toFixed(0)}%`, kind: 'sim' as const },
    ];
  };
  const feedCanvas = h<'canvas'>('canvas.feed', { width: 384, height: 216 });
  const feedTarget = new WebGLRenderTarget(384, 216);
  const feedCam = new PerspectiveCamera(55, 384 / 216, 0.1, 30000);
  const feedPixels = new Uint8Array(384 * 216 * 4);
  /** Renders the rover's mast view off-screen and copies it (sRGB-encoded, flipped) into the PDA canvas. */
  const captureRoverFeed = () => {
    if (!drivable) return null;
    drivable.group.updateMatrixWorld(true);
    feedCam.position.copy(drivable.toWorld(drivable.mastHead));
    feedCam.rotation.order = 'YXZ';
    feedCam.rotation.set(-drivable.pitch * 0.5, drivable.yaw + Math.PI, 0);
    feedCam.updateMatrixWorld();
    renderer.setRenderTarget(feedTarget);
    renderer.render(scene, feedCam);
    renderer.readRenderTargetPixels(feedTarget, 0, 0, 384, 216, feedPixels);
    renderer.setRenderTarget(null);
    const ctx2 = feedCanvas.getContext('2d')!;
    const img = ctx2.createImageData(384, 216);
    for (let y = 0; y < 216; y++) for (let x = 0; x < 384; x++) {
      const s0 = ((215 - y) * 384 + x) * 4, d0 = (y * 384 + x) * 4;
      for (let c = 0; c < 3; c++) { const v = feedPixels[s0 + c] / 255; const t = v / (1 + v) * 1.6; img.data[d0 + c] = 255 * Math.pow(Math.min(1, t), 1 / 2.2); }
      img.data[d0 + 3] = 255;
    }
    ctx2.putImageData(img, 0, 0);
    ctx2.fillStyle = 'rgba(255,255,255,0.75)';
    ctx2.font = '11px monospace';
    ctx2.fillText(`R-1 MASTCAM  ${new Date().toISOString().slice(11, 19)}`, 8, 16);
    return feedCanvas;
  };

  // ---------- astronaut body + third-person camera (System A) ----------
  let body: PlayerBody | null = null;
  void PlayerBody.load(`${slotBase}opt/astronaut.glb`).then((b) => { body = b; scene.add(b.root); tool.setArms(b.model); }).catch((e) => console.warn('Astronaut body unavailable:', e));
  const camBlocker = {
    blocked: (x: number, y: number, z: number) =>
      ground.structures.some((s) => y > s.baseY + 0.2 && y < s.baseY + 2.6 && s.isSolid(x, z))
      || (nearCave(x, z) && y < world.heightAt(x, z) - 0.3 && caveSdf(x, y, z) > -0.25),
    groundAt: (x: number, z: number, yRef: number) => ground.at(x, z, yRef).h,
  };
  const player = new PlayerController(world, colliders, rocks, ground);
  const footprints = new Footprints(scene, ctx.fog);
  const audio = new AudioEngine();
  // Browsers only allow audio to start inside a user gesture. Menu actions like Continue and New Game (over a save)
  // start the game after awaiting IndexedDB — outside the gesture — which left the AudioContext suspended (silent).
  // Any click or key press now creates/resumes it, so audio can never stay stuck.
  const unlockAudio = () => { if (audio.state !== 'running') audio.start(); };
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
  // Dialogue (ElevenLabs voice lines) + cinematic background beds; see src/audio/voice.ts and voiceLines.json.
  const voice = new VoiceDirector(audio, base, ui);
  voice.onPlayed = (id) => { mission.flags.add(`vo.${id}`); saveDirty = true; };
  let o2Warned = false;
  const applySettings = (s: Settings) => {
    player.sensitivity = s.sensitivity;
    player.invertY = s.invertY;
    const q = s.quality === 'high' ? QUALITY_HIGH : QUALITY_LOW;
    if (terrain.quality !== q) { terrain.quality = q; ctx.setQuality(s.quality); }
    rocks.minSegs = q.lods[0][1];
    audio.setVolume(s.volume);
    saveSettings(s);
  };
  applySettings(settings);
  const doors = outpostModel ? new DoorSystem(outpostModel.grid, () => audio.ui('door')) : null;
  for (const spec of outpostModel?.doorSpecs ?? []) doors!.add(spec);
  const suit = new SuitSystem();
  const mission = new MissionState();
  const interactions = new InteractionSystem();
  const hud = new Hud(ui, map);
  const reader = new RecordReader(ui);
  const pda = new Pda(ui, map, mission, (id) => showRecord(RECORDS[id]));
  let mode: Mode = 'menu';

  // ---------- cutscenes (src/cinematics) ----------
  const cutscenes = new CutscenePlayer(ui);
  const gameFov = camera.fov;
  let actor: Actor | null = null;
  void Actor.load(`${slotBase}opt/astronaut.glb`).then((a) => { actor = a; scene.add(a.root); }).catch((e) => console.warn('Cutscene actor unavailable:', e));
  const eyeCam = new PerspectiveCamera();
  const cineWorld: CutsceneWorld = {
    groundY: (x, z, yHint) => (yHint === undefined ? world.heightAt(x, z) : ground.at(x, z, yHint).h),
    outpost: { x: SITES.outpost.x, z: SITES.outpost.z, floorY: outpostModel?.floorY ?? padY },
    eye: (): Pose => {
      player.applyCamera(eyeCam, 1);
      eyeCam.updateMatrixWorld();
      const dir = eyeCam.getWorldDirection(new Vector3());
      return { pos: eyeCam.position.clone(), look: eyeCam.position.clone().addScaledVector(dir, 10), fov: gameFov };
    },
    ice: cave.interact.ice,
    get actor() { return actor; },
    cue: (k) => audio.cue(k),
    fov: gameFov,
  };
  /** Plays a cutscene, then `then()`; gameplay is frozen meanwhile. */
  const playCutscene = (id: CutsceneId, then: () => void) => {
    clearOverlay();
    setMode('cutscene');
    audio.start();
    voice.trigger(`cutscene:${id}`);
    cutscenes.play(buildCutscene(id, cineWorld), () => {
      camera.fov = gameFov;
      camera.updateProjectionMatrix();
      then();
    });
  };
  /** Mode to return to when unpausing (driving survives a pause). */
  let resumeMode: Mode = 'playing';
  let overlay: HTMLElement | null = null;
  let devVisible = params.has('dev');
  const dev = h('div.dev.panel' + (devVisible ? '' : '.hidden'));
  ui.append(dev);
  let lampOn = false;
  let lampHinted = false;
  const scan = { state: 'idle' as 'idle' | 'scanning' | 'done', progress: 0, duration: 6 };
  let playSeconds = 0;
  let hasSave = false;
  let lastSaveAt = 0;
  let saveDirty = false;
  let adapt = 0;
  const fogOut = new Color(PALETTE.fog), fogCave = new Color(0x0d0807);

  const baseSim = { output: 40.2, demand: 33.5, farm: 82, myco: 74, bio: 67, lifeSupport: 91 };

  // ---------- inventory, resources and storage (directive Systems E/F) ----------
  const inventory = new Inventory(20);
  const hotbar = new Hotbar(5, STARTING_HOTBAR);
  const lockers: Record<string, Inventory> = { locker_main: new Inventory(20) };
  const ore = new OreField((x, z) => ground.at(x, z, world.heightAt(x, z) + 2).h);
  scene.add(ore.group);
  const discoveries: Discovery[] = [];
  const mining = { deposit: null as string | null, progress: 0, duration: 2.4, grind: 0 };
  const tool = new ToolViewmodel();
  tool.setEnvironment(vehicleEnv);
  void tool.load(`${slotBase}opt/handdrill.glb`).catch((e) => console.warn('Hand drill model unavailable:', e));
  const storageUi = new StorageScreen(ui, () => closeStorage());
  pda.inventory = inventory;
  pda.environment = environmentReadings;
  pda.audioLogs = () => voice.lines.filter((l) => voice.played.has(l.id)).map((l) => ({ id: l.id, who: voice.speakerOf(l).name, text: l.text }));
  pda.onReplay = (id) => voice.replay(id);
  if (drivable) {
    const r1 = drivable;
    pda.rover = () => ({
      status: r1.occupied ? 'Remote control' : r1.charging ? 'Parked · charging' : Math.abs(r1.speed) > 0.1 ? 'Moving' : 'Parked · beacon active',
      signal: remoteSignal(), linkable: !!campaign?.remoteUnlocked && remoteSignal() > 0.05,
      why: !campaign?.remoteUnlocked ? 'BEACON NOT YET LOCATED (CH. 03)' : remoteSignal() <= 0.05 ? 'OUT OF RELAY RANGE' : undefined,
      battery: r1.battery, charging: r1.charging, condition: r1.condition, x: r1.pos.x, z: r1.pos.z,
      distance: Math.hypot(r1.pos.x - player.pos.x, r1.pos.z - player.pos.z), odometer: r1.odometer,
      pitchDeg: (r1.pitch * 180) / Math.PI, rollDeg: (r1.roll * 180) / Math.PI,
    });
    pda.roverFeed = captureRoverFeed;
    pda.onRemote = () => startRemote();
  }
  // Supply locker cabinet against the solid west wall of the Storage module (world −X of the dome), in the clear north-west
  const locker = new LockerProp();
  // corner (checked with tools/outpost-grid.mjs); doors open toward +X, into the room.
  const lockerBase = outpostModel ? outpostModel.at(-28.3, 2.4) : outpost.anchors.baseStatus.clone().setY(world.heightAt(outpost.anchors.baseStatus.x, outpost.anchors.baseStatus.z));
  locker.group.position.copy(lockerBase);
  locker.group.rotation.y = Math.PI / 2;
  scene.add(locker.group);
  colliders.add(lockerBase.x, lockerBase.z, 0.72, lockerBase.y - 1, lockerBase.y + 2.2);
  const lockerPos = lockerBase.clone().add(new Vector3(0.45, 1.0, 0));

  // ---------- working facilities: farm (+X module), comms + shields (north module) ----------
  const facilities = new Facilities();
  const placeProp = (g: Group, dx: number, dz: number, yaw: number, r: number, hgt: number) => {
    const p = outpostModel ? outpostModel.at(dx, dz) : outpost.anchors.baseStatus.clone().add(new Vector3(dx * 0.2, 0, dz * 0.2));
    g.position.copy(p); g.rotation.y = yaw; scene.add(g);
    colliders.add(p.x, p.z, r, p.y - 1, p.y + hgt);
    return p;
  };
  // Four beds in the farm room (x 19.5…27, z −4…4 from the dome centre), aisle down the middle, entrance kept clear.
  const bedProps = [[21.3, -2.1], [21.3, 2.1], [25.6, -2.1], [25.6, 2.1]].map(([dx, dz], i) => {
    const prop = new GrowBedProp();
    const p = placeProp(prop.group, dx, dz, 0, 0.75, 2);
    return { prop, i, pos: p.clone().add(new Vector3(dx < 23 ? 0.5 : -0.5, 1.0, 0)) };
  });
  const comms = new CommsConsoleProp();
  const commsPos = placeProp(comms.group, -3.7, 29, Math.PI / 2, 0.7, 2.2).clone().add(new Vector3(0.5, 1.2, 0));
  const shieldGen = new ShieldGeneratorProp();
  const shieldPos = placeProp(shieldGen.group, 4.0, 23.5, 0, 0.72, 2.1).clone().add(new Vector3(0, 1.1, 0));
  const facilityNotice: Record<FacilityEvent, [string, 'good' | 'warn' | undefined]> = {
    ready: ['Farm: a grow bed is ready to harvest.', 'good'],
    wilting: ['Farm: a grow bed has run dry — water it before the crop dies.', 'warn'],
    dead: ['Farm: a crop died from lack of water. Clear the bed and replant.', 'warn'],
    drop: ['Supply drop delivered to the outpost supply locker.', 'good'],
    deficit: ['Power deficit — grow lights shed. Turn the shields off or harvest to restore farm power.', 'warn'],
    powerRestored: ['Base power balanced — grow lights back on.', 'good'],
  };
  const commsLines = () => {
    const f = facilities.s, pend = facilities.pendingReport(discoveries.map((d) => d.id), sampleTotal());
    const drop = facilities.canRequestDrop(playSeconds);
    return [
      `Reports sent: ${f.reports}   Supply credits: ${f.credits}`,
      pend.discoveries.length || pend.batches ? `!New findings: ${pend.discoveries.length} discoveries, ${pend.batches} sample batches` : 'No new findings to report',
      f.dropEta >= 0 ? `!Supply drop inbound: ${Math.ceil(f.dropEta)} s` : drop.ok ? 'Supply drop: available' : `Drop: ${drop.why ?? ''}`.slice(0, 40),
      `Shield field: ${Math.round(f.shieldLevel * 100)}%   Power ${facilities.power.demand.toFixed(1)}/${facilities.power.output.toFixed(1)} kW`,
      `Farm health: ${facilities.farmHealth}%`,
    ];
  };
  const useComms = () => {
    const earned = facilities.transmit(discoveries.map((d) => d.id), sampleTotal());
    if (earned) {
      audio.ui('complete'); voice.sting();
      hud.notify(`Field report transmitted to Mission Control — +${earned} supply credit${earned > 1 ? 's' : ''}.`, 'good');
      saveDirty = true; return;
    }
    const can = facilities.canRequestDrop(playSeconds);
    if (can.ok && facilities.requestDrop(playSeconds)) {
      audio.ui('interact');
      hud.notify(`Supply drop requested — ETA ${FACILITY.dropDelay} s to the outpost supply locker.`, 'good');
      saveDirty = true; return;
    }
    audio.ui('warn');
    hud.notify(can.why ?? 'Nothing new to transmit.', 'warn');
  };
  const useBed = (i: number) => {
    const a = facilities.bedAction(i, inventory.count('seed_pack'));
    if (!a.ok) { audio.ui('warn'); hud.notify(a.why ?? '', 'warn'); return; }
    if (a.verb === 'Plant') { inventory.remove('seed_pack', 1); facilities.plant(i); hud.notify('Seed pack planted. Keep the bed watered.', 'good'); }
    else if (a.verb === 'Water') { facilities.water(i); hud.notify('Bed reservoir refilled.'); }
    if (a.verb === 'Plant' || a.verb === 'Water') campaign?.notify('bed');
    else if (a.verb === 'Clear') { facilities.clear(i); hud.notify('Bed cleared.'); }
    else {
      const [food, seed] = facilities.harvest(i);
      if (inventory.spaceFor('ration') < food) { lockers.locker_main.add('ration', food); hud.notify('Suit inventory full — the harvest went to the supply locker.', 'warn'); }
      else { inventory.add('ration', food); hud.notify(`Harvested ${food} food rations${seed ? ' and recovered a seed pack' : ''}.`, 'good'); }
      if (seed) (inventory.spaceFor('seed_pack') > 0 ? inventory : lockers.locker_main).add('seed_pack', seed);
    }
    audio.ui('complete');
    saveDirty = true;
  };
  const toggleShields = () => {
    const on = facilities.toggleShields();
    audio.ui(on ? 'interact' : 'lamp');
    hud.notify(on ? `Radiation shields spinning up (+${FACILITY.shieldDraw} kW draw).` : 'Radiation shields powering down.', on ? 'good' : undefined);
    saveDirty = true;
  };
  const updateFacilities = (dt: number, simulate: boolean) => {
    if (simulate) for (const e of facilities.step(dt, playSeconds)) {
      if (e === 'drop') for (const [id, k] of FACILITY.dropContents) lockers.locker_main.add(id, k);
      const [text, tone] = facilityNotice[e];
      audio.ui(e === 'ready' || e === 'drop' || e === 'powerRestored' ? 'complete' : 'warn');
      hud.notify(text, tone);
      saveDirty = true;
    }
    const pw = facilities.power;
    bedProps.forEach((b) => b.prop.update(dt, facilities.s.beds[b.i], pw.lightsOn));
    shieldGen.update(dt, facilities.s.shieldLevel);
    comms.update(dt, commsLines(), facilities.s.dropEta >= 0);
  };

  const sampleTotal = () => (['hematite', 'olivine', 'gypsum'] as const)
    .reduce((n, m) => n + inventory.count(m) + Object.values(lockers).reduce((k, l) => k + l.count(m), 0), 0);
  /** Optional objective: responds to real collection events (samples carried or stored). */
  const refreshOptional = () => {
    const n = sampleTotal();
    if (!mission.flags.has('done.opt.samples') && n >= 3) {
      mission.flags.add('done.opt.samples');
      events.emit('notice', { text: 'Optional objective complete: three mineral samples collected.', tone: 'good' });
      saveDirty = true;
    }
    pda.optional = [{ title: 'Collect mineral samples', description: 'Drill surface deposits with the rock drill and collect three samples of any mineral. The scanner logs each new mineral to the archive.', progress: `${Math.min(n, 3)}/3`, done: mission.flags.has('done.opt.samples') }];
  };
  const refreshHotbar = () => hud.setHotbar(hotbar.slots.map((id) => {
    if (!id) return null;
    const d = itemDef(id);
    return { icon: d.icon, name: d.name, count: inventory.count(id), tool: d.category === 'tool' };
  }), hotbar.selected);
  inventory.onChange = () => { refreshHotbar(); refreshOptional(); saveDirty = true; };
  lockers.locker_main.onChange = () => { refreshOptional(); saveDirty = true; };

  const registerDiscovery = (d: Discovery) => { const r = discoveryRecord(d); RECORDS[r.id] = r; };
  const addPickupInteractable = (p: Pickup) => interactions.add({
    id: `pickup:${p.id}`, label: itemDef(p.mineral).name, verb: 'Collect', position: p.pos, range: 2.6,
    interact: () => collectPickup(p.id),
  });
  const collectPickup = (id: string) => {
    const p = ore.pickups.get(id);
    if (!p) return;
    if (inventory.spaceFor(p.mineral) < p.count) { audio.ui('warn'); hud.notify('Suit inventory full — store items in the outpost supply locker.', 'warn'); return; }
    ore.collect(id);
    interactions.remove(`pickup:${id}`);
    inventory.add(p.mineral, p.count);
    campaign?.notify('sample');
    audio.ui('complete');
    hud.notify(`+${p.count} ${itemDef(p.mineral).name}`, 'good');
    // The scanner identifies a mineral the first time it is collected and logs it to the expedition archive.
    if (!discoveries.some((d) => d.item === p.mineral)) {
      voice.sting();
      if (!discoveries.length) voice.trigger('first:sample');
      const d: Discovery = { id: discoveryRecordId(p.mineral), item: p.mineral, x: p.pos.x, z: p.pos.z, missionSeconds: playSeconds };
      discoveries.push(d);
      registerDiscovery(d);
      mission.addRecord(d.id);
      hud.notify(`New discovery: ${itemDef(p.mineral).name.replace(/ sample$/, '')} — logged to PDA › Logs.`, 'good');
    }
  };
  const startMining = (depositId: string) => {
    const dep = ore.deposits.get(depositId);
    if (!dep || dep.remaining <= 0 || mining.deposit) return;
    if (hotbar.selectedItem !== 'hand_drill' || inventory.count('hand_drill') === 0) {
      audio.ui('warn');
      hud.notify(`Select the rock drill [${hotbar.slots.indexOf('hand_drill') + 1 || '?'}] to cut a sample.`, 'warn');
      return;
    }
    mining.deposit = depositId;
    mining.progress = 0;
    audio.ui('interact');
  };
  for (const dep of ore.deposits.values()) {
    const name = itemDef(dep.def.mineral).name.replace(/ sample$/, '');
    interactions.add({
      id: `deposit:${dep.def.id}`, label: `${name} deposit`, verb: 'Drill', position: dep.pos.clone().setY(dep.pos.y + 0.6), range: 3.4,
      enabled: () => dep.remaining > 0,
      status: () => mining.deposit === dep.def.id ? `drilling ${Math.round(mining.progress * 100)}%`
        : hotbar.selectedItem === 'hand_drill' ? `${dep.remaining} sample${dep.remaining === 1 ? '' : 's'} left` : `select rock drill [${hotbar.slots.indexOf('hand_drill') + 1 || '?'}]`,
      interact: () => startMining(dep.def.id),
    });
  }
  /** Consumes the selected quick-slot item (Q). */
  const useSelected = () => {
    const id = hotbar.selectedItem;
    if (!id) return;
    const d = itemDef(id);
    if (d.category !== 'consumable' || !d.restores) { hud.notify(`${d.name}: a tool — use it with E on a target.`); return; }
    if (inventory.count(id) <= 0) { audio.ui('warn'); hud.notify(`No ${d.name} left — restock from the outpost supply locker.`, 'warn'); return; }
    const r = d.restores;
    const helps = (r.oxygen && suit.oxygen < 99) || (r.power && suit.power < 99) || (r.health && suit.health < 99);
    if (!helps) { hud.notify(`${d.name} not needed right now.`); return; }
    inventory.remove(id, 1);
    if (r.oxygen) suit.oxygen = Math.min(100, suit.oxygen + r.oxygen);
    if (r.power) suit.power = Math.min(100, suit.power + r.power);
    if (r.health) suit.health = Math.min(100, suit.health + r.health);
    audio.ui('complete');
    hud.notify(`${d.name} used.`, 'good');
  };
  const openStorage = () => {
    input.releaseLock();
    setMode('storage');
    storageUi.show('Outpost supply locker', inventory, lockers.locker_main);
    locker.target = 1;
    audio.ui('interact');
  };
  const closeStorage = () => {
    storageUi.close();
    locker.target = 0;
    input.requestLock();
    setMode('playing');
    if (!input.locked && !automated) setTimeout(() => { if (!input.locked && mode === 'playing') pause(); }, 250);
  };
  // ---------- Rover R-1: remote control through the PDA only (directive Part 9) ----------
  const remoteEl = h('div.remote-feed.hidden');
  ui.append(remoteEl);
  /** Relay signal 0…1: R-1 talks to the outpost relay; the link fades out past ~3.2 km. */
  const remoteSignal = () => (drivable ? Math.max(0, 1 - Math.hypot(drivable.pos.x - SITES.outpost.x, drivable.pos.z - SITES.outpost.z) / 3200) : 0);
  const startRemote = () => {
    if (!drivable || (mode !== 'playing' && mode !== 'pda')) return;
    if (!campaign?.remoteUnlocked) { audio.ui('warn'); hud.notify('No link to R-1 yet — its beacon has not been located.', 'warn'); return; }
    if (remoteSignal() < 0.05) { audio.ui('warn'); hud.notify('R-1 is out of relay range.', 'warn'); return; }
    if (pda.open) pda.close();
    driven = 'r1';
    drivable.occupied = true;
    roverCam = 'mast'; roverLook.yaw = 0; roverLook.pitch = 0; roverZoom = 1;
    setMode('driving');
    remoteEl.classList.remove('hidden');
    input.requestLock();
    campaign?.notify('remote:start');
    audio.cue('transmit');
    hud.notify('Remote link to R-1 established. WASD drive · mouse: mast camera · wheel: zoom · C: chase/mast · G: scan · E: end link.', 'good');
  };
  const exitRemote = () => {
    if (!drivable || mode !== 'driving' || driven !== 'r1') return;
    drivable.occupied = false;
    drivable.speed = 0;
    remoteEl.classList.add('hidden');
    if (camera.fov !== gameFov) { camera.fov = gameFov; camera.updateProjectionMatrix(); }
    setMode('playing');
    syncRoverAnchors();
    audio.ui('lamp');
    hud.notify('Remote link closed. R-1 holds position.');
  };
  /** Remote geological scan with R-1's instruments (also downloads its log during Ch.3). */
  const remoteScan = () => {
    if (!drivable) return;
    audio.ui('scan');
    if (mission.current?.id === 'r1_link') { campaign?.notify('remote:scan'); return; }
    const near = [...ore.deposits.values()].map((d) => ({ d, dist: Math.hypot(d.pos.x - drivable!.pos.x, d.pos.z - drivable!.pos.z) })).sort((a, b) => a.dist - b.dist)[0];
    hud.notify(near && near.dist < 120 ? `R-1 spectrometer: ${itemDef(near.d.def.mineral).name.replace(' sample', '')} signature ${near.dist.toFixed(0)} m away.` : 'R-1 spectrometer: basaltic regolith, fine dust; no notable signature.', 'good');
  };

  // ---------- MEV-1: board / exit with door animation and camera hand-over (directive Part 8) ----------
  const placeMevInGarage = () => {
    if (!mev || !campaign) return;
    const b = campaign.pos.garageBay;
    mev.place(b.x, b.z, GARAGE.yaw, roverGround, b.y + 1);
    mev.battery = 62; mev.condition = 88; mev.odometer = 0; mev.headlights = false;
    syncMev();
  };
  const boardMev = () => {
    if (!mev || mode !== 'playing') return;
    if (!campaign?.vehicleUnlocked) { audio.ui('warn'); hud.notify('MEV-1 systems are dormant — restore them at the hangar maintenance terminal.', 'warn'); return; }
    mev.openDoor(true);
    audio.ui('door');
    input.uiFocus = true;
    setTimeout(() => {
      if (!mev) return;
      driven = 'mev';
      mev.occupied = true;
      mevCam = 'chase'; roverLook.yaw = 0; roverLook.pitch = 0; roverZoom = 1;
      camera.position.copy(mev.toWorld(new Vector3(0, 4, -9)));
      setMode('driving');
      mev.openDoor(false);
      voice.trigger('first:board');
      campaign?.notify('vehicle:board');
      hud.notify('MEV-1: W/S throttle · A/D steer · Space brake · C camera · L lights · E exit.', 'good');
    }, 650);
  };
  const exitMev = () => {
    if (!mev || mode !== 'driving' || driven !== 'mev') return;
    if (Math.abs(mev.speed) > 1.2) { hud.notify('Stop the vehicle before exiting.', 'warn'); return; }
    mev.speed = 0;
    mev.openDoor(true);
    audio.ui('door');
    const side = mev.exitWorld(roverGround);
    const other = mev.toWorld(mev.exitPoint.clone().setX(-mev.exitPoint.x));
    const spot = !mevObstacles.blocked(side.x, side.z, mev.pos.y, 0.5) ? side : other;
    mev.occupied = false;
    if (camera.fov !== gameFov) { camera.fov = gameFov; camera.updateProjectionMatrix(); }
    player.teleport(spot.x, spot.z, yawTowards(mev.forward.x, mev.forward.z), mev.pos.y + 1);
    setMode('playing');
    syncMev();
    setTimeout(() => mev?.openDoor(false), 900);
    campaign?.notify('vehicle:exit');
  };
  /** Applies saved (or new-game) inventory/world state and rebuilds dependent objects. */
  const applyInventoryState = (s: Pick<SaveData, 'inventory' | 'hotbar' | 'storage' | 'ore' | 'discoveries'>) => {
    for (const id of ore.pickups.keys()) interactions.remove(`pickup:${id}`);
    ore.load(s.ore);
    for (const p of ore.pickups.values()) addPickupInteractable(p);
    hotbar.load(s.hotbar.slots, s.hotbar.selected);
    lockers.locker_main.load(s.storage.locker_main ?? []);
    discoveries.splice(0, discoveries.length, ...s.discoveries.filter((d) => d && typeof d.item === 'string'));
    discoveries.forEach(registerDiscovery);
    inventory.load(s.inventory);
    mining.deposit = null;
  };

  const clearOverlay = () => { overlay?.remove(); overlay = null; };
  const setMode = (m: Mode) => {
    mode = m;
    if (m !== 'end' && m !== 'cutscene') cutscenes.release();
    input.uiFocus = m !== 'playing' && m !== 'driving';
    hud.show(m === 'playing' || m === 'reading' || m === 'driving');
    if (m !== 'driving') hud.setVehicle(null);
    menu.show(m === 'menu');
    if (m !== 'pda') pda.close();
    if (m !== 'storage' && storageUi.open) storageUi.close();
  };

  let recordReturn: Mode = 'playing';
  const showRecord = (r: StoryRecord) => {
    if (pda.open) pda.close();
    recordReturn = mode === 'driving' ? 'driving' : 'playing';
    reader.show(r);
    audio.ui('interact');
    setMode('reading');
  };
  const closeRecord = () => {
    reader.close();
    setMode(recordReturn);
    if (!input.locked && !automated) pause();
  };

  // ---------- saving ----------
  const snapshot = (): SaveData => ({
    version: SAVE_VERSION,
    savedAt: Date.now(),
    player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw % (Math.PI * 2), pitch: player.pitch },
    suit: { oxygen: suit.oxygen, power: suit.power, health: Math.max(1, suit.health), lamp: lampOn },
    mission: { index: mission.index, records: [...mission.records], flags: [...mission.flags] },
    world: { drill: drill.state, drillProgress: drill.progress, iceScanned: scan.state === 'done' },
    playSeconds,
    inventory: inventory.toJSON(),
    hotbar: { slots: [...hotbar.slots], selected: hotbar.selected },
    storage: Object.fromEntries(Object.entries(lockers).map(([k, v]) => [k, v.toJSON()])),
    ore: ore.toJSON(),
    discoveries: discoveries.map((d) => ({ ...d })),
    base: facilities.toJSON(),
    rover: drivable ? { x: drivable.pos.x, z: drivable.pos.z, yaw: drivable.yaw, battery: drivable.battery, condition: drivable.condition, odometer: drivable.odometer } : undefined,
    mev: mev ? { x: mev.pos.x, z: mev.pos.z, yaw: mev.yaw, battery: mev.battery, condition: mev.condition, odometer: mev.odometer } : undefined,
  });
  const saveNow = async (manual = false) => {
    if (automated && !params.has('save')) return;
    const ok = await saveStore.save(snapshot());
    lastSaveAt = playSeconds;
    saveDirty = false;
    if (ok) { hasSave = true; if (manual) hud.notify('Progress saved.', 'good'); }
    else if (manual) hud.notify('Could not save: browser storage unavailable.', 'warn');
    status.lastSave = ok ? Date.now() : -1;
  };
  const applySave = (d: SaveData) => {
    mission.restore(d.mission.index, d.mission.records, d.mission.flags);
    suit.oxygen = d.suit.oxygen; suit.power = d.suit.power; suit.health = d.suit.health;
    lampOn = d.suit.lamp;
    drill.state = d.world.drill === 'running' ? 'idle' : d.world.drill; // an interrupted drill run restarts
    drill.progress = drill.state === 'done' ? 1 : 0;
    scan.state = d.world.iceScanned ? 'done' : 'idle';
    scan.progress = scan.state === 'done' ? 1 : 0;
    playSeconds = d.playSeconds;
    doors?.reset();
    applyInventoryState(d);
    facilities.load(d.base);
    voice.restore([...mission.flags].filter((f) => f.startsWith('vo.')).map((f) => f.slice(3)));
    refreshOptional();
    if (drivable) {
      const r = d.rover ?? { ...roverStart, battery: 100, condition: 100, odometer: 0 };
      drivable.place(r.x, r.z, r.yaw, roverGround);
      drivable.battery = r.battery; drivable.condition = r.condition; drivable.odometer = r.odometer;
      syncRoverAnchors();
    }
    if (mev && d.mev) { mev.place(d.mev.x, d.mev.z, d.mev.yaw, roverGround); mev.battery = d.mev.battery; mev.condition = d.mev.condition; mev.odometer = d.mev.odometer; syncMev(); }
    else placeMevInGarage();
    campaign?.restore();
    player.teleport(d.player.x, d.player.z, d.player.yaw, d.player.y + 0.5);
    player.pitch = d.player.pitch;
  };
  const describeSave = (d: SaveData) => {
    const obj = d.mission.index < OBJECTIVES.length ? OBJECTIVES[d.mission.index].title : 'All objectives complete';
    const mins = Math.round(d.playSeconds / 60);
    return `${obj} · ${mins} min played`;
  };
  const refreshMenuSave = async () => {
    const r = await saveStore.load();
    hasSave = r.status === 'ok';
    if (r.status === 'ok') menu.setSave(true, describeSave(r.data) + (r.migratedFrom ? ` (upgraded from v${r.migratedFrom})` : ''));
    else if (r.status === 'corrupt') menu.setSave(false, `Saved game could not be read (${r.reason}). Start a new game.`);
    else menu.setSave(false, '');
    return r;
  };

  const pause = () => {
    if (mode === 'paused') return;
    resumeMode = mode === 'driving' ? 'driving' : 'playing';
    clearOverlay();
    setMode('paused');
    void saveNow();
    overlay = card(ui, 'PAUSED', 'Mission paused', ['Your suit systems are holding. Progress is saved automatically.'], [
      { label: 'Resume', primary: true, fn: () => { audio.start(); input.requestLock(); } },
      { label: 'Save now', fn: () => void saveNow(true) },
      { label: 'Main menu', fn: () => { void saveNow().then(refreshMenuSave); clearOverlay(); setMode('menu'); } },
    ], 'WASD move · Shift sprint · Space jump · E interact · F lamp · Tab PDA');
  };

  const resetWorld = () => {
    mission.restore(0, [], []);
    suit.recharge();
    suit.health = 100;
    drill.state = 'idle';
    drill.progress = 0;
    scan.state = 'idle';
    scan.progress = 0;
    lampOn = false;
    lampHinted = false;
    playSeconds = 0;
    doors?.reset();
    applyInventoryState(defaultInventoryState());
    facilities.load(null);
    refreshOptional();
    voice.restore([]);
    o2Warned = false;
    if (drivable) { drivable.place(roverStart.x, roverStart.z, roverStart.yaw, roverGround); drivable.battery = 100; drivable.condition = 100; drivable.odometer = 0; syncRoverAnchors(); }
    placeMevInGarage();
    campaign?.restore();
    player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
    events.emit('objective', { id: OBJECTIVES[0].id });
  };
  const beginPlay = (notice?: string) => {
    clearOverlay();
    audio.start();
    input.requestLock();
    setMode('playing');
    if (notice) hud.notify(notice, 'good');
  };
  const startNewGame = () => {
    resetWorld();
    setMode('intro');
    // Playtest shortcut: ?start=cave | hall | ice begins at that point of the mission.
    const start = params.get('start');
    const starts: Record<string, { x: number; z: number; y?: number; look: [number, number]; obj: string }> = {
      cave: { x: NODES.mouthOut.x + 2, z: NODES.mouthOut.z + 22, look: [NODES.mouthIn.x, NODES.mouthIn.z], obj: 'enter_cave' },
      hall: { x: NODES.throat.x, z: NODES.throat.z - 4, y: NODES.throat.floor + 1, look: [NODES.hall.x, NODES.hall.z], obj: 'subsurface' },
      ice: { x: NODES.deepBend.x + 1, z: NODES.deepBend.z - 9, y: NODES.deepBend.floor - 1, look: [cave.interact.ice.x, cave.interact.ice.z], obj: 'ice' },
    };
    const sp = start ? starts[start] : undefined;
    if (!sp) player.teleport(newGameSpawn.x, newGameSpawn.z, newGameSpawn.yaw);
    if (sp) {
      const idx = objIndex(sp.obj);
      mission.restore(idx, ['assignment', 'rover_log', 'core_drl2', 'cliff_survey', ...(idx > objIndex('subsurface') ? ['beacon_log'] : [])], OBJECTIVES.slice(0, idx).flatMap((o) => [`done.${o.id}`, `appr.${o.id}`]).concat(['s.airlock.scan']));
      campaign?.restore();
      drill.state = 'done';
      drill.progress = 1;
      player.teleport(sp.x, sp.z, yawTowards(sp.look[0] - sp.x, sp.look[1] - sp.z), sp.y);
    }
    const brief = () => { overlay = introCard(ui, () => { beginPlay(`Objective: ${mission.current?.title ?? OBJECTIVES[0].title}`); void saveNow(); }); };
    // The arrival cutscene opens a fresh game (not the ?start= playtest shortcuts).
    if (sp || params.has('nocine')) brief();
    else playOpening();
  };

  // ---------- EXPEDITION 02 opening: narrated prologue → orbital journey → descent → first steps ----------
  const landerFwd = new Vector3(Math.sin(landerYaw), 0, Math.cos(landerYaw));
  const newGameSpawn = {
    x: LANDING.x + landerFwd.x * 6.5 + landerFwd.z * 1.2,
    z: LANDING.z + landerFwd.z * 6.5 - landerFwd.x * 1.2,
    yaw: yawTowards(SITES.outpost.x - LANDING.x, SITES.outpost.z - LANDING.z),
  };
  const fxWash = h('div.cine-wash'), fxFrame = h('div.cine-frame'), fxTele = h('div.cine-telemetry'), fxNoise = h('div.cine-noise');
  // EXPEDITION 02 title sequence: motion design authored and rendered with HyperFrames (assets-src/hf-title) as alpha WebM.
  const fxVideo = h<'video'>('video.cine-video', { src: `${base}assets/video/title_expedition02.webm`, muted: true, playsInline: true, preload: 'auto' });
  fxVideo.addEventListener('ended', () => fxVideo.classList.remove('on'));
  cutscenes.el.append(fxWash, fxFrame, fxTele, fxNoise, fxVideo);
  const subtitleEl = ui.querySelector('.subtitle');
  const openingFx: OpeningFx = {
    say: (id) => voice.say(id),
    flash: (color, a) => { fxWash.style.background = color; fxWash.style.opacity = String(Math.max(0, Math.min(1, a))); },
    frame: (kind) => { fxFrame.className = 'cine-frame' + (kind ? ` ${kind} on` : ''); },
    hud: (lines) => { fxTele.textContent = lines ? lines.join(String.fromCharCode(10)) : ''; },
    interference: (on) => { fxNoise.classList.toggle('on', on); subtitleEl?.classList.toggle('glitch', on); if (on) audio.cue('transmit'); },
    cue: (k) => audio.cue(k),
    rumble: (l) => audio.setRumble(l),
    titleVideo: () => {
      fxVideo.currentTime = 0;
      fxVideo.classList.add('on');
      const p = fxVideo.play();
      if (p) p.catch(() => fxVideo.classList.remove('on'));
      return true;
    },
  };
  const groundAt = (x: number, z: number) => ground.at(x, z, world.heightAt(x, z) + 2).h;
  const playOpening = () => {
    const toSpace = () => {
      clearOverlay();
      setMode('cutscene');
      spaceCut = true;
      audio.start();
      const cut = spaceOpening(space, openingFx);
      const skip = cut.onSkip;
      cut.onSkip = () => { skip?.(); voice.flush(); fxVideo.pause(); fxVideo.classList.remove('on'); };
      cutscenes.play(cut, () => { spaceCut = false; openingFx.flash('#000', 0); playLanding(); });
    };
    void playNarratedIntro(toSpace).then((ok) => { if (!ok) toSpace(); });
  };
  const playLanding = () => {
    setMode('cutscene');
    player.teleport(newGameSpawn.x, newGameSpawn.z, newGameSpawn.yaw);
    player.pitch = 0;
    const cut = landingCutscene({
      lander, shell: landerShell, site: landerSite, yaw: landerYaw, groundY: groundAt, dust: landingDust,
      actor, eye: () => cineWorld.eye(), fov: gameFov,
    }, openingFx);
    const skip = cut.onSkip;
    cut.onSkip = () => { skip?.(); voice.flush(); };
    cutscenes.play(cut, () => {
      camera.fov = gameFov;
      camera.updateProjectionMatrix();
      mission.flags.add('seen.opening');
      beginPlay(`Objective: ${mission.current?.title ?? OBJECTIVES[0].title}`);
      void saveNow();
    });
  };

  /** The user's own narration (public/assets/audio/voice/custom/intro.* + intro.json cues) over a tour cut to its length. */
  let visorRig: VisorRig | null = null;
  let debris: DebrisGust | null = null;
  let visorMotion: AstronautMotion | null = null;
  const playNarratedIntro = async (then: () => void): Promise<boolean> => {
    try {
      const dir = `${base}assets/audio/voice/custom/`;
      const r = await fetch(`${dir}intro.json`);
      if (!r.ok || (r.headers.get('content-type') ?? '').includes('html')) return false;
      const meta = (await r.json()) as { audio: string | null; cues: NarrationCue[] };
      audio.start();
      let url: string | null = null;
      for (const f of [meta.audio, 'intro.mp3', 'intro.wav', 'intro.m4a', 'intro.ogg']) {
        if (!f) continue;
        const hd = await fetch(dir + f, { method: 'HEAD' });
        if (hd.ok && !(hd.headers.get('content-type') ?? '').includes('html')) { url = dir + f; break; }
      }
      const buf = url ? await audio.load(url) : null;
      if (!url || !buf) return false;
      const n = NODES as unknown as Record<string, { x: number; z: number; floor: number }>;
      const at = (k: string) => new Vector3(n[k].x, n[k].floor, n[k].z);
      const cut = narratedIntro({
        groundY: (x, z, y) => ground.at(x, z, y ?? world.heightAt(x, z) + 2).h,
        outpost: { x: SITES.outpost.x, z: SITES.outpost.z, floorY: outpostModel?.floorY ?? padY },
        caveOut: at('mouthOut'), caveIn: at('mouthIn'), hall: at('hall'), ice: cave.interact.ice.clone(),
        rover: drivable?.pos.clone() ?? new Vector3(SITES.rover.x, world.heightAt(SITES.rover.x, SITES.rover.z), SITES.rover.z),
        drill: new Vector3(SITES.drill.x, world.heightAt(SITES.drill.x, SITES.drill.z), SITES.drill.z),
        eye: () => cineWorld.eye(), fov: gameFov,
        visor: {
          begin: (at, face, wind) => {
            if (!actor) return;
            actor.place(at.x, at.y, at.z, face.x - at.x, face.z - at.z);
            actor.root.visible = true;
            actor.play('idle', 0);
            visorRig ??= new VisorRig(actor.root, scene);
            visorMotion ??= new AstronautMotion(actor.root);
            visorRig.active = true;
            debris = new DebrisGust(scene, at.clone().add(new Vector3(0, 1.5, 0)), wind);
          },
          update: (dt, t) => {
            actor?.update(dt);
            if (actor) visorMotion?.update(dt, actor.root.rotation.y, 0, 0, true); // relaxed arms, breathing
            debris?.update(dt, t);
            visorRig?.update(renderer);
          },
          end: () => {
            if (actor) actor.root.visible = false;
            if (visorRig) visorRig.active = false;
            debris?.dispose(); debris = null;
          },
        },
      }, buf.duration, meta.cues?.length ? meta.cues : []);
      const visorCleanup = cut.cleanup;
      cut.cleanup = () => { visorCleanup?.(); audio.stopVoice(); };
      clearOverlay();
      setMode('cutscene');
      void audio.playVoice(url, false);
      cutscenes.play(cut, () => { camera.fov = gameFov; camera.updateProjectionMatrix(); then(); });
      return true;
    } catch (e) {
      console.warn('Narrated intro unavailable:', e);
      return false;
    }
  };

  // ---------- ORBITAL COMMAND (menu) ----------
  let spaceCut = false;
  const menuTarget = { focus: 0, selected: 0 };
  let telemetryTimer = 0;
  const menuPose = { pos: new Vector3(), look: new Vector3(), fov: 40 };
  const orbitalMenuTick = (dt: number) => {
    space.focus += (menuTarget.focus - space.focus) * Math.min(1, dt * 1.3);
    space.selected += (menuTarget.selected - space.selected) * Math.min(1, dt * 2.2);
    space.menuPose(menuPose);
    space.camera.position.copy(menuPose.pos);
    space.camera.lookAt(menuPose.look);
    if (Math.abs(space.camera.fov - menuPose.fov) > 1e-3) { space.camera.fov = menuPose.fov; space.camera.updateProjectionMatrix(); }
    space.update(dt);
    if ((telemetryTimer -= dt) <= 0) {
      telemetryTimer = 0.25;
      const now = new Date(), sol = 87 + (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 88775;
      menu.setTelemetry([
        'ORBITAL COMMAND · MARS TRANSFER NETWORK',
        `UTC ${now.toISOString().slice(11, 19)}  ·  MSD ${(53800 + sol).toFixed(3)}`,
        'EXPEDITION 02  ·  TRANSIT STAGE NOMINAL',
        `PERIAPSIS 840 km  ·  APOAPSIS ${(842 + Math.sin(performance.now() / 9000) * 2).toFixed(0)} km`,
        'RELAY SATS  MRO-B · MAVEN-2 · ODY-R  — LINK OK',
        `SIGNAL DELAY ${(12.4 + Math.sin(performance.now() / 20000) * 0.05).toFixed(2)} min one-way`,
        'PHOBOS 9,376 km · DEIMOS 23,463 km',
      ]);
    }
  };
  const ndc = (e: PointerEvent | MouseEvent) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1] as const; };
  const menuInteractive = () => mode === 'menu' && !overlay && !(cine.active || studioOn);
  canvas.addEventListener('pointermove', (e) => {
    if (!menuInteractive() || menu.sidebarOpen) { space.hover = 0; menu.setHover(false); return; }
    const [x, y] = ndc(e);
    const on = space.hitMars(x, y);
    space.hover = on ? 1 : 0;
    menu.setHover(on);
  });
  canvas.addEventListener('click', (e) => {
    if (!menuInteractive() || menu.sidebarOpen) return;
    const [x, y] = ndc(e);
    if (space.hitMars(x, y)) { audio.start(); audio.ui('interact'); menu.showSidebar(true); }
  });
  /** NEW EXPEDITION: Mars selection + Mission Control briefing (script scene 02). */
  const openBriefing = () => {
    clearOverlay();
    menu.showSidebar(true);
    audio.start();
    voice.say('o_brief');
  };
  const launchExpedition = () => {
    menu.setLaunchBusy(true);
    voice.flush();
    audio.cue('whoosh');
    setTimeout(() => { menu.setLaunchBusy(false); startNewGame(); }, 650);
  };

  const menu = new MainMenu(ui, settings, {
    onNewGame: () => {
      if (!hasSave) { openBriefing(); return; }
      clearOverlay();
      overlay = card(ui, 'NEW EXPEDITION', 'Start a new expedition?', ['Starting a new expedition replaces your saved mission progress. This cannot be undone.'], [
        { label: 'Start new expedition', primary: true, fn: () => { clearOverlay(); void saveStore.clear().then(() => { hasSave = false; void refreshMenuSave(); openBriefing(); }); } },
        { label: 'Cancel', fn: clearOverlay },
      ]);
    },
    onLaunch: () => {
      if (!hasSave) { launchExpedition(); return; }
      overlay = card(ui, 'LAUNCH EXPEDITION', 'Overwrite your saved mission?', ['Launching a new expedition replaces your saved mission progress. Use CONTINUE MISSION to resume it instead.'], [
        { label: 'Launch new expedition', primary: true, fn: () => { clearOverlay(); void saveStore.clear().then(() => { hasSave = false; void refreshMenuSave(); launchExpedition(); }); } },
        { label: 'Cancel', fn: clearOverlay },
      ]);
    },
    onSidebar: (open) => {
      menuTarget.focus = open ? 1 : 0;
      menuTarget.selected = open ? 1 : 0;
      audio.start();
      audio.ui(open ? 'scan' : 'notice');
      if (!open) voice.flush();
    },
    onExit: () => {
      clearOverlay();
      overlay = card(ui, 'EXIT', 'Leave Orbital Command?', ['Your mission progress is saved automatically. A browser game cannot close its own tab — close this tab (Ctrl + W) to exit.'], [
        { label: 'Close tab', primary: true, fn: () => { window.close(); } },
        { label: 'Stay', fn: clearOverlay },
      ]);
    },
    onContinue: async () => {
      const r = await saveStore.load();
      if (r.status !== 'ok') { void refreshMenuSave(); return; }
      applySave(r.data);
      const cur = mission.current;
      beginPlay(cur ? `Objective: ${cur.title}` : 'All current objectives complete');
    },
    onSettings: applySettings,
  });

  document.addEventListener('pointerlockchange', () => {
    if (input.locked) {
      if (mode === 'paused') { clearOverlay(); setMode(resumeMode); }
    } else if (mode === 'playing' || mode === 'driving') pause();
    else if (mode === 'reading') { reader.close(); setMode('playing'); pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    audio.suspend(document.hidden);
    if (document.hidden && (mode === 'playing' || mode === 'paused')) void saveNow();
  });
  window.addEventListener('pagehide', () => { if (mode === 'playing' || mode === 'paused') void saveNow(); });
  canvas.addEventListener('click', () => { if (mode === 'playing' && !input.locked) input.requestLock(); });

  // ---------- EXPEDITION 02 campaign (chapters 1–8 + epilogue) ----------
  const nodeAt = (k: string) => { const n = (NODES as unknown as Record<string, { x: number; z: number; floor: number }>)[k]; return new Vector3(n.x, n.floor, n.z); };
  const floorY = outpostModel?.floorY ?? padY;
  /** Objective cinematics: gameplay pauses for the shot and resumes in the same mode (walking or driving). */
  const playCine = (c: CutsceneDef, then?: () => void) => {
    const back: Mode = mode === 'driving' ? 'driving' : 'playing';
    if (mode === 'reading') reader.close();
    clearOverlay();
    setMode('cutscene');
    const skip = c.onSkip;
    c.onSkip = () => { skip?.(); };
    cutscenes.play(c, () => {
      camera.fov = gameFov;
      camera.updateProjectionMatrix();
      if (mode === 'cutscene') setMode(back);
      then?.();
    });
  };
  const revealVoice = ['reveal:ice:1', 'reveal:ice:2', 'reveal:ice:3', 'reveal:ice:4', 'reveal:ice:5', 'reveal:ice:6', 'reveal:ice:7'].reduce((n, t) => n + triggerLength(t), 0);
  campaign = new CampaignDirector({
    ui, scene, mission, voice, hud, audio, interactions, inventory,
    env: { eye: () => cineWorld.eye(), fov: gameFov, groundY: (x, z, y) => cineWorld.groundY(x, z, y) },
    playerPos: () => player.pos,
    indoors,
    inCave: () => player.inCave || adapt > 0.35,
    showRecord: (r) => { mission.addRecord(r.id); showRecord(r); },
    playCine,
    placeInOutpost: placeProp,
    placeOnGround: (g, x, z, yaw, r, hgt) => {
      const y = ground.at(x, z, world.heightAt(x, z) + 3).h;
      g.position.set(x, y, z); g.rotation.y = yaw; scene.add(g);
      if (r) colliders.add(x, z, r, y - 1, y + (hgt ?? 2));
      return g.position.clone();
    },
    vehicle: () => mev,
    rover: () => drivable,
    driving: () => (mode === 'driving' ? driven : null),
    sites: {
      outpost: new Vector3(SITES.outpost.x, floorY, SITES.outpost.z),
      reactor: new Vector3(SITES.reactor.x, world.heightAt(SITES.reactor.x, SITES.reactor.z), SITES.reactor.z),
      drill: drill.console.clone(), caveMouth: nodeAt('mouthOut'), caveIn: nodeAt('mouthIn'), caveHall: nodeAt('hall'),
      lastBeacon: cave.interact.lastBeacon, ice: cave.interact.ice,
      ridge: new Vector3(RIDGE.x, world.heightAt(RIDGE.x, RIDGE.z), RIDGE.z),
    },
    facility: { farm: bedProps[0].pos, locker: lockerPos, comms: commsPos, shields: shieldPos, terminal: outpost.anchors.terminal, baseStatus: outpost.anchors.baseStatus, airlock: outpost.anchors.airlock },
    setOutpostPower: (l) => { outpostPower = l; },
    setStorm: (l) => { storm = stormOverride ?? l; },
    setAirlockLocked: (locked) => doors?.setPowered(!locked),
    mapTexture: null,
    saveDirty: () => { saveDirty = true; },
    save: () => void saveNow(),
    iceCut: () => {
      const c = iceCutscene(cineWorld);
      const total = c.shots.reduce((n, s) => n + s.duration, 0);
      const want = Math.max(total, revealVoice + 3);
      for (const sh of c.shots) sh.duration *= want / total;
      c.captions = [{ at: want - 5.5, dur: 5, kind: 'title', eyebrow: 'SUBSURFACE · LOWER CHAMBER', text: 'WATER ICE' }];
      c.id = 'ice_reveal';
      return c;
    },
    finale: (k) => playFinale(k),
  }, { garage: GARAGE, survey: SURVEY, station: STATION, facility: FAC_SITE });
  // Walls of the hangar and the facility module (the hangar is open at the front so MEV-1 can drive in and out).
  {
    const g = campaign.props.garage.group, f = campaign.props.facility.group;
    const wall = (grp: typeof g, lx: number, lz: number, r: number, h: number) => { const w = grp.localToWorld(new Vector3(lx, 0, lz)); colliders.add(w.x, w.z, r, w.y - 1, w.y + h); };
    g.updateMatrixWorld(true); f.updateMatrixWorld(true);
    for (let z = -5.8; z <= 5.8; z += 0.8) { wall(g, -4.6, z, 0.35, 4.6); wall(g, 4.6, z, 0.35, 4.6); }
    for (let x = -4.2; x <= 4.2; x += 0.8) wall(g, x, -6.1, 0.35, 4.6);
    for (let x = -5.5; x <= 5.5; x += 1.4) wall(f, x, -2.5, 2.2, 5.4);
  }
  placeMevInGarage();
  campaign.restore();

  /** Epilogue: final cinematic — the astronaut outside, the camera rising over the settlement, the final log. */
  const playFinale = (k: 'A' | 'B' | 'C') => {
    const O = SITES.outpost;
    const air = (dx: number, dz: number, up: number) => new Vector3(O.x + dx, Math.max(world.heightAt(O.x + dx, O.z + dz), floorY) + up, O.z + dz);
    const look = (dx: number, dy: number, dz: number) => new Vector3(O.x + dx, floorY + dy, O.z + dz);
    const walkFrom = air(2, -16, 0), walkTo = air(6, -30, 0);
    const l1 = triggerLength('final:1'), l2 = triggerLength('final:2');
    const T = Math.max(30, l1 + l2 + 9);
    const cut: CutsceneDef = {
      id: 'finale',
      holdLastFrame: true,
      shots: [
        { duration: T * 0.28, fadeIn: 1.2, path: [{ pos: air(-1, -12, 1.7), look: walkTo.clone().add(new Vector3(0, 1.6, 0)), fov: 46 }, { pos: air(0, -20, 1.9), look: air(10, -60, 2), fov: 44 }] },
        { duration: T * 0.42, ease: 'inOut', path: [{ pos: air(-6, -36, 3), look: look(0, 4, 0), fov: 44 }, { pos: air(-30, -70, 24), look: look(0, 2, 0), fov: 42 }, { pos: air(-60, -120, 60), look: look(0, 0, 10), fov: 40 }] },
        { duration: T * 0.30, fadeOut: 3.2, path: [{ pos: air(-60, -120, 60), look: look(0, 0, 10), fov: 40 }, { pos: air(-120, -260, 110), look: look(-200, 40, 400), fov: 38 }] },
      ],
      cues: [
        { at: 0.2, run: () => { audio.cue('swell'); if (actor) { actor.root.visible = true; actor.place(walkFrom.x, walkFrom.y, walkFrom.z, walkTo.x - walkFrom.x, walkTo.z - walkFrom.z); actor.play('walk', 0.3, 0.8); } } },
        { at: 1.5, run: () => voice.trigger('final:1') },
        { at: 1.5 + l1 + 1.6, run: () => voice.trigger('final:2') },
        { at: T * 0.3, run: () => actor?.play('idle', 0.6) },
      ],
      update: (t, dt) => {
        if (!actor) return;
        const u = Math.min(1, t / (T * 0.3));
        const p = walkFrom.clone().lerp(walkTo, u);
        actor.place(p.x, world.heightAt(p.x, p.z), p.z, walkTo.x - walkFrom.x, walkTo.z - walkFrom.z);
        actor.update(dt);
      },
      cleanup: () => { if (actor) actor.root.visible = false; },
    };
    clearOverlay();
    setMode('cutscene');
    cutscenes.play(cut, () => {
      input.releaseLock();
      setMode('end');
      const rec = { A: 'Recommend expansion — additional research facilities near the confirmed ice deposits.', B: 'Recommend further research — more geological surveys and environmental testing before expansion.', C: 'Preserve the findings — the station preserved and all findings submitted for international scientific review.' }[k];
      overlay = card(ui, 'MISSION COMPLETE · MARS 2043', 'EXPEDITION 02', [
        "The journey doesn't end here.",
        `Your recommendation: ${rec}`,
        "HUMANITY'S FUTURE IS STILL UNWRITTEN.",
        'We didn’t come to Mars to conquer it. We came to understand it.',
      ], [
        { label: 'Keep exploring', primary: true, fn: () => { cutscenes.release(); beginPlay('Mission complete — free exploration.'); } },
        { label: 'Main menu', fn: () => { cutscenes.release(); clearOverlay(); void refreshMenuSave(); setMode('menu'); } },
      ]);
    });
  };

  // ---------- interactables ----------
  if (mev) interactions.add({
    id: 'mevBoard', label: 'MEV-1', verb: 'Board', position: mevDoorPos, range: 3.4,
    enabled: () => mission.current?.id !== 'inspect_vehicle',
    status: () => (campaign?.vehicleUnlocked ? `battery ${Math.round(mev!.battery)}%${mev!.charging ? ' · charging' : ''}` : 'systems dormant — restore at the maintenance terminal'),
    interact: boardMev,
  });
  interactions.add({
    id: 'locker', label: 'Supply locker', verb: 'Access', position: lockerPos, range: 3.2,
    status: () => `${lockers.locker_main.slots.filter(Boolean).length} stacks stored`,
    interact: openStorage,
  });
  for (const b of bedProps) {
    interactions.add({
      id: `bed:${b.i}`, label: `Grow bed ${b.i + 1}`, verb: 'Activate', position: b.pos, range: 2.8,
      status: () => {
        const s = facilities.s.beds[b.i], a = facilities.bedAction(b.i, inventory.count('seed_pack'));
        const what = s.stage === 'growing' ? `growing ${Math.round(s.growth * 100)}% · water ${Math.round(s.water * 100)}%${facilities.power.lightsOn ? '' : ' · NO POWER'}`
          : s.stage === 'ready' ? 'ready' : s.stage === 'dead' ? 'crop dead' : `empty · ${inventory.count('seed_pack')} seed packs`;
        return `${a.verb} — ${what}`;
      },
      interact: () => useBed(b.i),
    });
  }
  interactions.add({
    id: 'comms', label: 'Comms uplink', verb: 'Activate', position: commsPos, range: 2.8,
    status: () => {
      const p = facilities.pendingReport(discoveries.map((d) => d.id), sampleTotal());
      if (p.discoveries.length || p.batches) return 'transmit field report';
      const c = facilities.canRequestDrop(playSeconds);
      return c.ok ? `request supply drop (${facilities.s.credits} credit${facilities.s.credits === 1 ? '' : 's'})` : c.why ?? '';
    },
    interact: () => { if (campaign?.handle('comms')) return; useComms(); },
  });
  interactions.add({
    id: 'shields', label: 'Radiation shield generator', verb: 'Activate', position: shieldPos, range: 2.8,
    status: () => `${facilities.s.shields ? 'ON' : 'OFF'} · field ${Math.round(facilities.s.shieldLevel * 100)}% · power ${facilities.power.demand.toFixed(1)}/${facilities.power.output.toFixed(1)} kW`,
    interact: toggleShields,
  });
  interactions.add({
    id: 'terminal', label: 'Mission terminal', verb: 'Access', position: outpost.anchors.terminal, range: 3.2,
    status: () => {
      const id = mission.current?.id;
      return ({ emergency_power: 'activate emergency power', restoration: 'final habitat assessment', storm_mode: 'enable storm mode', review: 'open geological archive', final_report: 'compile final report', assessment: 'final mission assessment', choice: 'send recommendation' } as Record<string, string>)[id ?? ''] ?? null;
    },
    interact: () => {
      if (campaign?.handle('terminal')) return;
      mission.addRecord('assignment');
      showRecord(RECORDS.assignment);
    },
  });
  interactions.add({
    id: 'baseStatus', label: 'Outpost systems', verb: 'Access', position: outpost.anchors.baseStatus, range: 3.2,
    interact: () => { campaign?.handle('baseStatus'); showRecord(baseStatusRecord(baseSim)); },
  });
  interactions.add({
    id: 'airlock', label: 'suit at airlock', verb: 'Recharge', position: outpost.anchors.airlock, range: 3.6,
    status: () => (suit.oxygen > 99 && suit.power > 99 ? 'full' : null),
    interact: () => { suit.recharge(); audio.ui('complete'); hud.notify('Suit oxygen and power restored.', 'good'); },
  });
  interactions.add({
    id: 'rover', label: 'Rover R-1 service panel', verb: 'Inspect', position: rover.servicePanel, range: 3.2,
    interact: () => {
      if (mission.flags.has('done.r1_link') || mission.complete) { showRecord(RECORDS.rover_log); return; }
      audio.ui('warn'); hud.notify('R-1 is in safe mode — establish the remote link through the PDA (Rover R-1 tab).', 'warn');
    },
  });
  interactions.add({
    id: 'drill', label: 'DRL-2 drill console', verb: 'Activate', position: drill.console, range: 3.2,
    status: () => (drill.state === 'running' ? `drilling ${Math.round(drill.progress * 100)}%` : drill.state === 'done' ? 'core recovered' : null),
    interact: () => {
      if (drill.state === 'done') { showRecord(RECORDS.core_drl2); return; }
      if (drill.state === 'running') return;
      if (!campaign?.drillUnlocked) { audio.ui('warn'); hud.notify('Drill locked: no survey order on file for DRL-2.', 'warn'); return; }
      drill.start();
      audio.ui('interact');
      hud.notify('Drill started. Core sample in progress…');
    },
  });
  interactions.add({
    id: 'beacon', label: 'survey beacon B-5', verb: 'Inspect', position: cave.interact.lastBeacon, range: 3,
    interact: () => {
      if (campaign?.handle('beacon')) return;
      mission.addRecord('beacon_log');
      showRecord(RECORDS.beacon_log);
    },
  });
  interactions.add({
    id: 'cache', label: 'Expedition 1 sample case', verb: 'Inspect', position: cave.interact.cache, range: 2.8,
    interact: () => { mission.addRecord('west_cache'); showRecord(RECORDS.west_cache); hud.notify('Optional discovery logged to PDA.', 'good'); saveDirty = true; },
  });
  interactions.add({
    id: 'ice', label: 'the deposit', verb: 'Inspect', position: cave.interact.ice, range: 4.5,
    status: () => (mission.current?.id === 'ice_sample' ? 'collect a controlled ice sample' : mission.current?.id === 'ice' ? 'investigate' : 'analysed'),
    interact: () => {
      if (campaign?.handle('ice')) return;
      showRecord(RECORDS.ice_discovery);
    },
  });

  events.on('notice', (n) => { hud.notify(n.text, n.tone); audio.ui(n.tone === 'warn' ? 'warn' : 'notice'); });
  events.on('objective', (o) => { saveDirty = true; voice.trigger(`objective:${o.id}`); });
  events.on('record', () => { saveDirty = true; });
  events.on('endOfBuild', () => { void saveNow(); }); // the campaign's finale handles the ending
  events.on('objective', () => campaign?.tickTargets());

  // ---------- loop ----------
  const markers = (): MapMarker[] => {
    const done = (id: string) => mission.complete || mission.flags.has(`done.${id}`);
    const list: MapMarker[] = [{ x: SITES.outpost.x, z: SITES.outpost.z, label: 'Outpost', kind: 'site' }, { x: LANDING.x, z: LANDING.z, label: 'Lander', kind: 'site' }];
    if (done('garage')) list.push({ x: GARAGE.x, z: GARAGE.z, label: 'Garage', kind: 'site' });
    if (mev && done('restore_vehicle')) list.push({ x: mev.pos.x, z: mev.pos.z, label: 'MEV-1', kind: 'site' });
    if (done('first_deploy')) list.push({ x: drivable?.pos.x ?? SITES.rover.x, z: drivable?.pos.z ?? SITES.rover.z, label: 'Rover R-1', kind: 'site' });
    if (done('transmission1')) list.push({ x: SITES.drill.x, z: SITES.drill.z, label: 'DRL-2', kind: 'site' });
    if (done('recorder')) list.push({ x: NODES.mouthOut.x, z: NODES.mouthOut.z, label: 'Cave', kind: 'site' });
    if (done('reconstruct')) list.push({ x: FAC_SITE.x, z: FAC_SITE.z, label: "Facility", kind: "site" });
    const cur = mission.current;
    if (cur) list.push({ x: cur.target.x, z: cur.target.z, label: cur.target.label, kind: 'objective' });
    return list;
  };

  /** Free camera used only by automated screenshot views (e.g. a top-down view of the outpost). */
  let shotCam: { pos: Vector3; look: Vector3 } | null = null;
  let frames = 0, fpsAcc = 0, fps = 0, devTimer = 0, t = 0;
  const menuCam = new Vector3();
  const tmp = new Vector3();

  const sim = (dt: number) => {
    t += dt;
    cave.update(dt);
    if (drill.update(dt)) {
      mission.addRecord('core_drl2');
      audio.ui('complete');
      hud.notify('Core sample recovered. Telemetry logged to PDA.', 'good');
      campaign?.notify('drill:done');
    }
    campaign?.update(dt, mode === 'playing' || mode === 'driving');
    mev?.update(dt);
    { const pw = facilities.power; baseSim.demand = pw.demand + Math.sin(t * 0.05) * 0.4; baseSim.output = pw.output + Math.sin(t * 0.013) * 0.3; baseSim.farm = facilities.farmHealth; }
    updateFacilities(dt, mode === 'playing' || mode === 'driving' || mode === 'storage' || mode === 'reading' || mode === 'pda');
    for (const b of outpost.anchors.blinkers) (b.material as MeshStandardMaterial).emissiveIntensity = (t % 1.6) < 0.25 ? 8 : 0.2;

    if (mode === 'driving' && (driven === 'r1' ? drivable : mev)) {
      playSeconds += dt;
      const thr = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      const steer = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      if (driven === 'r1' && drivable) {
        // Remote: the astronaut stays where they are; R-1 moves under PDA commands.
        const before = Math.abs(drivable.speed);
        if (drivable.step(dt, { throttle: thr, steer, brake: input.down('Space') }, roverGround, roverObstacles, roverPad) && before > 1.5) { audio.ui('warn'); hud.notify('R-1 collision — condition reduced.', 'warn'); }
        if (drivable.battery <= 0 && before > 0.1 && Math.abs(drivable.speed) < 0.1) hud.notify('R-1 battery depleted — it must recharge on the outpost pad.', 'warn');
        syncRoverAnchors();
        if (remoteSignal() < 0.03) { hud.notify('R-1 relay signal lost.', 'warn'); exitRemote(); }
        doors?.update(dt, player.pos);
        if (suit.update(dt, false, lampOn) === 'failed') exitRemote();
      } else if (mev) {
        const before = Math.abs(mev.speed);
        if (!mev.powered && thr) hud.notify('MEV-1 systems offline.', 'warn');
        if (mev.step(dt, { throttle: thr, steer, brake: input.down('Space') }, roverGround, mevObstacles, (p) => campaign?.props.garage.inBay(p) ?? false) && before > 2) { audio.ui('warn'); hud.notify('Collision — MEV-1 condition reduced.', 'warn'); }
        if (mev.battery <= 0 && before > 0.1 && Math.abs(mev.speed) < 0.1) hud.notify('MEV-1 battery depleted — recharge it in the hangar bay.', 'warn');
        audio.setRumble(Math.min(1, 0.15 + Math.abs(mev.speed) / 11 * 0.6 + Math.abs(thr) * 0.15) * 0.45, 1.3);
        player.pos.set(mev.pos.x, mev.pos.y + 0.8, mev.pos.z);
        player.prevPos.copy(player.pos);
        syncMev();
        if (suit.update(dt, false, lampOn) === 'failed') exitMev();
      }
      if (saveDirty || playSeconds - lastSaveAt > 30) void saveNow();
      return;
    }
    if (mode !== 'cutscene') audio.setRumble(0);
    if (mode !== 'playing') return;
    playSeconds += dt;
    player.canSprint = suit.power > 0;
    doors?.update(dt, player.pos);
    player.step(dt, input);
    if (lampOn && suit.power <= 0) { lampOn = false; hud.notify('Suit power depleted — lamp off.', 'warn'); }
    if (suit.update(dt, player.sprinting, lampOn) === 'failed') {
      input.releaseLock();
      clearOverlay();
      setMode('failed');
      overlay = card(ui, 'SUIT FAILURE', 'Life support exhausted', ['Your suit ran out of oxygen. In this build you are recovered to the outpost with systems recharged.', 'Watch the oxygen bar and recharge at the outpost airlock before long excursions.'], [
        { label: 'Recover at outpost', primary: true, fn: () => { suit.recharge(); suit.health = 100; player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw); beginPlay(); } },
      ]);
      return;
    }
    // Rock drill: cutting a sample takes a few seconds; walking away cancels.
    if (mining.deposit) {
      const dep = ore.deposits.get(mining.deposit)!;
      if (player.pos.distanceTo(dep.pos) > 4.5 || hotbar.selectedItem !== 'hand_drill') {
        mining.deposit = null;
        hud.notify('Drilling interrupted.', 'warn');
      } else {
        mining.progress = Math.min(1, mining.progress + dt / mining.duration);
        mining.grind -= dt;
        if (mining.grind <= 0) { mining.grind = 0.2; audio.ui('grind'); }
        if (mining.progress >= 1) {
          const p = ore.mine(dep.def.id, player.pos);
          mining.deposit = null;
          if (p) { addPickupInteractable(p); hud.notify('Sample cut free — collect it [E].'); saveDirty = true; }
        }
      }
    }
    if (!lampHinted && adapt > 0.45 && !lampOn) { lampHinted = true; hud.notify('It is dark in here — press F for your suit lamp.'); }
    if (adapt > 0.45) voice.trigger('first:cave');
    if (indoors()) voice.trigger('first:dome');
    if (suit.oxygen < 30 && !o2Warned) { o2Warned = true; voice.trigger('warn:oxygen'); }
    if (suit.oxygen > 60) o2Warned = false;
    if (saveDirty || playSeconds - lastSaveAt > 30) void saveNow();
  };

  const render = (dt: number, alpha: number) => {
    if (input.consume('F3')) { devVisible = !devVisible; dev.classList.toggle('hidden', !devVisible); }
    if (mode === 'playing') {
      player.look(input);
      if (input.consume('KeyE')) interactions.trigger();
      if (input.consume('KeyF')) { lampOn = !lampOn && suit.power > 0; audio.ui('lamp'); }
      if (input.consume('Tab')) { input.releaseLock(); setMode('pda'); pda.show(player.pos.x, player.pos.z, player.heading, markers()); }
      for (let k = 1; k <= 5; k++) if (input.consume(`Digit${k}`)) { hotbar.select(k - 1); refreshHotbar(); saveDirty = true; }
      if (input.consume('KeyQ')) useSelected();
      if (input.consume('KeyV') && body) { body.thirdPerson = !body.thirdPerson; body.resetCamera(); hud.notify(body.thirdPerson ? 'Third-person view (V) · mouse wheel: distance' : 'First-person view (V)'); }
      if (body?.thirdPerson) { const w = input.takeWheel(); if (w) body.zoom(w); }
      if (devVisible) {
        const tp: Array<[string, number, number, number | undefined]> = [
          ['F5', SPAWN.x, SPAWN.z, undefined], ['F6', SITES.rover.x - 8, SITES.rover.z - 6, undefined],
          ['F7', SITES.drill.x - 10, SITES.drill.z + 10, undefined], ['F8', SITES.cave.x, SITES.cave.z + 8, undefined],
          ['F9', NODES.hall.x, NODES.hall.z, NODES.hall.floor + 2], ['F10', cave.interact.ice.x + 3, cave.interact.ice.z + 8, cave.interact.ice.y + 1],
        ];
        for (const [key, x, z, y] of tp) if (input.consume(key)) player.teleport(x, z, player.yaw, y);
      }
    } else if (mode === 'driving') {
      const [mx, my] = input.takeMouse();
      roverLook.yaw = Math.max(-2.6, Math.min(2.6, roverLook.yaw - mx * 0.0025 * player.sensitivity));
      roverLook.pitch = Math.max(-0.7, Math.min(0.6, roverLook.pitch - my * 0.0025 * player.sensitivity * (player.invertY ? -1 : 1)));
      const wheel = input.takeWheel();
      if (wheel) roverZoom = Math.max(0.5, Math.min(2.5, roverZoom * (wheel > 0 ? 1.12 : 1 / 1.12)));
      if (input.consume('KeyC')) {
        roverLook.yaw = 0; roverLook.pitch = 0; roverZoom = 1;
        if (driven === 'r1') { roverCam = roverCam === 'chase' ? 'mast' : 'chase'; hud.notify(roverCam === 'mast' ? 'R-1 mast camera (mouse: pan/tilt, wheel: zoom)' : 'R-1 chase camera'); }
        else { mevCam = mevCam === 'chase' ? 'cockpit' : 'chase'; hud.notify(mevCam === 'cockpit' ? 'Cockpit view' : 'Chase camera'); }
      }
      if (input.consume('KeyR')) { roverLook.yaw = 0; roverLook.pitch = 0; }
      if (input.consume('KeyF')) { lampOn = !lampOn && suit.power > 0; audio.ui('lamp'); }
      if (input.consume('KeyL') && driven === 'mev' && mev) { mev.headlights = !mev.headlights; audio.ui('lamp'); }
      if (input.consume('KeyG') && driven === 'r1') remoteScan();
      if (input.consume('KeyE') || (driven === 'r1' && input.consume('Tab'))) { if (driven === 'r1') exitRemote(); else exitMev(); }
    } else if (mode === 'cutscene') {
      if (input.consume('Space') || input.consume('Enter') || input.consume('Escape') || input.consume('KeyE')) cutscenes.pressSkip();
    } else if (mode === 'storage') {
      if (input.consume('KeyE') || input.consume('Escape')) closeStorage();
    } else if (mode === 'reading') {
      if (input.consume('KeyE') || input.consume('Escape')) closeRecord();
    } else if (mode === 'pda') {
      if (input.consume('Tab') || input.consume('Escape')) { pda.close(); input.requestLock(); setMode('playing'); if (!input.locked && !automated) setTimeout(() => { if (!input.locked && mode === 'playing') pause(); }, 250); }
    }
    input.clearPressed();

    // ---------- orbital view: Orbital Command menu and the space half of the opening ----------
    const studioMenu = mode === 'menu' && (cine.active || studioOn);
    if ((mode === 'menu' && !studioMenu) || spaceCut) {
      if (space.camera.aspect !== camera.aspect) space.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
      if (mode === 'cutscene') cutscenes.update(dt, camera);
      else orbitalMenuTick(dt);
      renderer.info.reset();
      space.render(renderer);
      frames++; fpsAcc += dt;
      if (fpsAcc >= 0.5) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; }
      status.fps = fps; status.mode = mode; status.orbital = true; status.pending = terrain.pending;
      return;
    }
    status.orbital = false;

    if (mode === 'cutscene' || cutscenes.holding) {
      cutscenes.update(dt, camera);
    } else if (mode === 'menu' && (cine.active || studioOn)) {
      cine.apply(camera); // authored shot (Theatre.js); live while editing in Studio
    } else if (mode === 'menu') {
      const a = t * 0.025 + 2.2;
      menuCam.set(SITES.outpost.x + Math.cos(a) * 75, 0, SITES.outpost.z + Math.sin(a) * 75);
      menuCam.y = world.heightAt(menuCam.x, menuCam.z) + 9;
      camera.position.copy(menuCam);
      camera.lookAt(SITES.outpost.x, world.heightAt(SITES.outpost.x, SITES.outpost.z) + 6, SITES.outpost.z);
    } else {
      if (mode === 'driving' && driven === 'r1' && drivable) drivable.applyCamera(camera, roverCam, roverLook, roverZoom, dt, roverGround);
      else if (mode === 'driving' && driven === 'mev' && mev) mev.applyCamera(camera, mevCam, roverLook, roverZoom, dt, roverGround, (x, y, z) => camBlocker.blocked(x, y, z));
      else if (body?.thirdPerson) body.applyCamera(camera, player.pos, player.yaw, player.pitch, dt, camBlocker);
      else player.applyCamera(camera, mode === 'playing' ? alpha : 1);
    }
    if (shotCam) { camera.position.copy(shotCam.pos); camera.lookAt(shotCam.look); }

    // Eye adaptation, fog and dust inside the cave.
    const inside = mode !== 'menu' && ground.insideCave(camera.position.x, camera.position.y, camera.position.z);
    const caveNow = inside ? caveDepthFactor(camera.position.x, camera.position.y, camera.position.z) : 0;
    adapt += (caveNow - adapt) * Math.min(1, dt * 1.2);
    renderer.toneMappingExposure = 1.05 + adapt * 0.85;
    ctx.fog.color.lerpColors(fogOut, fogCave, adapt);
    ctx.fog.density = FOG_DENSITY + adapt * 0.0075;
    dust.setAmount(1 - adapt * 0.7);
    // Dust storm (Ch.4) and restored habitat lighting.
    const stormHere = storm * (indoors() ? 0.3 : 1);
    if (stormHere > 0.001) { ctx.fog.density += stormHere * 0.0075; ctx.fog.color.lerp(stormFog, Math.min(1, stormHere * 0.85)); dust.setAmount(1 + stormHere * 4); }
    ctx.sun.intensity = 3.1 * (1 - 0.72 * storm);
    ctx.hemi.intensity = 1.15 * (1 - 0.35 * storm);
    audio.storm = storm;
    domeLight.intensity += (outpostPower * 26 - domeLight.intensity) * Math.min(1, dt * 1.6);
    const lampLit = mode === 'cutscene' ? cutscenes.lamp : lampOn && mode !== 'menu';
    lamp.intensity = lampLit ? 70 : 0.0001;
    lampFill.intensity = lampLit ? 2.2 : 0;

    if (mode === 'playing' || mode === 'reading') interactions.update(camera);
    else interactions.focused = null;

    terrain.update(camera.position.x, camera.position.z, 4);
    rocks.commit();
    const outpostMeshesDrawn = outpostModel ? outpostModel.update(camera.position) : 0;
    ore.update(t);
    if (mode !== 'cutscene' && landingDust.active) landingDust.update(dt, groundAt);
    voice.updateBed(adapt, audio.started);
    locker.update(dt);
    tool.visible = !shotCam && mode === 'playing' && !body?.thirdPerson && hotbar.selectedItem === 'hand_drill' && inventory.count('hand_drill') > 0;
    body?.update(dt, player.pos, player.vel, player.yaw, player.grounded, ['playing', 'paused', 'reading', 'pda', 'storage', 'failed'].includes(mode), player.pitch, !shotCam && ['playing', 'reading'].includes(mode));
    tool.drilling = mining.deposit !== null;
    tool.update(dt, t, player.moving && player.grounded);
    // Boot prints and kicked-up dust on natural ground (not on the outpost's floors).
    if (mode === 'playing' || mode === 'reading') footprints.update(dt, player.pos, player.vel.x, player.vel.z, player.vel.y, player.yaw, player.grounded, player.sprinting, player.stride, (x, z) => {
      if (outpostModel && outpostModel.grid.floorAt(x, z) !== null) return null;
      return ground.atNatural(x, z, player.pos.y + 0.4);
    });
    status.outpostMeshes = outpostMeshesDrawn;
    ctx.followShadow(camera.position);
    sky.position.copy(camera.position);
    dust.update(dt, camera.position);
    audio.update(dt, {
      cam: camera, cave: adapt, sprinting: player.sprinting, grounded: player.grounded, stride: player.stride, oxygen: suit.oxygen,
      drillRunning: drill.state === 'running', drillPos: drill.group.position, active: mode === 'playing',
    });

    const cur = mission.current;
    const f = interactions.focused;
    const baseProgress = mining.deposit ? { label: 'Drilling sample…', value: mining.progress }
      : scan.state === 'scanning' ? { label: 'Spectrometer scan…', value: scan.progress }
      : drill.state === 'running' && camera.position.distanceTo(drill.group.position) < 60 ? { label: 'Drilling in Progress…', value: drill.progress } : null;
    const progress = campaign?.progress ?? baseProgress;
    hud.update({
      x: player.pos.x, y: player.pos.y, z: player.pos.z, heading: player.heading,
      oxygen: suit.oxygen, power: suit.power, health: suit.health,
      objective: cur, targetY: cur ? targetHeight(cur.id, cur.target.x, cur.target.z) : 0,
      prompt: f ? { verb: f.verb, label: f.label, status: f.status?.() ?? null } : null,
      progress,
      markers: markers(),
    }, camera, dt);

    if (mode === 'driving' && (roverHudTimer -= dt) <= 0) {
      roverHudTimer = 0.1;
      if (driven === 'r1' && drivable) {
        hud.setVehicle({ name: `R-1 · REMOTE LINK ${Math.round(remoteSignal() * 100)}%`, kmh: drivable.kmh, battery: drivable.battery, condition: drivable.condition, pitchDeg: (drivable.pitch * 180) / Math.PI, rollDeg: (drivable.roll * 180) / Math.PI, charging: drivable.charging, camera: roverCam === 'mast' ? `MAST CAM ×${roverZoom.toFixed(1)}` : 'CHASE CAM' });
        remoteEl.textContent = `R-1 REMOTE · SIGNAL ${Math.round(remoteSignal() * 100)}% · BAT ${Math.round(drivable.battery)}% · E ${drivable.pos.x.toFixed(0)} N ${drivable.pos.z.toFixed(0)} · ${roverCam === 'mast' ? 'MASTCAM ×' + roverZoom.toFixed(1) : 'CHASE'}  ·  G scan  ·  E end link`;
      } else if (mev) {
        hud.setVehicle({ name: 'MEV-1 · MANNED EXPLORATION VEHICLE', kmh: mev.kmh, battery: mev.battery, condition: mev.condition, pitchDeg: (mev.pitch * 180) / Math.PI, rollDeg: (mev.roll * 180) / Math.PI, charging: mev.charging, camera: `${mevCam === 'chase' ? 'CHASE CAM' : 'COCKPIT'} · LIGHTS ${mev.headlights ? 'ON' : 'OFF'} [L]` });
      }
    }
    renderer.info.reset(); // frame totals (world + tool pass); autoReset is off
    renderer.render(scene, camera);
    tool.render(renderer, camera, SUN_DIR, 1 - adapt, lampLit);

    frames++; fpsAcc += dt; devTimer -= dt;
    if (fpsAcc >= 0.5) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; }
    status.fps = fps;
    status.pending = terrain.pending;
    status.mode = mode;
    if (devVisible && devTimer <= 0) {
      devTimer = 0.25;
      const info = renderer.info;
      tmp.copy(player.pos);
      dev.textContent = [
        `FPS ${fps.toFixed(0)}  (${(1000 / Math.max(fps, 1)).toFixed(1)} ms)`,
        `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k`,
        `geometries ${info.memory.geometries}  textures ${info.memory.textures}`,
        `terrain chunks ${terrain.stats.chunks}  coarse tiles ${terrain.stats.coarse}  queued ${terrain.pending}`,
        `outpost meshes drawn ${outpostMeshesDrawn}/${outpostModel?.stats.meshes ?? 0}`,
        `rocks ${rocks.instanceCount}  cave tris ${cave.stats?.triangles ?? '—'} (meshed in ${cave.stats ? (cave.stats.ms / 1000).toFixed(1) : '—'} s)`,
        `pos E ${tmp.x.toFixed(1)}  N ${tmp.z.toFixed(1)}  h ${tmp.y.toFixed(1)}  hdg ${player.heading.toFixed(0)}°  ${player.inCave ? 'IN CAVE' : ''}`,
        `adapt ${adapt.toFixed(2)}  exposure ${renderer.toneMappingExposure.toFixed(2)}  lamp ${lampOn ? 'on' : 'off'}`,
        `GPU ${ctx.gpuName}`,
        `audio ${audio.state}  volume ${Math.round(audio.volume * 100)}%`,
        '',
        'MODEL SLOTS',
        ...slotResults.map((r) => `  ${r.slot.padEnd(9)} ${r.status === 'loaded' ? 'USER MODEL' : r.status === 'error' ? 'ERROR' : 'PLACEHOLDER'}${r.detail ? ' — ' + r.detail : ''}`),
        '',
        'F5 outpost · F6 rover · F7 drill · F8 cave mouth · F9 hall · F10 ice',
      ].join('\n');
    }
  };

  const loop = new GameLoop(SIM_HZ, sim, render);
  loading.remove();
  setMode('menu');
  ctx.resize();
  void refreshMenuSave();

  /** Plays a cutscene from where it happens in the mission, then returns to the menu (?cutscene=<id>, dev/test API). */
  const previewCutscene = (id: CutsceneId) => {
    resetWorld();
    const I = cave.interact.ice, T = outpost.anchors.terminal;
    if (id === 'ice') player.teleport(I.x + 1.5, I.z + 3.2, yawTowards(-1.5, -3.2), I.y);
    if (id === 'transmission') player.teleport(T.x + 1.3, T.z - 1.5, yawTowards(-1.3, 1.5));
    player.pitch = id === 'arrival' ? 0 : -0.25;
    playCutscene(id, () => { clearOverlay(); setMode('menu'); });
  };
  const cineParam = params.get('cutscene') as CutsceneId | null;
  if (cineParam && CUTSCENE_IDS.includes(cineParam)) previewCutscene(cineParam);

  // Automated screenshot views (tools/shoot.mjs); never shown to players.
  if (shot && shot !== 'menu') {
    resetWorld();
    // Automated views are free-roam: story moments (cinematics) would otherwise interrupt scripted walks/tests.
    if (!params.has('story')) { mission.restore(OBJECTIVES.length, [], OBJECTIVES.map((o) => `done.${o.id}`)); campaign?.restore(); }
    doors?.setPowered(true); // automated views walk straight in (players scan their ID card first, script 1.2)
    const views: Record<string, { p: [number, number]; look: [number, number, number]; y?: number; lamp?: boolean }> = {
      spawn: { p: [SPAWN.x, SPAWN.z], look: [SITES.outpost.x, world.heightAt(SITES.outpost.x, SITES.outpost.z) + 4, SITES.outpost.z] },
      rover: { p: [SITES.rover.x - 12, SITES.rover.z + 9], look: [SITES.rover.x, 0, SITES.rover.z] },
      drill: { p: [SITES.drill.x - 18, SITES.drill.z + 16], look: [SITES.drill.x, 8, SITES.drill.z] },
      cliff: { p: [SITES.drill.x - 25, SITES.drill.z + 8], look: [NODES.mouthIn.x, 12, NODES.mouthIn.z] },
      vista: { p: [SITES.outpost.x + 260, SITES.outpost.z - 180], look: [SITES.outpost.x - 900, 30, SITES.outpost.z] },
      mouth: { p: [NODES.mouthOut.x + 6, NODES.mouthOut.z + 26], look: [NODES.mouthIn.x, 12, NODES.mouthIn.z] },
      throat: { p: [NODES.mouthIn.x, NODES.mouthIn.z + 2], look: [NODES.hall.x, 6, NODES.hall.z], y: NODES.mouthIn.floor + 1, lamp: true },
      hall: { p: [NODES.throat.x + 1, NODES.throat.z - 6], look: [NODES.hall.x - 4, 4, NODES.hall.z - 4], y: NODES.throat.floor + 1, lamp: true },
      outlook: { p: [NODES.throat.x, NODES.throat.z - 4], look: [NODES.mouthOut.x, 10, NODES.mouthOut.z], y: NODES.throat.floor + 1 },
      ice: { p: [NODES.deepBend.x + 1, NODES.deepBend.z - 9], look: [cave.interact.ice.x, cave.interact.ice.y, cave.interact.ice.z], y: NODES.deepBend.floor - 1, lamp: true },
    };
    // Outpost verification views (relative to the dome centre, +Z north) with a 1.85 m astronaut as a scale reference.
    const O = SITES.outpost, fy = outpostModel?.floorY ?? world.heightAt(O.x, O.z);
    const rel = (dx: number, dz: number): [number, number] => [O.x + dx, O.z + dz];
    const outpostViews: Record<string, { p: [number, number]; look: [number, number, number]; fig?: [number, number]; cam?: [number, number, number] }> = {
      outpost: { p: rel(26, -52), look: [O.x, fy + 6, O.z], fig: [10, -24] },
      door: { p: rel(5, -21), look: [O.x + 1.6, fy + 2, O.z - 8], fig: [3.2, -13] },
      inside: { p: rel(0.5, -6), look: [O.x, fy + 1.6, O.z + 8], fig: [2.5, 1] },
      top: { p: rel(0, -60), look: [O.x, fy, O.z - 31], cam: [O.x, fy + 175, O.z - 32] },
      side: { p: rel(-100, -10), look: [O.x - 20, fy + 6, O.z + 5], fig: [-36, -6] },
      // World +X is the Farm greenhouse, −X the Storage module (see the east/west labelling note in DEVELOPMENT_HANDOFF).
      farm: { p: rel(18.5, 0.3), look: [O.x + 30, fy + 1.4, O.z] },
      storage: { p: rel(-18.5, 0.3), look: [O.x - 30, fy + 1.4, O.z] },
      storage2: { p: rel(-26, 2.5), look: [O.x - 18, fy + 1.4, O.z - 3] },
      deposit: { p: rel(23.5, 86), look: [O.x + 20, fy + 0.3, O.z + 90] },
    };
    if (outpostViews[shot]) {
      const ov = outpostViews[shot];
      Object.assign(views, { [shot]: { p: ov.p, look: ov.look } });
      if (ov.cam) shotCam = { pos: new Vector3(...ov.cam), look: new Vector3(...ov.look).add(new Vector3(0, 0, 0.01)) };
      if (ov.fig) {
        const fig = await loadScaleFigure(`${slotBase}opt/astronaut.glb`, 1.85).catch((e) => { console.warn('scale figure', e); return null; });
        if (fig) {
          const [x, z] = rel(...ov.fig);
          fig.position.set(x, ground.at(x, z, fy + 2).h, z);
          fig.rotation.y = Math.atan2(ov.p[0] - x, ov.p[1] - z);
          scene.add(fig);
        }
      }
    }
    const v = views[shot] ?? views.spawn;
    player.teleport(v.p[0], v.p[1], yawTowards(v.look[0] - v.p[0], v.look[2] - v.p[1]), v.y ?? (outpostViews[shot] ? fy + 0.5 : undefined));
    player.pitch = Math.atan2(v.look[1] - (player.pos.y + 1.65), Math.hypot(v.look[0] - v.p[0], v.look[2] - v.p[1]));
    lampOn = !!v.lamp;
    adapt = ground.insideCave(player.pos.x, player.pos.y + 1.6, player.pos.z) ? caveDepthFactor(player.pos.x, player.pos.y + 1.6, player.pos.z) : 0;
    setMode('playing');
    input.uiFocus = true;
  }
  // End-to-end test hook (tools/e2e.mjs). Only present with ?e2e; drives the real input/interaction path.
  if (params.has('e2e')) {
    status.api = {
      standAt: (x: number, z: number, lookX: number, lookY: number, lookZ: number, yHint?: number) => {
        player.teleport(x, z, yawTowards(lookX - x, lookZ - z), yHint);
        const eyeY = player.pos.y + 1.65;
        player.pitch = Math.atan2(lookY - eyeY, Math.hypot(lookX - x, lookZ - z));
      },
      fastForwardDrill: () => { if (drill.state === 'running') drill.progress = Math.max(drill.progress, 0.97); },
      /** Holds driving keys for seconds (codes like 'KeyW', 'KeyD'). */
      hold: (codes: string[], seconds: number) => new Promise<void>((resolve) => {
        input.uiFocus = false;
        codes.forEach((code) => window.dispatchEvent(new KeyboardEvent('keydown', { code })));
        setTimeout(() => { codes.forEach((code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }))); resolve(); }, seconds * 1000);
      }),
      fastForwardMining: () => { if (mining.deposit) mining.progress = Math.max(mining.progress, 0.97); },
      /** Clicks a storage cell: side 'suit' | 'locker', item id (first matching stack). */
      /** Fast-forwards the facilities simulation (farm growth, shield spin-up, supply-drop timer). */
      giveItem: (id: string, n = 1) => inventory.add(id, n),
      baseTick: (seconds: number) => { for (let k = 0; k < seconds; k++) { playSeconds += 1; updateFacilities(1, true); } },
      storageClick: (side: string, item: string) => {
        const btn = storageUi.el.querySelectorAll('.col')[side === 'suit' ? 0 : 1]?.querySelector(`[data-item="${item}"]`) as HTMLElement | null;
        btn?.click();
        return !!btn;
      },
      setSuit: (o2: number, pwr: number, hp: number) => { suit.oxygen = o2; suit.power = pwr; suit.health = hp; },
      /** Diagnostics: free camera (null to release) and third-person body control for animation checks. */
      freeCam: (p: number[] | null, l?: number[]) => { shotCam = p && l ? { pos: new Vector3(p[0], p[1], p[2]), look: new Vector3(l[0], l[1], l[2]) } : null; },
      yawNow: () => player.yaw,
      toolView: (p: number[] | null, l: number[] = [0.09, -0.25, -0.6]) => { tool.debugView = p ? { pos: new Vector3(p[0], p[1], p[2]), look: new Vector3(l[0], l[1], l[2]) } : null; },
      look: (yaw: number | null, pitch: number) => { if (yaw !== null) player.yaw = yaw; player.pitch = pitch; },
      thirdPerson: (on: boolean) => { if (body) { body.thirdPerson = on; body.resetCamera(); } return !!body; },
      idleAction: (name: string) => body?.motion?.force(name) ?? false,
      fastForwardScan: () => { if (scan.state === 'scanning') scan.progress = Math.max(scan.progress, 0.97); },
      campaign: () => ({
        cur: mission.current?.id ?? null, index: mission.index, complete: mission.complete, flags: [...mission.flags].filter((f) => !f.startsWith('vo.')),
        pos: campaign ? Object.fromEntries(Object.entries(campaign.pos).map(([k, v]) => [k, v.toArray()])) : {}, storm, power: outpostPower,
        mev: mev ? { pos: mev.pos.toArray(), speed: mev.speed, powered: mev.powered, battery: mev.battery, door: mev.doorOpen } : null,
        driven: mode === 'driving' ? driven : null, progress: campaign?.progress ?? null, inv: inventory.count('ice_core'),
      }),
      use: (id: string) => interactions.triggerId(id),
      forceStorm: (l: number | null) => { stormOverride = l; if (l !== null) storm = l; },
      hud: (on: boolean) => { hud.show(on); },
      showPda: (tab: string) => { setMode('pda'); pda.show(player.pos.x, player.pos.z, player.heading, markers()); (pda as unknown as { tab: string }).tab = tab; },
      pickups: () => [...ore.pickups.keys()],
      fastForwardProc: () => campaign?.fastForward(),
      boardMev: () => boardMev(), exitMev: () => exitMev(), remote: () => startRemote(), remoteScan: () => remoteScan(),
      placeMev: (x: number, z: number, yaw: number) => { mev?.place(x, z, yaw, roverGround); syncMev(); },
      placeRover: (x: number, z: number) => { drivable?.place(x, z, 0, roverGround); syncRoverAnchors(); },
      anchors: () => ({
        terminal: outpost.anchors.terminal.toArray(), airlock: outpost.anchors.airlock.toArray(), rover: rover.servicePanel.toArray(),
        drill: drill.console.toArray(), cave: [SITES.cave.x, 0, SITES.cave.z], beacon: cave.interact.lastBeacon.toArray(),
        ice: cave.interact.ice.toArray(), cache: cave.interact.cache.toArray(), nodes: NODES,
        outpost: outpostModel ? [SITES.outpost.x, outpostModel.floorY, SITES.outpost.z] : null,
        locker: lockerPos.toArray(),
        roverBoard: drivable ? boardPos.toArray() : null,
        deposits: [...ore.deposits.values()].map((d) => ({ id: d.def.id, mineral: d.def.mineral, pos: d.pos.toArray() })),
      }),
      /** Collision map of the outpost around a point relative to the dome centre (diagnostics). */
      outpostGrid: (dx0: number, dx1: number, dz0: number, dz1: number, step = 0.25) => {
        if (!outpostModel) return null;
        const O = SITES.outpost;
        return outpostModel.grid.describe(O.x + dx0, O.x + dx1, O.z + dz0, O.z + dz1, step);
      },
      walk: (seconds: number) => new Promise<void>((resolve) => {
        const ev = (type: string) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW' }));
        input.uiFocus = false;
        ev('keydown');
        setTimeout(() => { ev('keyup'); resolve(); }, seconds * 1000);
      }),
      save: () => saveNow(),
      playCutscene: (id: CutsceneId) => previewCutscene(id),
      /** Freezes the running cutscene at `t` seconds (frame capture). */
      seekCutscene: (t: number, play = false, runCues = false) => { cutscenes.seek(t, runCues); if (play) cutscenes.paused = false; },
      cutscene: () => ({ id: cutscenes.id, t: cutscenes.t, duration: cutscenes.duration, holding: cutscenes.holding }),
      state: () => ({
        mode, cutscene: cutscenes.id, objective: mission.current?.id ?? null, index: mission.index, complete: mission.complete, records: [...mission.records],
        focused: interactions.focused?.id ?? null, drill: drill.state, scan: scan.state, oxygen: suit.oxygen, readerOpen: reader.open,
        overlay: overlay?.querySelector('h2')?.textContent ?? null, inCave: player.inCave, lamp: lampOn, adapt,
        pos: player.pos.toArray(), grounded: player.grounded,
        doors: Object.fromEntries((doors?.doors ?? []).map((d) => [d.spec.label, `${d.state} ${d.t.toFixed(2)}`])),
        inventory: inventory.toJSON(), selected: hotbar.selectedItem, locker: lockers.locker_main.toJSON(), storageOpen: storageUi.open,
        base: { ...facilities.toJSON(), power: facilities.power, farmHealth: facilities.farmHealth, dose: facilities.habitatDose, beds: facilities.s.beds.map((b) => ({ ...b })), bedPos: bedProps.map((b) => b.pos.toArray()), commsPos: commsPos.toArray(), shieldPos: shieldPos.toArray() },
        mining: mining.deposit ? mining.progress : null, pickups: [...ore.pickups.values()].map((p) => ({ id: p.id, pos: p.pos.toArray() })),
        suit: { oxygen: suit.oxygen, power: suit.power, health: suit.health }, optionalDone: mission.flags.has('done.opt.samples'),
        rover: drivable ? { pos: drivable.pos.toArray(), yaw: drivable.yaw, speed: drivable.speed, battery: drivable.battery, condition: drivable.condition, pitch: drivable.pitch, roll: drivable.roll, occupied: drivable.occupied, cam: roverCam, wheelsSpin: drivable.group.children.filter((c) => c.name.startsWith('RoverWheel_')).map((w) => w.rotation.x) } : null,
        camPos: camera.position.toArray(), camFov: camera.fov, cutT: cutscenes.playing ? cutscenes.t : null, cutLen: cutscenes.duration, cutId: cutscenes.id, visorOn: visorRig?.active ?? false, audio: audio.state, audioDb: audio.levelDb(), bed: audio.currentBed, voice: voice.current?.id ?? null, subtitle: voice.subtitleVisible ? voice.subtitleText : null, voicePlayed: [...voice.played],
        footprints: footprints.count,
        body: body ? { loaded: true, thirdPerson: body.thirdPerson, visible: body.root.visible, rotY: body.root.rotation.y } : { loaded: false },
        hotbarText: [...document.querySelectorAll('.hotbar .slot')].map((e) => e.textContent),
      }),
    };
  }
  loop.start();
  setTimeout(() => { status.ready = true; }, 300);
}

/** The user's astronaut, scaled to a given height and posed with its Idle clip — used as a size reference in screenshots. */
async function loadScaleFigure(url: string, height: number): Promise<Object3D> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const fig = gltf.scene;
  const clip = gltf.animations.find((a) => /idle/i.test(a.name)) ?? gltf.animations[0];
  if (clip) { const mixer = new AnimationMixer(fig); mixer.clipAction(clip).play(); mixer.update(0.6); }
  const h = new Box3().setFromObject(fig).getSize(new Vector3()).y;
  fig.scale.setScalar(height / h);
  fig.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
  const holder = new Group();
  holder.add(fig);
  return holder;
}

boot().catch((e) => {
  console.error(e);
  const ui = document.getElementById('ui');
  if (ui) ui.append(h('div.loading', null, h('div.inner', null, h('div.wordmark', { html: 'CINDERFALL <b>2</b>' }), h('div.error', null, `Failed to start: ${String(e)}`))));
  if (window.__cf) (window.__cf.errors as string[]).push(String(e));
});
