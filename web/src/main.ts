import './ui/styles.css';
import { Color, MeshStandardMaterial, PointLight, SpotLight, Vector3 } from 'three';
import { SIM_HZ, SITES, SPAWN, SUN_DIR, PALETTE, yawTowards } from './core/config';
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
import { tryLoadSlot, type SlotResult } from './world/modelSlots';
import { buildOutpost, buildReactor } from './base/outpost';
import { DrillRig } from './base/drill';
import { buildRover } from './vehicles/rover';
import { Cave } from './cave/cave';
import { Ground } from './cave/ground';
import { NODES, caveDepthFactor } from './cave/caveDef';
import { PlayerController } from './player/controller';
import { SuitSystem } from './player/suit';
import { InteractionSystem } from './player/interaction';
import { MissionState, OBJECTIVES } from './missions/missions';
import { RECORDS, baseStatusRecord, type StoryRecord } from './missions/records';
import { AudioEngine } from './audio/audio';
import { saveStore, SAVE_VERSION, type SaveData } from './save/saveSystem';
import { Hud } from './ui/hud';
import { SurveyMap, type MapMarker } from './ui/minimap';
import { LoadingScreen, MainMenu, Pda, RecordReader, card, introCard } from './ui/screens';
import { h } from './ui/dom';

type Mode = 'menu' | 'intro' | 'playing' | 'paused' | 'reading' | 'pda' | 'failed' | 'end';

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

  // ---------- world ----------
  const sky = createSky(SUN_DIR);
  scene.add(sky);
  scene.add(createBackdrop(world, layers));
  const terrain = new Terrain(world, layers);
  terrain.quality = settings.quality === 'high' ? QUALITY_HIGH : QUALITY_LOW;
  scene.add(terrain.group);
  const rocks = new RockField(world, layers);
  rocks.meshes.forEach((m) => scene.add(m));
  rocks.minSegs = terrain.quality.lods[0][1];
  terrain.onChunk = (...a) => rocks.onChunk(...a);
  const dust = new DustMotes();
  scene.add(dust.points);

  const colliders = new ColliderSet();
  const outpost = buildOutpost(world, SITES.outpost.x, SITES.outpost.z, colliders);
  scene.add(outpost.group);
  scene.add(buildReactor(world, SITES.reactor.x, SITES.reactor.z, colliders));
  const rover = buildRover(world, SITES.rover.x, SITES.rover.z, Math.PI * 0.92, colliders);
  scene.add(rover.group);
  const drill = new DrillRig(world, SITES.drill.x, SITES.drill.z, 0.6, colliders);
  scene.add(drill.group);

  loading.set(0.82, 'Surveying the cave');
  const cave = new Cave(world, layers, colliders);
  scene.add(cave.group);
  await cave.build();

  // Suit lamp: a spot light on the helmet plus a faint near-field fill (light bouncing off nearby rock).
  const lamp = new SpotLight(0xfff0dc, 0, 70, 0.78, 0.65, 1.25);
  lamp.position.set(0.18, -0.12, 0.05);
  lamp.target.position.set(0, -0.2, -6);
  const lampFill = new PointLight(0xffe2c8, 0, 7, 2);
  camera.add(lamp, lamp.target, lampFill);

  const setTarget = (id: string, p: Vector3) => { const o = OBJECTIVES[objIndex(id)]; o.target.x = p.x; o.target.z = p.z; };
  setTarget('checkin', outpost.anchors.terminal);
  setTarget('rover', rover.servicePanel);
  setTarget('drill', drill.console);
  setTarget('cave', cave.interact.lastBeacon);
  setTarget('ice', cave.interact.ice);
  setTarget('report', outpost.anchors.terminal);
  /** Height to place a waypoint for each objective (the cave targets are underground). */
  const targetHeight = (id: string, x: number, z: number) =>
    id === 'cave' ? cave.interact.lastBeacon.y : id === 'ice' ? cave.interact.ice.y : world.heightAt(x, z);

  const slotBase = `${base}assets/models/`;
  const slotResults: SlotResult[] = await Promise.all([
    tryLoadSlot(slotBase, 'outpost', outpost.group),
    tryLoadSlot(slotBase, 'rover', rover.group),
    tryLoadSlot(slotBase, 'drill', drill.group),
  ]);
  slotResults.push({ slot: 'astronaut', status: 'placeholder', detail: 'first-person camera; no body model yet' });

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
  const player = new PlayerController(world, colliders, rocks, ground);
  const audio = new AudioEngine();
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
  const suit = new SuitSystem();
  const mission = new MissionState();
  const interactions = new InteractionSystem();
  const hud = new Hud(ui, map);
  const reader = new RecordReader(ui);
  const pda = new Pda(ui, map, mission, (id) => showRecord(RECORDS[id]));
  let mode: Mode = 'menu';
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

  const clearOverlay = () => { overlay?.remove(); overlay = null; };
  const setMode = (m: Mode) => {
    mode = m;
    input.uiFocus = m !== 'playing';
    hud.show(m === 'playing' || m === 'reading');
    menu.show(m === 'menu');
    if (m !== 'pda') pda.close();
  };

  const showRecord = (r: StoryRecord) => {
    if (pda.open) pda.close();
    reader.show(r);
    audio.ui('interact');
    setMode('reading');
  };
  const closeRecord = () => {
    reader.close();
    setMode('playing');
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
    overlay = introCard(ui, () => { beginPlay(`Objective: ${OBJECTIVES[0].title}`); void saveNow(); });
  };

  const menu = new MainMenu(ui, settings, {
    onNewGame: () => {
      if (!hasSave) { startNewGame(); return; }
      clearOverlay();
      overlay = card(ui, 'NEW GAME', 'Start over?', ['Starting a new game replaces your saved progress. This cannot be undone.'], [
        { label: 'Start new game', primary: true, fn: () => { clearOverlay(); void saveStore.clear().then(() => { hasSave = false; startNewGame(); }); } },
        { label: 'Cancel', fn: clearOverlay },
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
      if (mode === 'paused') { clearOverlay(); setMode('playing'); }
    } else if (mode === 'playing') pause();
    else if (mode === 'reading') { reader.close(); setMode('playing'); pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    audio.suspend(document.hidden);
    if (document.hidden && (mode === 'playing' || mode === 'paused')) void saveNow();
  });
  window.addEventListener('pagehide', () => { if (mode === 'playing' || mode === 'paused') void saveNow(); });
  canvas.addEventListener('click', () => { if (mode === 'playing' && !input.locked) input.requestLock(); });

  // ---------- interactables ----------
  interactions.add({
    id: 'terminal', label: 'Mission terminal', verb: 'Access', position: outpost.anchors.terminal, range: 3.2,
    status: () => (mission.current?.id === 'report' ? 'transmit findings' : null),
    interact: () => {
      if (mission.current?.id === 'report') {
        mission.addRecord('transmission');
        showRecord(RECORDS.transmission);
        mission.completeObjective('report');
        return;
      }
      mission.addRecord('assignment');
      showRecord(RECORDS.assignment);
      mission.completeObjective('checkin');
    },
  });
  interactions.add({
    id: 'baseStatus', label: 'Outpost systems', verb: 'Access', position: outpost.anchors.baseStatus, range: 3.2,
    interact: () => showRecord(baseStatusRecord(baseSim)),
  });
  interactions.add({
    id: 'airlock', label: 'suit at airlock', verb: 'Recharge', position: outpost.anchors.airlock, range: 3.6,
    status: () => (suit.oxygen > 99 && suit.power > 99 ? 'full' : null),
    interact: () => { suit.recharge(); audio.ui('complete'); hud.notify('Suit oxygen and power restored.', 'good'); },
  });
  interactions.add({
    id: 'rover', label: 'Rover R-1 service panel', verb: 'Inspect', position: rover.servicePanel, range: 3.2,
    interact: () => { mission.addRecord('rover_log'); showRecord(RECORDS.rover_log); mission.completeObjective('rover'); },
  });
  interactions.add({
    id: 'drill', label: 'DRL-2 drill console', verb: 'Activate', position: drill.console, range: 3.2,
    status: () => (drill.state === 'running' ? `drilling ${Math.round(drill.progress * 100)}%` : drill.state === 'done' ? 'core recovered' : null),
    interact: () => {
      if (drill.state === 'done') { showRecord(RECORDS.core_drl2); return; }
      if (drill.state === 'running') return;
      if (mission.index < objIndex('drill')) { audio.ui('warn'); hud.notify('Drill locked: no survey order on file for DRL-2.', 'warn'); return; }
      drill.start();
      audio.ui('interact');
      hud.notify('Drill started. Core sample in progress…');
    },
  });
  interactions.add({
    id: 'beacon', label: 'survey beacon B-5', verb: 'Inspect', position: cave.interact.lastBeacon, range: 3,
    interact: () => {
      mission.addRecord('beacon_log');
      showRecord(RECORDS.beacon_log);
      if (mission.current?.id === 'cliff') mission.completeObjective('cliff');
      mission.completeObjective('cave');
    },
  });
  interactions.add({
    id: 'cache', label: 'Expedition 1 sample case', verb: 'Inspect', position: cave.interact.cache, range: 2.8,
    interact: () => { mission.addRecord('west_cache'); showRecord(RECORDS.west_cache); hud.notify('Optional discovery logged to PDA.', 'good'); saveDirty = true; },
  });
  interactions.add({
    id: 'ice', label: 'the deposit', verb: 'Inspect', position: cave.interact.ice, range: 4.5,
    status: () => (scan.state === 'scanning' ? `scanning ${Math.round(scan.progress * 100)}%` : scan.state === 'done' ? 'analysed' : 'spectrometer scan'),
    interact: () => {
      if (scan.state === 'done') { showRecord(RECORDS.ice_discovery); return; }
      if (scan.state === 'scanning') return;
      scan.state = 'scanning';
      scan.progress = 0;
      audio.ui('scan');
      hud.notify('Spectrometer scan started — hold position.');
    },
  });

  events.on('notice', (n) => { hud.notify(n.text, n.tone); audio.ui(n.tone === 'warn' ? 'warn' : 'notice'); });
  events.on('objective', () => { saveDirty = true; });
  events.on('record', () => { saveDirty = true; });
  events.on('endOfBuild', () => {
    audio.ui('complete');
    void saveNow();
    setTimeout(() => {
      if (mode === 'reading') reader.close();
      input.releaseLock();
      clearOverlay();
      setMode('end');
      overlay = card(ui, 'END OF CURRENT BUILD', 'Water on Mars', [
        'You followed the first expedition\'s unfinished survey from a truncated rover log to a core sample, and from the core to a cave they never officially reported — and found water ice beneath the mesa.',
        'Your findings have been transmitted. Why the first expedition left this out of the record is the next part of the story.',
      ], [
        { label: 'Keep exploring', primary: true, fn: () => beginPlay() },
        { label: 'Main menu', fn: () => { clearOverlay(); void refreshMenuSave(); setMode('menu'); } },
      ]);
    }, 400);
  });

  // ---------- loop ----------
  const markers = (): MapMarker[] => {
    const list: MapMarker[] = [{ x: SITES.outpost.x, z: SITES.outpost.z, label: 'Outpost', kind: 'site' }];
    if (mission.index >= objIndex('rover') + 1 || mission.complete) list.push({ x: SITES.rover.x, z: SITES.rover.z, label: 'Rover R-1', kind: 'site' });
    if (mission.index >= objIndex('drill')) list.push({ x: SITES.drill.x, z: SITES.drill.z, label: 'DRL-2', kind: 'site' });
    if (mission.index > objIndex('cliff')) list.push({ x: NODES.mouthOut.x, z: NODES.mouthOut.z, label: 'Cave', kind: 'site' });
    const cur = mission.current;
    if (cur) list.push({ x: cur.target.x, z: cur.target.z, label: cur.target.label, kind: 'objective' });
    return list;
  };

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
      mission.completeObjective('drill');
    }
    baseSim.demand = 33.5 + Math.sin(t * 0.05) * 1.8;
    baseSim.output = 40.2 + Math.sin(t * 0.013) * 0.3;
    for (const b of outpost.anchors.blinkers) (b.material as MeshStandardMaterial).emissiveIntensity = (t % 1.6) < 0.25 ? 8 : 0.2;

    if (mode !== 'playing') return;
    playSeconds += dt;
    player.canSprint = suit.power > 0;
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
    // Spectrometer scan: must stay near the deposit.
    if (scan.state === 'scanning') {
      if (player.pos.distanceTo(cave.interact.ice) > 7) { scan.state = 'idle'; hud.notify('Scan interrupted — moved out of range.', 'warn'); }
      else {
        scan.progress = Math.min(1, scan.progress + dt / scan.duration);
        if (Math.floor(scan.progress * 12) !== Math.floor((scan.progress - dt / scan.duration) * 12)) audio.ui('scan');
        if (scan.progress >= 1) {
          scan.state = 'done';
          mission.addRecord('ice_discovery');
          if (mission.current?.id === 'cliff') mission.completeObjective('cliff');
          if (mission.current?.id === 'cave') { mission.addRecord('beacon_log'); mission.completeObjective('cave'); }
          audio.ui('complete');
          showRecord(RECORDS.ice_discovery);
          mission.completeObjective('ice');
        }
      }
    }
    const cur = mission.current;
    if (cur?.id === 'cliff' && (Math.hypot(player.pos.x - SITES.cave.x, player.pos.z - SITES.cave.z) < 30 || player.inCave)) {
      mission.addRecord('cliff_survey');
      showRecord(RECORDS.cliff_survey);
      mission.completeObjective('cliff');
    }
    if (!lampHinted && adapt > 0.45 && !lampOn) { lampHinted = true; hud.notify('It is dark in here — press F for your suit lamp.'); }
    if (saveDirty || playSeconds - lastSaveAt > 30) void saveNow();
  };

  const render = (dt: number, alpha: number) => {
    if (input.consume('F3')) { devVisible = !devVisible; dev.classList.toggle('hidden', !devVisible); }
    if (mode === 'playing') {
      player.look(input);
      if (input.consume('KeyE')) interactions.trigger();
      if (input.consume('KeyF')) { lampOn = !lampOn && suit.power > 0; audio.ui('lamp'); }
      if (input.consume('Tab')) { input.releaseLock(); setMode('pda'); pda.show(player.pos.x, player.pos.z, player.heading, markers()); }
      for (let k = 1; k <= 5; k++) if (input.consume(`Digit${k}`)) hud.selectSlot(k - 1);
      if (devVisible) {
        const tp: Array<[string, number, number, number | undefined]> = [
          ['F5', SPAWN.x, SPAWN.z, undefined], ['F6', SITES.rover.x - 8, SITES.rover.z - 6, undefined],
          ['F7', SITES.drill.x - 10, SITES.drill.z + 10, undefined], ['F8', SITES.cave.x, SITES.cave.z + 8, undefined],
          ['F9', NODES.hall.x, NODES.hall.z, NODES.hall.floor + 2], ['F10', cave.interact.ice.x + 3, cave.interact.ice.z + 8, cave.interact.ice.y + 1],
        ];
        for (const [key, x, z, y] of tp) if (input.consume(key)) player.teleport(x, z, player.yaw, y);
      }
    } else if (mode === 'reading') {
      if (input.consume('KeyE') || input.consume('Escape')) closeRecord();
    } else if (mode === 'pda') {
      if (input.consume('Tab') || input.consume('Escape')) { pda.close(); input.requestLock(); setMode('playing'); if (!input.locked && !automated) setTimeout(() => { if (!input.locked && mode === 'playing') pause(); }, 250); }
    }
    input.clearPressed();

    if (mode === 'menu') {
      const a = t * 0.025 + 2.2;
      menuCam.set(SITES.outpost.x + Math.cos(a) * 75, 0, SITES.outpost.z + Math.sin(a) * 75);
      menuCam.y = world.heightAt(menuCam.x, menuCam.z) + 9;
      camera.position.copy(menuCam);
      camera.lookAt(SITES.outpost.x, world.heightAt(SITES.outpost.x, SITES.outpost.z) + 6, SITES.outpost.z);
    } else {
      player.applyCamera(camera, mode === 'playing' ? alpha : 1);
    }

    // Eye adaptation, fog and dust inside the cave.
    const inside = mode !== 'menu' && ground.insideCave(camera.position.x, camera.position.y, camera.position.z);
    const caveNow = inside ? caveDepthFactor(camera.position.x, camera.position.y, camera.position.z) : 0;
    adapt += (caveNow - adapt) * Math.min(1, dt * 1.2);
    renderer.toneMappingExposure = 1.05 + adapt * 0.85;
    ctx.fog.color.lerpColors(fogOut, fogCave, adapt);
    ctx.fog.density = FOG_DENSITY + adapt * 0.0075;
    dust.setAmount(1 - adapt * 0.7);
    lamp.intensity = lampOn && mode !== 'menu' ? 70 : 0.0001;
    lampFill.intensity = lampOn && mode !== 'menu' ? 2.2 : 0;

    if (mode === 'playing' || mode === 'reading') interactions.update(camera);
    else interactions.focused = null;

    terrain.update(camera.position.x, camera.position.z, 4);
    rocks.commit();
    ctx.followShadow(camera.position);
    sky.position.copy(camera.position);
    dust.update(dt, camera.position);
    audio.update(dt, {
      cam: camera, cave: adapt, sprinting: player.sprinting, grounded: player.grounded, stride: player.stride, oxygen: suit.oxygen,
      drillRunning: drill.state === 'running', drillPos: drill.group.position, active: mode === 'playing',
    });

    const cur = mission.current;
    const f = interactions.focused;
    const progress = scan.state === 'scanning' ? { label: 'Spectrometer scan…', value: scan.progress }
      : drill.state === 'running' && camera.position.distanceTo(drill.group.position) < 60 ? { label: 'Drilling in Progress…', value: drill.progress } : null;
    hud.update({
      x: player.pos.x, y: player.pos.y, z: player.pos.z, heading: player.heading,
      oxygen: suit.oxygen, power: suit.power, health: suit.health,
      objective: cur, targetY: cur ? targetHeight(cur.id, cur.target.x, cur.target.z) : 0,
      prompt: f ? { verb: f.verb, label: f.label, status: f.status?.() ?? null } : null,
      progress,
      markers: markers(),
    }, camera, dt);

    renderer.render(scene, camera);

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
        `rocks ${rocks.instanceCount}  cave tris ${cave.stats?.triangles ?? '—'} (meshed in ${cave.stats ? (cave.stats.ms / 1000).toFixed(1) : '—'} s)`,
        `pos E ${tmp.x.toFixed(1)}  N ${tmp.z.toFixed(1)}  h ${tmp.y.toFixed(1)}  hdg ${player.heading.toFixed(0)}°  ${player.inCave ? 'IN CAVE' : ''}`,
        `adapt ${adapt.toFixed(2)}  exposure ${renderer.toneMappingExposure.toFixed(2)}  lamp ${lampOn ? 'on' : 'off'}`,
        `GPU ${ctx.gpuName}`,
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

  // Automated screenshot views (tools/shoot.mjs); never shown to players.
  if (shot && shot !== 'menu') {
    resetWorld();
    const views: Record<string, { p: [number, number]; look: [number, number, number]; y?: number; lamp?: boolean }> = {
      spawn: { p: [SPAWN.x, SPAWN.z], look: [SITES.outpost.x, 0, SITES.outpost.z] },
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
    const v = views[shot] ?? views.spawn;
    player.teleport(v.p[0], v.p[1], yawTowards(v.look[0] - v.p[0], v.look[2] - v.p[1]), v.y);
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
      fastForwardScan: () => { if (scan.state === 'scanning') scan.progress = Math.max(scan.progress, 0.97); },
      anchors: () => ({
        terminal: outpost.anchors.terminal.toArray(), airlock: outpost.anchors.airlock.toArray(), rover: rover.servicePanel.toArray(),
        drill: drill.console.toArray(), cave: [SITES.cave.x, 0, SITES.cave.z], beacon: cave.interact.lastBeacon.toArray(),
        ice: cave.interact.ice.toArray(), cache: cave.interact.cache.toArray(), nodes: NODES,
      }),
      walk: (seconds: number) => new Promise<void>((resolve) => {
        const ev = (type: string) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW' }));
        input.uiFocus = false;
        ev('keydown');
        setTimeout(() => { ev('keyup'); resolve(); }, seconds * 1000);
      }),
      save: () => saveNow(),
      state: () => ({
        mode, objective: mission.current?.id ?? null, index: mission.index, complete: mission.complete, records: [...mission.records],
        focused: interactions.focused?.id ?? null, drill: drill.state, scan: scan.state, oxygen: suit.oxygen, readerOpen: reader.open,
        overlay: overlay?.querySelector('h2')?.textContent ?? null, inCave: player.inCave, lamp: lampOn, adapt,
        pos: player.pos.toArray(), grounded: player.grounded,
      }),
    };
  }
  loop.start();
  setTimeout(() => { status.ready = true; }, 300);
}

boot().catch((e) => {
  console.error(e);
  const ui = document.getElementById('ui');
  if (ui) ui.append(h('div.loading', null, h('div.inner', null, h('div.wordmark', { html: 'CINDERFALL <b>2</b>' }), h('div.error', null, `Failed to start: ${String(e)}`))));
  if (window.__cf) (window.__cf.errors as string[]).push(String(e));
});
