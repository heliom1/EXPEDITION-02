import { Vector3 } from 'three';

/** Mars surface gravity (m/s²). */
export const GRAVITY = 3.721;

/** Mission sites in world metres (+X east, +Z north, +Y up), placed on the CinderRain terrain. */
export const SITES = {
  outpost: { x: -1250, z: 1150 },
  reactor: { x: -1335, z: 1225 },
  rover: { x: 150, z: 900 },
  drill: { x: -20, z: -320 },
  /** Just outside the cave entrance in the mesa's north face. */
  cave: { x: -208, z: -314 },
} as const;
export type SiteId = keyof typeof SITES;

/** Yaw such that the camera looks along (dx, dz). Camera forward is (-sin yaw, -cos yaw). */
export const yawTowards = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** Player start: just outside the outpost's south airlock (the "EXIT" of the base plan), facing the main dome. */
export const SPAWN = { x: -1242, z: 1129, yaw: yawTowards(-1250 + 1242, 1150 - 1129) };

/**
 * EXPEDITION 02 landing site (lander HORIZON): ~190 m south of the outpost, beyond a low ridge whose crest is the
 * "first elevated viewpoint" that reveals the base (objective 1.1). New expeditions start beside the lander.
 */
export const LANDING = { x: -1212, z: 962 } as const;
export const RIDGE = { x: -1228, z: 1048, len: 70, width: 22, height: 5.5, angle: 0.18 } as const;

/** Direction *towards* the sun: low late-afternoon sun in the west, back/side-lighting the outpost from the spawn, as in the reference images. */
export const SUN_DIR = new Vector3(-0.924, 0.292, 0.248).normalize();

export const PALETTE = {
  skyZenith: 0xb98466,
  skyHorizon: 0xf2c6a2,
  fog: 0xd9a581,
  sun: 0xffe2c2,
  hemiSky: 0xe8b08a,
  hemiGround: 0x5a2e1c,
} as const;

/** Simulation runs at a fixed rate; rendering runs every animation frame. */
export const SIM_HZ = 60;
