import { events } from '../core/events';
import { SITES } from '../core/config';

export interface Objective {
  id: string;
  title: string;
  description: string;
  /** World target for HUD markers, minimap and compass. */
  target: { x: number; z: number; label: string };
}

/** Vertical-slice mission chain. Story text stays within the user's overview (see records.ts). */
export const OBJECTIVES: Objective[] = [
  {
    id: 'checkin',
    title: 'Check in at the outpost',
    description: 'Reach the outpost and check for signs of the first expedition at the mission terminal.',
    target: { x: SITES.outpost.x + 24, z: SITES.outpost.z - 3, label: 'Terminal' },
  },
  {
    id: 'rover',
    title: 'Inspect survey rover R-1',
    description: 'Its last telemetry places it on the plain about 1.4 km east. Check its onboard log.',
    target: { x: SITES.rover.x, z: SITES.rover.z, label: 'Rover R-1' },
  },
  {
    id: 'drill',
    title: 'Run the core drill at DRL-2',
    description: 'The rover log lists a core sample at DRL-2 that the official report says never started. Restart the drill.',
    target: { x: SITES.drill.x, z: SITES.drill.z, label: 'DRL-2' },
  },
  {
    id: 'cliff',
    title: 'Survey the cliff base',
    description: 'Radar shows a void under the escarpment west of DRL-2. Find it.',
    target: { x: SITES.cave.x, z: SITES.cave.z, label: 'Cliff base' },
  },
];

export class MissionState {
  index = 0;
  readonly records: string[] = [];
  readonly flags = new Set<string>();
  complete = false;

  get current(): Objective | null {
    return this.complete ? null : OBJECTIVES[this.index] ?? null;
  }

  addRecord(id: string): void {
    if (this.records.includes(id)) return;
    this.records.push(id);
    events.emit('record', { id });
  }

  /** Completes the current objective if it matches `id`. */
  completeObjective(id: string): boolean {
    const cur = this.current;
    if (!cur || cur.id !== id) return false;
    this.flags.add(`done.${id}`);
    this.index++;
    if (this.index >= OBJECTIVES.length) {
      this.complete = true;
      events.emit('endOfBuild', {});
    } else {
      events.emit('objective', { id: OBJECTIVES[this.index].id });
      events.emit('notice', { text: `New objective: ${OBJECTIVES[this.index].title}`, tone: 'good' });
    }
    return true;
  }
}
