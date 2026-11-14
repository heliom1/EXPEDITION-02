import './ui/styles.css';
import { CylinderGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { SIM_HZ, SITES, SPAWN, SUN_DIR, yawTowards } from './core/config';
import { GameLoop } from './core/loop';
import { Input } from './core/input';
import { events } from './core/events';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { createRenderContext, type RenderContext } from './rendering/renderer';
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
import { PlayerController } from './player/controller';
import { SuitSystem } from './player/suit';
import { InteractionSystem } from './player/interaction';
import { MissionState, OBJECTIVES } from './missions/missions';
import { RECORDS, baseStatusRecord, type StoryRecord } from './missions/records';
import { Hud } from './ui/hud';
import { SurveyMap, type MapMarker } from './ui/minimap';
import { LoadingScreen, MainMenu, Pda, RecordReader, card, introCard } from './ui/screens';
import { h } from './ui/dom';

type Mode = 'menu' | 'intro' | 'playing' | 'paused' | 'reading' | 'pda' | 'failed' | 'end';

declare global {
  interface Window { __cf?: Record<string, unknown> }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
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
  const settings = loadSettings();
  ctx.setQuality(settings.quality);
  window.addEventListener('resize', () => ctx.resize());

  const base = import.meta.env.BASE_URL;
  const world = await WorldData.load(`${base}world/`, (f) => loading.set(f * 0.7, 'Loading CinderRain terrain'));
  const layers = await loadLayerTextures(`${base}textures/`, renderer, (f) => loading.set(0.7 + f * 0.15, 'Loading surface materials'));
  const map = await SurveyMap.load(`${base}world/survey_map.png`, world.meta.extent);
  loading.set(0.88, 'Building the surface');
  await new Promise((r) => setTimeout(r, 0));

  // ---------- world ----------
  const sky = createSky(SUN_DIR);
  scene.add(sky);
  scene.add(createBackdrop(world, layers));
  const terrain = new Terrain(world, layers);
  terrain.quality = settings.quality === 'high' ? QUALITY_HIGH : QUALITY_LOW;
  const rocksMinSegs = terrain.quality.lods[0][1];
  scene.add(terrain.group);
  const rocks = new RockField(world, layers);
  rocks.meshes.forEach((m) => scene.add(m));
  rocks.minSegs = rocksMinSegs;
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
  // A survey marker at the cliff base so the final objective has a visible target.
  const flag = new Mesh(new CylinderGeometry(0.04, 0.04, 2.2, 6), new MeshStandardMaterial({ color: 0xd2652a }));
  flag.position.set(SITES.cave.x + 6, world.heightAt(SITES.cave.x + 6, SITES.cave.z + 4) + 1.1, SITES.cave.z + 4);
  flag.castShadow = true;
  scene.add(flag);

  OBJECTIVES[0].target.x = outpost.anchors.terminal.x;
  OBJECTIVES[0].target.z = outpost.anchors.terminal.z;
  OBJECTIVES[1].target.x = rover.servicePanel.x;
  OBJECTIVES[1].target.z = rover.servicePanel.z;
  OBJECTIVES[2].target.x = drill.console.x;
  OBJECTIVES[2].target.z = drill.console.z;

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
  loading.set(0.96, 'Compiling shaders');
  await new Promise((r) => setTimeout(r, 0));
  renderer.compile(scene, camera);

  // ---------- gameplay ----------
  const input = new Input(canvas);
  const player = new PlayerController(world, colliders, rocks);
  const applySettings = (s: Settings) => {
    player.sensitivity = s.sensitivity;
    player.invertY = s.invertY;
    const q = s.quality === 'high' ? QUALITY_HIGH : QUALITY_LOW;
    if (terrain.quality !== q) { terrain.quality = q; ctx.setQuality(s.quality); }
    rocks.minSegs = q.lods[0][1];
    saveSettings(s);
  };
  applySettings(settings);
  const suit = new SuitSystem();
  let mission = new MissionState();
  const interactions = new InteractionSystem();
  const hud = new Hud(ui, map);
  const reader = new RecordReader(ui);
  let pda = new Pda(ui, map, mission, (id) => showRecord(RECORDS[id]));
  let mode: Mode = 'menu';
  let overlay: HTMLElement | null = null;
  let devVisible = params.has('dev');
  const dev = h('div.dev.panel' + (devVisible ? '' : '.hidden'));
  ui.append(dev);

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
    setMode('reading');
  };
  const closeRecord = () => {
    reader.close();
    setMode('playing');
    if (!input.locked && !shot) pause(); // automated runs have no pointer lock
  };

  const pause = () => {
    if (mode === 'paused') return;
    clearOverlay();
    setMode('paused');
    overlay = card(ui, 'PAUSED', 'Mission paused', ['Your suit systems are holding. Click Resume to continue.'], [
      { label: 'Resume', primary: true, fn: () => input.requestLock() },
      { label: 'Main menu', fn: () => { clearOverlay(); setMode('menu'); } },
    ], 'WASD move · Shift sprint · Space jump · E interact · Tab PDA');
  };

  const newGame = () => {
    mission = new MissionState();
    pda.el.remove();
    pda = new Pda(ui, map, mission, (id) => showRecord(RECORDS[id]));
    suit.recharge();
    suit.health = 100;
    drill.state = 'idle';
    drill.progress = 0;
    player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw);
    events.emit('objective', { id: OBJECTIVES[0].id });
  };

  const menu = new MainMenu(ui, settings, {
    onNewGame: () => {
      newGame();
      setMode('intro');
      overlay = introCard(ui, () => { clearOverlay(); input.requestLock(); setMode('playing'); hud.notify(`Objective: ${OBJECTIVES[0].title}`, 'good'); });
    },
    onContinue: () => undefined,
    onSettings: applySettings,
  });

  document.addEventListener('pointerlockchange', () => {
    if (input.locked) {
      if (mode === 'paused') { clearOverlay(); setMode('playing'); }
    } else if (mode === 'playing') pause();
    else if (mode === 'reading') { reader.close(); setMode('playing'); pause(); }
  });
  canvas.addEventListener('click', () => { if (mode === 'playing' && !input.locked) input.requestLock(); });

  // ---------- interactables ----------
  interactions.add({
    id: 'terminal', label: 'Mission terminal', verb: 'Access', position: outpost.anchors.terminal, range: 3.2,
    interact: () => { mission.addRecord('assignment'); showRecord(RECORDS.assignment); mission.completeObjective('checkin'); },
  });
  interactions.add({
    id: 'baseStatus', label: 'Outpost systems', verb: 'Access', position: outpost.anchors.baseStatus, range: 3.2,
    interact: () => showRecord(baseStatusRecord(baseSim)),
  });
  interactions.add({
    id: 'airlock', label: 'suit at airlock', verb: 'Recharge', position: outpost.anchors.airlock, range: 3.6,
    status: () => (suit.oxygen > 99 && suit.power > 99 ? 'full' : null),
    interact: () => { suit.recharge(); hud.notify('Suit oxygen and power restored.', 'good'); },
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
      if (mission.index < 2) { hud.notify('Drill locked: no survey order on file for DRL-2.', 'warn'); return; }
      drill.start();
      hud.notify('Drill started. Core sample in progress…');
    },
  });

  events.on('notice', (n) => hud.notify(n.text, n.tone));
  events.on('endOfBuild', () => {
    setTimeout(() => {
      if (mode === 'reading') reader.close();
      input.releaseLock();
      clearOverlay();
      setMode('end');
      overlay = card(ui, 'END OF CURRENT BUILD', 'The investigation continues', [
        'You have followed the first expedition\'s unfinished survey to the cliff base where the radar shows a void.',
        'The cave system, the underground discovery and the rest of the story arrive in later builds.',
      ], [
        { label: 'Keep exploring', primary: true, fn: () => { clearOverlay(); input.requestLock(); setMode('playing'); } },
        { label: 'Main menu', fn: () => { clearOverlay(); setMode('menu'); } },
      ]);
    }, 400);
  });

  // ---------- loop ----------
  const markers = (): MapMarker[] => {
    const list: MapMarker[] = [
      { x: SITES.outpost.x, z: SITES.outpost.z, label: 'Outpost', kind: 'site' },
    ];
    if (mission.index >= 1) list.push({ x: SITES.rover.x, z: SITES.rover.z, label: 'Rover R-1', kind: 'site' });
    if (mission.index >= 2) list.push({ x: SITES.drill.x, z: SITES.drill.z, label: 'DRL-2', kind: 'site' });
    const cur = mission.current;
    if (cur) list.push({ x: cur.target.x, z: cur.target.z, label: cur.target.label, kind: 'objective' });
    return list;
  };

  let frames = 0, fpsAcc = 0, fps = 0, devTimer = 0, t = 0;
  const menuCam = new Vector3();

  const sim = (dt: number) => {
    t += dt;
    const drillDone = drill.update(dt);
    if (drillDone) {
      mission.addRecord('core_drl2');
      hud.notify('Core sample recovered. Telemetry logged to PDA.', 'good');
      mission.completeObjective('drill');
    }
    baseSim.demand = 33.5 + Math.sin(t * 0.05) * 1.8;
    baseSim.output = 40.2 + Math.sin(t * 0.013) * 0.3;
    for (const b of outpost.anchors.blinkers) (b.material as MeshStandardMaterial).emissiveIntensity = (t % 1.6) < 0.25 ? 8 : 0.2;

    if (mode !== 'playing') return;
    player.canSprint = suit.power > 0;
    player.step(dt, input);
    if (suit.update(dt, player.sprinting) === 'failed') {
      input.releaseLock();
      clearOverlay();
      setMode('failed');
      overlay = card(ui, 'SUIT FAILURE', 'Life support exhausted', ['Your suit ran out of oxygen. In this build you are recovered to the outpost with systems recharged.', 'Watch the oxygen bar and recharge at the outpost airlock before long excursions.'], [
        { label: 'Recover at outpost', primary: true, fn: () => { clearOverlay(); suit.recharge(); suit.health = 100; player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw); input.requestLock(); setMode('playing'); } },
      ]);
      return;
    }
    const cur = mission.current;
    if (cur?.id === 'cliff' && Math.hypot(player.pos.x - SITES.cave.x, player.pos.z - SITES.cave.z) < 40) {
      mission.addRecord('cliff_survey');
      showRecord(RECORDS.cliff_survey);
      mission.completeObjective('cliff');
    }
  };

  const render = (dt: number, alpha: number) => {
    // Input that must work in any mode.
    if (input.consume('F3')) { devVisible = !devVisible; dev.classList.toggle('hidden', !devVisible); }
    if (mode === 'playing') {
      player.look(input);
      if (input.consume('KeyE')) interactions.trigger();
      if (input.consume('Tab')) { input.releaseLock(); setMode('pda'); pda.show(player.pos.x, player.pos.z, player.heading, markers()); }
      for (let k = 1; k <= 5; k++) if (input.consume(`Digit${k}`)) hud.selectSlot(k - 1);
      if (devVisible) {
        const tp: Array<[string, number, number]> = [['F5', SPAWN.x, SPAWN.z], ['F6', SITES.rover.x - 8, SITES.rover.z - 6], ['F7', SITES.drill.x - 10, SITES.drill.z + 10], ['F8', SITES.cave.x + 60, SITES.cave.z + 30]];
        for (const [key, x, z] of tp) if (input.consume(key)) player.teleport(x, z, player.yaw);
      }
    } else if (mode === 'reading') {
      if (input.consume('KeyE') || input.consume('Escape')) closeRecord();
    } else if (mode === 'pda') {
      if (input.consume('Tab') || input.consume('Escape')) { pda.close(); input.requestLock(); setMode('playing'); if (!input.locked && !shot) setTimeout(() => { if (!input.locked && mode === 'playing') pause(); }, 250); }
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

    if (mode === 'playing' || mode === 'reading') interactions.update(camera);
    else interactions.focused = null;

    terrain.update(camera.position.x, camera.position.z, 4);
    rocks.commit();
    ctx.followShadow(camera.position);
    sky.position.copy(camera.position);
    dust.update(dt, camera.position);

    const cur = mission.current;
    const f = interactions.focused;
    hud.update({
      x: player.pos.x, y: player.pos.y, z: player.pos.z, heading: player.heading,
      oxygen: suit.oxygen, power: suit.power, health: suit.health,
      objective: cur, targetY: cur ? world.heightAt(cur.target.x, cur.target.z) : 0,
      prompt: f ? { verb: f.verb, label: f.label, status: f.status?.() ?? null } : null,
      progress: drill.state === 'running' && camera.position.distanceTo(drill.group.position) < 60 ? { label: 'Drilling in Progress…', value: drill.progress } : null,
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
      dev.textContent = [
        `FPS ${fps.toFixed(0)}  (${(1000 / Math.max(fps, 1)).toFixed(1)} ms)`,
        `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k`,
        `geometries ${info.memory.geometries}  textures ${info.memory.textures}`,
        `terrain chunks ${terrain.stats.chunks}  coarse tiles ${terrain.stats.coarse}  queued ${terrain.pending}`,
        `rocks ${rocks.instanceCount}`,
        `pos E ${player.pos.x.toFixed(1)}  N ${player.pos.z.toFixed(1)}  h ${player.pos.y.toFixed(1)}  hdg ${player.heading.toFixed(0)}°`,
        `GPU ${ctx.gpuName}`,
        '',
        'MODEL SLOTS',
        ...slotResults.map((r) => `  ${r.slot.padEnd(9)} ${r.status === 'loaded' ? 'USER MODEL' : r.status === 'error' ? 'ERROR' : 'PLACEHOLDER'}${r.detail ? ' — ' + r.detail : ''}`),
        '',
        'F5 outpost · F6 rover · F7 drill · F8 cliff base',
      ].join('\n');
    }
  };

  const loop = new GameLoop(SIM_HZ, sim, render);
  loading.remove();
  setMode('menu');
  ctx.resize();

  // Automated screenshot views (used by tools/shoot.mjs); never shown to players.
  if (shot && shot !== 'menu') {
    newGame();
    const views: Record<string, [number, number, number, number]> = {
      spawn: [SPAWN.x, SPAWN.z, SPAWN.yaw, 0.02],
      rover: [SITES.rover.x - 12, SITES.rover.z + 9, yawTowards(12, -9), -0.05],
      drill: [SITES.drill.x - 18, SITES.drill.z + 16, yawTowards(18, -16), 0.12],
      cliff: [SITES.drill.x - 25, SITES.drill.z + 8, yawTowards(SITES.cave.x - SITES.drill.x + 25, SITES.cave.z - SITES.drill.z - 8), 0.1],
      vista: [SITES.outpost.x + 260, SITES.outpost.z - 180, yawTowards(-1, 0.25), 0.03],
    };
    const v = views[shot] ?? views.spawn;
    player.teleport(v[0], v[1], v[2]);
    player.pitch = v[3];
    setMode('playing');
    input.uiFocus = true;
  }
  // End-to-end test hook (tools/e2e.mjs). Only present with ?e2e; drives the real input/interaction path.
  if (params.has('e2e')) {
    status.api = {
      standAt: (x: number, z: number, lookX: number, lookY: number, lookZ: number) => {
        player.teleport(x, z, yawTowards(lookX - x, lookZ - z));
        const eyeY = world.heightAt(x, z) + 1.65;
        player.pitch = Math.atan2(lookY - eyeY, Math.hypot(lookX - x, lookZ - z));
      },
      fastForwardDrill: () => { if (drill.state === 'running') drill.progress = Math.max(drill.progress, 0.97); },
      anchors: () => ({ terminal: outpost.anchors.terminal.toArray(), airlock: outpost.anchors.airlock.toArray(), rover: rover.servicePanel.toArray(), drill: drill.console.toArray(), cave: [SITES.cave.x, 0, SITES.cave.z] }),
      state: () => ({ mode, objective: mission.current?.id ?? null, index: mission.index, complete: mission.complete, records: [...mission.records], focused: interactions.focused?.id ?? null, drill: drill.state, oxygen: suit.oxygen, readerOpen: reader.open, overlay: overlay?.querySelector('h2')?.textContent ?? null }),
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
