/**
 * Versioned save game in IndexedDB (one slot). Saves are validated on load; older versions are
 * migrated step by step; anything unreadable is reported as corrupt instead of crashing.
 */
export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
  savedAt: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  suit: { oxygen: number; power: number; health: number; lamp: boolean };
  mission: { index: number; records: string[]; flags: string[] };
  world: { drill: 'idle' | 'running' | 'done'; drillProgress: number; iceScanned: boolean };
  playSeconds: number;
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
