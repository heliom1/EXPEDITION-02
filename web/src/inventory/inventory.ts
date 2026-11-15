import { itemDef } from './items';

/** One inventory slot: an item stack, or empty. */
export interface Stack { id: string; count: number }
export type SlotData = Stack | null;

/**
 * Slot-based container with stacking (System E/F). Used for the suit inventory and for storage containers.
 * Pure state: no DOM/three. `onChange` fires after every mutation (UI, autosave, objectives listen to it).
 */
export class Inventory {
  readonly slots: SlotData[];
  onChange: (() => void) | null = null;

  constructor(readonly capacity: number) {
    this.slots = new Array<SlotData>(capacity).fill(null);
  }

  count(id: string): number {
    return this.slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  /** Units of `id` that would fit (existing stacks first, then empty slots). */
  spaceFor(id: string): number {
    const max = itemDef(id).stack;
    return this.slots.reduce((n, s) => n + (s === null ? max : s.id === id ? max - s.count : 0), 0);
  }

  /** Adds up to `n` units; returns how many did NOT fit. */
  add(id: string, n = 1): number {
    const max = itemDef(id).stack;
    let left = n;
    for (const s of this.slots) if (left > 0 && s && s.id === id && s.count < max) { const k = Math.min(left, max - s.count); s.count += k; left -= k; }
    for (let i = 0; i < this.slots.length && left > 0; i++) if (this.slots[i] === null) { const k = Math.min(left, max); this.slots[i] = { id, count: k }; left -= k; }
    if (left !== n) this.onChange?.();
    return left;
  }

  /** Removes up to `n` units (from the last stacks first); returns how many were removed. */
  remove(id: string, n = 1): number {
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(left, s.count);
      s.count -= k; left -= k;
      if (s.count === 0) this.slots[i] = null;
    }
    if (left !== n) this.onChange?.();
    return n - left;
  }

  /** Moves a whole slot's stack into another inventory (as much as fits). Returns units moved. */
  moveSlot(index: number, to: Inventory): number {
    const s = this.slots[index];
    if (!s) return 0;
    const notMoved = to.add(s.id, s.count);
    const moved = s.count - notMoved;
    if (moved > 0) { s.count -= moved; if (s.count === 0) this.slots[index] = null; this.onChange?.(); }
    return moved;
  }

  clear(): void { this.slots.fill(null); this.onChange?.(); }

  toJSON(): SlotData[] { return this.slots.map((s) => (s ? { ...s } : null)); }

  /** Restores from saved data; unknown items or bad counts are dropped (never throws). */
  load(data: unknown): void {
    this.slots.fill(null);
    if (Array.isArray(data)) data.slice(0, this.capacity).forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const { id, count } = s as Stack;
      try { const max = itemDef(id).stack; if (Number.isInteger(count) && count > 0) this.slots[i] = { id, count: Math.min(count, max) }; } catch { /* unknown item */ }
    });
    this.onChange?.();
  }
}

/**
 * Quick-slot hotbar: five references to item types in the suit inventory (not separate stacks), plus the
 * selected slot. A slot shows how many of that item the suit carries; 0 = greyed out.
 */
export class Hotbar {
  readonly slots: Array<string | null>;
  selected = 0;

  constructor(size: number, initial: Array<string | null> = []) {
    this.slots = new Array<string | null>(size).fill(null);
    initial.slice(0, size).forEach((id, i) => (this.slots[i] = id));
  }

  get selectedItem(): string | null { return this.slots[this.selected] ?? null; }

  select(i: number): void { if (i >= 0 && i < this.slots.length) this.selected = i; }

  /** Puts `id` on the first empty quick slot if it is not already there. */
  assign(id: string): void {
    if (this.slots.includes(id)) return;
    const free = this.slots.indexOf(null);
    if (free >= 0) this.slots[free] = id;
  }

  load(slots: unknown, selected: unknown): void {
    if (Array.isArray(slots)) for (let i = 0; i < this.slots.length; i++) {
      const id = slots[i];
      this.slots[i] = typeof id === 'string' ? (() => { try { itemDef(id); return id; } catch { return null; } })() : null;
    }
    this.selected = typeof selected === 'number' && selected >= 0 && selected < this.slots.length ? Math.floor(selected) : 0;
  }
}
