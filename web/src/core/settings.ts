export interface Settings {
  sensitivity: number;
  invertY: boolean;
  quality: 'high' | 'low';
  /** Master volume 0..1. */
  volume: number;
}

const KEY = 'cinderfall2.settings.v1';
const DEFAULTS: Settings = { sensitivity: 1, invertY: false, quality: 'high', volume: 0.8 };

/** Viewer preferences only; game progress is stored by save/saveSystem.ts. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      sensitivity: typeof p.sensitivity === 'number' ? Math.min(3, Math.max(0.2, p.sensitivity)) : DEFAULTS.sensitivity,
      invertY: p.invertY === true,
      quality: p.quality === 'low' ? 'low' : 'high',
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
