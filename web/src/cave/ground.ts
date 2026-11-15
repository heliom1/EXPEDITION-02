import type { WorldData } from '../world/worldData';
import type { StructureGrid } from '../world/structureGrid';
import { caveFloorBelow, caveGrad, caveSdf, nearCave } from './caveDef';

export interface GroundHit { h: number; n: [number, number, number]; cave: boolean }

/**
 * Unified walkable surface: the CinderRain heightfield, except where the cave mouth cuts it, plus
 * the cave floor wherever the cave lies inside the hill. Also resolves cave walls and ceilings.
 * The cut test matches the terrain shader (cfCaveMouth < -0.35).
 */
export class Ground {
  /** Model-derived structures (e.g. the outpost): their floors are walkable, their solid cells block. */
  readonly structures: StructureGrid[] = [];

  constructor(readonly world: WorldData) {}

  /** Highest walkable surface at or below yRef + reach, including structure floors. */
  at(x: number, z: number, yRef: number, reach = 0.6): GroundHit {
    const hit = this.atNatural(x, z, yRef, reach);
    for (const s of this.structures) {
      const f = s.floorAt(x, z);
      if (f !== null && f <= yRef + reach && f > hit.h) return { h: f, n: [0, 1, 0], cave: false };
    }
    return hit;
  }

  terrainCut(x: number, z: number): boolean {
    if (!nearCave(x, z)) return false;
    return caveSdf(x, this.world.heightAt(x, z), z, false) < -0.35;
  }

  /** Terrain/cave surface only. */
  atNatural(x: number, z: number, yRef: number, reach = 0.6): GroundHit {
    const w = this.world;
    const hT = w.heightAt(x, z);
    if (!nearCave(x, z)) return { h: hT, n: w.normalAt(x, z, 0.6), cave: false };
    const cut = caveSdf(x, hT, z, false) < -0.35;
    const floor = caveFloorBelow(x, yRef + reach + 0.5, z, 12);
    let best: GroundHit | null = null;
    if (floor !== null && floor <= hT + 0.6 && floor <= yRef + reach) {
      const g = caveGrad(x, floor, z);
      best = { h: floor, n: [-g[0], -g[1], -g[2]], cave: true };
    }
    if (!cut && hT <= yRef + reach && (!best || hT > best.h)) best = { h: hT, n: w.normalAt(x, z, 0.6), cave: false };
    if (best) return best;
    // Nothing below (should not happen): fall back to whichever surface is closest.
    if (floor !== null && floor <= hT + 0.6) return { h: floor, n: [0, 1, 0], cave: true };
    return { h: hT, n: w.normalAt(x, z, 0.6), cave: false };
  }

  /** True when the point is in cave air under the hillside (i.e. "indoors"). */
  insideCave(x: number, y: number, z: number): boolean {
    if (!nearCave(x, z)) return false;
    return y < this.world.heightAt(x, z) - 0.5 && caveSdf(x, y, z, false) < 0;
  }

  /**
   * Pushes a vertical capsule (feet at p.y, given radius) out of cave walls. Returns true when the
   * head touches the ceiling.
   */
  resolveWalls(p: { x: number; y: number; z: number }, radius: number, height: number): boolean {
    if (!nearCave(p.x, p.z)) return false;
    let ceiling = false;
    for (const off of [0.55, 1.15, height]) {
      const y = p.y + off;
      if (y > this.world.heightAt(p.x, p.z) + 0.3) continue; // walls are cut away outside the hill
      const d = caveSdf(p.x, y, p.z);
      if (d <= -radius) continue;
      const g = caveGrad(p.x, y, p.z);
      const hl = Math.hypot(g[0], g[2]);
      if (off === height && g[1] > 0.6) { ceiling = true; continue; }
      if (hl < 0.35) continue; // floor/ceiling: handled elsewhere
      const push = d + radius;
      p.x -= (g[0] / hl) * push;
      p.z -= (g[2] / hl) * push;
    }
    return ceiling;
  }
}
