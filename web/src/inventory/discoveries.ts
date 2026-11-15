import type { StoryRecord } from '../missions/records';
import { itemDef } from './items';

/**
 * Geological discoveries for the expedition archive (System I). Each has an identity, description, location and a
 * mission-time reference. Text is scientific description only (no story content).
 */
export interface Discovery { id: string; item: string; x: number; z: number; missionSeconds: number }

export const discoveryRecordId = (item: string) => `geo_${item}`;

const missionTime = (s: number) => {
  const sol = Math.floor(s / 88775) + 1; // one sol = 24 h 39 m 35 s
  const r = s % 88775, hh = Math.floor(r / 3600), mm = Math.floor((r % 3600) / 60);
  return `Sol ${sol}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} mission time`;
};

export function discoveryRecord(d: Discovery): StoryRecord {
  const def = itemDef(d.item);
  return {
    id: discoveryRecordId(d.item),
    kind: 'observation',
    title: `${def.name.replace(/ sample$/, '')} identified`,
    source: 'Field scanner',
    draft: false,
    body: [
      def.description,
      '',
      `First sample: E ${d.x.toFixed(0)} m · N ${d.z.toFixed(0)} m`,
      `Logged: ${missionTime(d.missionSeconds)}`,
      '',
      'Sample stored in the suit inventory. Deposit it in the outpost supply locker to keep it for analysis.',
    ].join('\n'),
  };
}
