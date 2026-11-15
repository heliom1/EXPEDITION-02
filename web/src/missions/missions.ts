import { events } from '../core/events';
import { SITES } from '../core/config';

export interface Objective {
  id: string;
  /** Campaign chapter (1–8; 9 = epilogue). */
  chapter: number;
  title: string;
  description: string;
  /** World target for HUD markers, minimap and compass (updated at runtime from props/sites). */
  target: { x: number; z: number; label: string };
}

/** Chapter titles from the EXPEDITION 02 cinematic script. */
export const CHAPTERS: Record<number, string> = {
  1: 'A New Beginning', 2: 'Restoring Life', 3: 'Forgotten Machines', 4: 'The Red Silence',
  5: 'Beyond the Horizon', 6: 'Beneath the Surface', 7: 'A Discovery Worth Protecting', 8: "The First Expedition's Legacy", 9: 'The Next Chapter',
};

const O = SITES.outpost;
const at = (dx: number, dz: number, label: string) => ({ x: O.x + dx, z: O.z + dz, label });
const ob = (chapter: number, id: string, title: string, description: string, target: Objective['target']): Objective => ({ id, chapter, title, description, target });

/**
 * The EXPEDITION 02 campaign (user's "GAME CUTSCENES AND OBJECTIVES" script, Chapters 01–08 + Epilogue).
 * The first build's mission (rover log → DRL-2 core → cliff → cave → ice → report) is kept inside it: R-1 (3.5),
 * the drill (5.4), the cave beacons (6.4), the deposit (6.5) and the transmission (7.5). Ids are stable save keys.
 */
