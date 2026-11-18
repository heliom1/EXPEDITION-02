import { PerspectiveCamera, Vector3 } from 'three';

export type InteractionVerb = 'Inspect' | 'Access' | 'Activate' | 'Read' | 'Recharge' | 'Repair' | 'Collect' | 'Drill' | 'Board';

/** Data-driven interactable: anything with a world position, a verb and a handler. */
export interface Interactable {
  id: string;
  label: string;
  verb: InteractionVerb;
  position: Vector3;
  range: number;
  enabled?: () => boolean;
  /**
   * Higher priority wins when several interactables are in view at once. Mission steps use 1 so they are never
   * hidden by a generic service point at the same spot (e.g. the airlock ID reader vs. the suit recharge port).
   */
  priority?: number;
  /** Optional dynamic label (e.g. "Drilling… 45%"). */
  status?: () => string | null;
  interact: () => void;
}

/** Picks the interactable the player is looking at within range. */
export class InteractionSystem {
  private items: Interactable[] = [];
  focused: Interactable | null = null;
  private dir = new Vector3();
  private to = new Vector3();

  add(i: Interactable): void {
    this.items.push(i);
  }

  /** Removes an interactable (e.g. a collected pickup). */
  remove(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
    if (this.focused?.id === id) this.focused = null;
  }

  update(cam: PerspectiveCamera): void {
    cam.getWorldDirection(this.dir);
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      this.to.subVectors(it.position, cam.position);
      const d = this.to.length();
      if (d > it.range) continue;
      const facing = this.to.normalize().dot(this.dir);
      // Generous cone up close, tighter further away.
      if (facing < (d < 1.6 ? 0.55 : 0.86)) continue;
      const score = facing * 2 - d / it.range + (it.priority ?? 0) * 10;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    this.focused = best;
  }

  /** Triggers an enabled interactable by id (automated tests). */
  triggerId(id: string): boolean {
    const it = this.items.find((i) => i.id === id && (!i.enabled || i.enabled()));
    if (!it) return false;
    it.interact();
    return true;
  }

  trigger(): boolean {
    if (!this.focused) return false;
    this.focused.interact();
    return true;
  }
}
