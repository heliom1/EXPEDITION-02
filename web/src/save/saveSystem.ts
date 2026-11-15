/**
 * Versioned save game in IndexedDB (one slot). Saves are validated on load; older versions are
 * migrated step by step; anything unreadable is reported as corrupt instead of crashing.
 */
import { LEGACY_OBJECTIVES, OBJECTIVES } from '../missions/missions';
import { LOCKER_STOCK, STARTING_HOTBAR, STARTING_KIT } from '../inventory/items';
import type { SlotData } from '../inventory/inventory';
import type { OreSave } from '../inventory/ore';
import type { Discovery } from '../inventory/discoveries';

export const SAVE_VERSION = 4;

export interface SaveData {
  version: number;
  savedAt: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  suit: { oxygen: number; power: number; health: number; lamp: boolean };
  mission: { index: number; records: string[]; flags: string[] };
  world: { drill: 'idle' | 'running' | 'done'; drillProgress: number; iceScanned: boolean };
  playSeconds: number;
  /** v3: suit inventory slots, quick slots, storage containers by id, ore world changes, geological discoveries. */
  inventory: SlotData[];
  hotbar: { slots: Array<string | null>; selected: number };
  storage: Record<string, SlotData[]>;
  ore: OreSave;
  discoveries: Discovery[];
  /** Rover R-1 state (optional: absent in early v3 saves → rover starts at its survey site). */
  rover?: { x: number; z: number; yaw: number; battery: number; condition: number; odometer: number };
  /** Outpost facilities (farm beds, shields, comms credits; optional: absent → fresh state). Validated by loadFacilities. */
  base?: unknown;
  /** v4: MEV-1 manned exploration vehicle (optional: absent → parked in the hangar). */
  mev?: { x: number; z: number; yaw: number; battery: number; condition: number; odometer: number };
}

/** Fresh v3 inventory state (new game, and the v2 → v3 migration). */
export function defaultInventoryState(): Pick<SaveData, 'inventory' | 'hotbar' | 'storage' | 'ore' | 'discoveries'> {
  return {
    inventory: STARTING_KIT.map(([id, count]) => ({ id, count })),
    hotbar: { slots: [...STARTING_HOTBAR], selected: 0 },
    storage: { locker_main: LOCKER_STOCK.map(([id, count]) => ({ id, count })) },
    ore: { remaining: {}, pickups: [] },
    discoveries: [],
  };
}

export type LoadResult = { status: 'none' } | { status: 'ok'; data: SaveData; migratedFrom?: number } | { status: 'corrupt'; reason: string };

const DB = 'cinderfall2';
const STORE = 'saves';
const SLOT = 'slot1';

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;
/** MIGRATIONS[n] upgrades a version-n save to version n+1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 (never shipped publicly; kept as the migration example): no lamp flag, no ice scan.
  1: (s) => {
    const suit = (s.suit ?? {}) as Record<string, unknown>;
    const world = (s.world ?? {}) as Record<string, unknown>;
    return { ...s, version: 2, suit: { ...suit, lamp: false }, world: { ...world, iceScanned: false } };
  },
  // v2 → v3: inventory/storage/ore systems added; existing saves receive the starting kit and a stocked locker.
  2: (s) => ({ ...s, version: 3, ...defaultInventoryState() }),
  // v3 → v4: the 7-objective vertical slice became the chaptered EXPEDITION 02 campaign. The old objective index maps
  // to the campaign objective at the same story point; everything before it is marked done (no cinematics replay).
  3: (s) => {
    const m = (s.mission ?? {}) as { index?: number; records?: string[]; flags?: string[] };
    const oldIndex = typeof m.index === 'number' ? m.index : 0;
    const target = LEGACY_OBJECTIVES[Math.max(0, Math.min(7, oldIndex))] ?? 'locate_outpost';
    const index = Math.max(0, OBJECTIVES.findIndex((o) => o.id === target));
    const flags = new Set((m.flags ?? []).filter((f) => !f.startsWith('done.')));
    for (const o of OBJECTIVES.slice(0, index)) { flags.add(`done.${o.id}`); flags.add(`appr.${o.id}`); }
    if (index > 0) flags.add('s.airlock.scan');
    return { ...s, version: 4, mission: { index, records: m.records ?? [], flags: [...flags] } };
  },
};

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Structural validation; returns a reason string when invalid. */
export function validate(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'not an object';
  const d = s as SaveData;
  if (d.version !== SAVE_VERSION) return `version ${String(d.version)}`;
  if (!d.player || !num(d.player.x, -4000, 4000) || !num(d.player.y, -500, 1000) || !num(d.player.z, -4000, 4000)) return 'player position';
  if (!num(d.player.yaw, -1e4, 1e4) || !num(d.player.pitch, -2, 2)) return 'player view';
  if (!d.suit || !num(d.suit.oxygen, 0, 100) || !num(d.suit.power, 0, 100) || !num(d.suit.health, 0, 100)) return 'suit';
  if (!d.mission || !num(d.mission.index, 0, 100) || !Array.isArray(d.mission.records) || !Array.isArray(d.mission.flags)) return 'mission';
  if (!d.world || !['idle', 'running', 'done'].includes(d.world.drill)) return 'world';
  if (!Array.isArray(d.inventory) || d.inventory.length > 64) return 'inventory';
  if (!d.hotbar || !Array.isArray(d.hotbar.slots) || !num(d.hotbar.selected, 0, 9)) return 'hotbar';
  if (!d.storage || typeof d.storage !== 'object' || Object.values(d.storage).some((v) => !Array.isArray(v))) return 'storage';
  if (!d.ore || typeof d.ore !== 'object' || !Array.isArray(d.ore.pickups)) return 'ore';
  if (!Array.isArray(d.discoveries)) return 'discoveries';
  if (d.rover !== undefined && (!num(d.rover.x, -4000, 4000) || !num(d.rover.z, -4000, 4000) || !num(d.rover.battery, 0, 100) || !num(d.rover.condition, 0, 100))) return 'rover';
  return null;
}

/** Applies migrations and validation to raw stored data (pure; unit-tested). */
export function upgrade(raw: unknown): LoadResult {
  if (raw === undefined || raw === null) return { status: 'none' };
  if (typeof raw !== 'object') return { status: 'corrupt', reason: 'not an object' };
  let s = raw as Record<string, unknown>;
  const from = typeof s.version === 'number' ? s.version : NaN;
  if (!Number.isInteger(from) || from < 1 || from > SAVE_VERSION) return { status: 'corrupt', reason: `unknown version ${String(s.version)}` };
  for (let v = from; v < SAVE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) return { status: 'corrupt', reason: `no migration from v${v}` };
    s = m(s);
  }
  const reason = validate(s);
  if (reason) return { status: 'corrupt', reason };
  return from === SAVE_VERSION ? { status: 'ok', data: s as unknown as SaveData } : { status: 'ok', data: s as unknown as SaveData, migratedFrom: from };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? new Error('transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export const saveStore = {
  available: typeof indexedDB !== 'undefined',
  async load(): Promise<LoadResult> {
    try {
      return upgrade(await tx('readonly', (s) => s.get(SLOT)));
    } catch (e) {
      return { status: 'corrupt', reason: `storage error: ${String(e)}` };
    }
  },
  async save(data: SaveData): Promise<boolean> {
    try {
      await tx('readwrite', (s) => s.put(data, SLOT));
      return true;
    } catch {
      return false;
    }
  },
  async clear(): Promise<void> {
    try { await tx('readwrite', (s) => s.delete(SLOT)); } catch { /* nothing to clear */ }
  },
};