export const OBJECTIVES: Objective[] = [
  ob(1, 'locate_outpost', 'Locate the research outpost', 'The navigation system places the Expedition 1 outpost north of the landing site, beyond the ridge.', at(0, -14, 'Outpost')),
  ob(1, 'airlock', 'Access the main airlock', 'Scan your identification card at the south airlock and cycle in.', at(1.6, -12.5, 'Airlock')),
  ob(1, 'emergency_power', 'Activate emergency power', 'Primary distribution is offline. Activate emergency power at the main control terminal.', at(-3.5, -3, 'Control terminal')),
  ob(1, 'inspect_habitat', 'Inspect the habitat', 'Assess the facilities: farm, storage, communications and the radiation shield generator.', at(0, 0, 'Habitat')),
  ob(2, 'reactor', 'Inspect the nuclear power system', 'Run a diagnostic at the reactor control console north-west of the habitat.', { x: SITES.reactor.x + 6, z: SITES.reactor.z - 6, label: 'Reactor control' }),
  ob(2, 'electrical', 'Restore electrical distribution', 'Reconnect the three inactive distribution channels at the main electrical panel.', at(-5, 4, 'Electrical panel')),
  ob(2, 'water', 'Restore water recycling', 'Replace the filter cartridge and verify the processing cycle in the storage wing.', at(-28, -6, 'Water recycler')),
  ob(2, 'oxygen', 'Restore oxygen generation', 'Run the operational test on the oxygen generator in the storage wing.', at(-28, -9.6, 'O₂ generator')),
  ob(2, 'food', 'Reactivate food production', 'Plant or water a grow bed in the farm module to restart cultivation.', at(23, 0, 'Farm')),
  ob(2, 'restoration', 'Complete habitat restoration', 'Return to the main control terminal for the final habitat assessment.', at(-3.5, -3, 'Control terminal')),
  ob(3, 'garage', 'Locate the rover garage', 'Follow the navigation marker to the maintenance hangar on the west apron.', at(-52, -14, 'Garage')),
  ob(3, 'inspect_vehicle', 'Inspect the primary rover', 'Inspect the manned exploration vehicle MEV-1 inside the hangar.', at(-52, -14, 'MEV-1')),
  ob(3, 'restore_vehicle', 'Restore rover systems', 'Run the electrical, navigation and instrument checks at the hangar maintenance terminal.', at(-52, -14, 'Maintenance terminal')),
  ob(3, 'first_deploy', 'Conduct the first rover deployment', 'Board MEV-1 [E], drive to the survey point and hold still while the survey scan runs.', at(560, -120, 'Survey point')),
  ob(3, 'r1_link', 'Re-establish the link with Rover R-1', 'The navigation record is the beacon of remote rover R-1. Open the PDA [Tab] › Rover R-1 › Take remote control, then download its log [G].', { x: SITES.rover.x, z: SITES.rover.z, label: 'Rover R-1' }),
  ob(4, 'storm_alert', 'Receive the environmental warning', 'Return to the habitat — the outpost has an environmental alert pending.', at(0, 0, 'Habitat')),
  ob(4, 'secure', 'Secure external equipment', 'Return MEV-1 to the hangar before the storm front arrives.', at(-52, -14, 'Garage')),
  ob(4, 'storm_mode', 'Activate environmental protection', 'Enable storm mode at the main control terminal.', at(-3.5, -3, 'Control terminal')),
  ob(4, 'maintain', 'Maintain essential systems', 'Check the outpost systems panel and the oxygen generator, then hold stable conditions until the storm passes.', at(4.5, -3, 'Systems panel')),
  ob(4, 'transmission1', 'Investigate the recovered transmission', 'The comms uplink caught a damaged archived message. Restore and play it.', at(-3.7, 29, 'Comms uplink')),
  ob(5, 'long_prep', 'Prepare for long-distance exploration', 'Run the deployment checks at the hangar maintenance terminal.', at(-52, -14, 'Maintenance terminal')),
  ob(5, 'travel', 'Travel to the first coordinates', 'Drive MEV-1 to the archived coordinates at survey point DRL-2.', { x: SITES.drill.x, z: SITES.drill.z, label: 'DRL-2' }),
  ob(5, 'samples', 'Collect geological samples', 'Cut two mineral samples with the rock drill [1] from the deposits near DRL-2 and collect them.', { x: SITES.drill.x, z: SITES.drill.z, label: 'Deposits' }),
  ob(5, 'formation', 'Investigate the unusual formation', 'Restart the DRL-2 core drill and scan the formation below it.', { x: SITES.drill.x, z: SITES.drill.z, label: 'DRL-2' }),
  ob(5, 'recorder', "Recover the first expedition's data recorder", 'An abandoned Expedition 1 survey station stands near the escarpment. Retrieve its data recorder.', { x: -120, z: -288, label: 'Survey station' }),
  ob(6, 'cave_entrance', 'Locate the cave entrance', 'The recorder points to a cavity in the escarpment west of DRL-2.', { x: SITES.cave.x, z: SITES.cave.z, label: 'Cliff base' }),
  ob(6, 'cave_prep', 'Prepare for underground exploration', 'Check lighting, sensors and the scanner at the equipment case by the cave mouth.', { x: SITES.cave.x, z: SITES.cave.z, label: 'Equipment' }),
  ob(6, 'enter_cave', 'Enter the cave', 'Use your suit lamp [F] and reach the first underground chamber.', { x: SITES.cave.x, z: SITES.cave.z, label: 'First chamber' }),
  ob(6, 'subsurface', 'Investigate the subsurface readings', "Follow the first expedition's beacons and scan at the last one.", { x: SITES.cave.x, z: SITES.cave.z, label: 'Beacon B-5' }),
  ob(6, 'ice', 'Find the source of the signal', 'Something in the lower chamber is reflecting your lamp. Find it.', { x: SITES.cave.x, z: SITES.cave.z, label: 'Lower chamber' }),
  ob(6, 'ice_sample', 'Collect an ice sample', 'Take a controlled sample from the accessible ice deposit for laboratory analysis.', { x: SITES.cave.x, z: SITES.cave.z, label: 'Ice deposit' }),
  ob(6, 'return', 'Return to the research outpost', 'Bring the sample home for laboratory analysis.', at(0, -14, 'Outpost')),
  ob(7, 'lab_transfer', 'Transfer the ice sample to the laboratory', 'Secure the sample in the analysis chamber in the north module.', at(4, 30, 'Lab station')),
  ob(7, 'analyze', 'Analyze the ice sample', 'Run the material analysis at the laboratory terminal.', at(4, 30, 'Lab terminal')),
  ob(7, 'review', "Review the first expedition's research", 'Open the archived geological database at the main control terminal.', at(-3.5, -3, 'Archive')),
  ob(7, 'reconstruct', 'Reconstruct the original research', 'Combine the records on the holographic mapping table.', at(0, 31, 'Holo-map table')),
  ob(7, 'earth', 'Establish communication with Earth', 'Transmit the verified discovery from the comms uplink.', at(-3.7, 29, 'Comms uplink')),
  ob(8, 'facility', 'Locate the original research facility', 'Follow the reconstructed survey to an undocumented Expedition 1 installation on the plain.', { x: -510, z: -150, label: 'Research facility' }),
  ob(8, 'aux', "Restore the facility's auxiliary systems", 'Seat the auxiliary power cell and close the main breaker.', { x: -510, z: -150, label: 'Facility systems' }),
  ob(8, 'records', 'Recover the original geological records', 'Recover and synchronize the research files at the facility terminal.', { x: -510, z: -150, label: 'Research terminal' }),
  ob(8, 'final_recording', 'Review the final expedition recording', 'Play the last archived recording from 2035.', { x: -510, z: -150, label: 'Research terminal' }),
  ob(8, 'survey', 'Complete the geological survey', 'Combine Expedition 1 and Expedition 2 data into one assessment at the facility terminal.', { x: -510, z: -150, label: 'Research terminal' }),
  ob(8, 'final_report', 'Prepare the final scientific report', 'Return to the outpost and compile the report at the main control terminal.', at(-3.5, -3, 'Control terminal')),
  ob(9, 'assessment', 'Complete the final mission assessment', 'Review all findings at the main control terminal.', at(-3.5, -3, 'Control terminal')),
  ob(9, 'choice', "Choose humanity's next step", 'Mission Control needs your recommendation.', at(-3.5, -3, 'Control terminal')),
];

/** Old (v1–v3 saves) objective index → the campaign objective that continues the same story point. */
export const LEGACY_OBJECTIVES: Record<number, string> = {
  0: 'locate_outpost', 1: 'r1_link', 2: 'formation', 3: 'cave_entrance', 4: 'subsurface', 5: 'ice', 6: 'earth', 7: 'facility',
};

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

  /** Restores progress from a save (does not emit events). */
  restore(index: number, records: string[], flags: string[]): void {
    this.index = Math.max(0, Math.min(OBJECTIVES.length, index));
    this.complete = this.index >= OBJECTIVES.length;
    this.records.splice(0, this.records.length, ...records.filter((r) => typeof r === 'string'));
    this.flags.clear();
    flags.forEach((f) => this.flags.add(f));
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
