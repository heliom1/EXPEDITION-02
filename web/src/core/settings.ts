export interface Settings {
  sensitivity: number;
  invertY: boolean;
  quality: 'high' | 'low';
}

const KEY = 'cinderfall2.settings.v1';
const DEFAULTS: Settings = { sensitivity: 1, invertY: false, quality: 'high' };

/** Viewer preferences only; game progress is not stored here. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      sensitivity: typeof p.sensitivity === 'number' ? Math.min(3, Math.max(0.2, p.sensitivity)) : DEFAULTS.sensitivity,
      invertY: p.invertY === true,
      quality: p.quality === 'low' ? 'low' : 'high',
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
