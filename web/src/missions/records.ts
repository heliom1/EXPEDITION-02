/**
 * In-game records. Sources: the user's GAME IDEATION overview (authoritative) and the master plan.
 * Anything not stated in the overview is marked `draft: true` and/or contains an
 * [OPEN STORY DECISION] tag so it can be replaced when the fuller story is supplied.
 * Do not add the previous astronaut's identity, fate, twists or ending here.
 */
export interface StoryRecord {
  id: string;
  kind: 'mission' | 'report' | 'telemetry' | 'observation' | 'status';
  title: string;
  source: string;
  body: string;
  draft: boolean;
}

export const INTRO = {
  heading: 'MARS, 2043',
  body: [
    'Ten years after the first human expedition arrived on Mars, you are the second astronaut sent to the planet.',
    'Your assignment is to continue the previous mission: maintain the existing base, repair and monitor the exploration rovers, and document what you find about the Martian environment and its potential to support human life.',
    'The larger question is whether Mars could one day become a destination for human settlement.',
  ],
};

export const RECORDS: Record<string, StoryRecord> = {
  assignment: {
    id: 'assignment',
    kind: 'mission',
    title: 'Assignment: Continue Expedition 1',
    source: 'Mission Control',
    draft: true,
    body: [
      'Welcome to the outpost. You are continuing the work of the first expedition.',
      '',
      'PRIORITY TASKS',
      '• Verify base systems: power, life support, food production.',
      '• Locate and inspect survey rover R-1. Last telemetry: the plain approximately 1.4 km east of the outpost.',
      '• Resume the scheduled drilling survey.',
      '',
      'Note: Expedition 1 handover records are incomplete. Several survey entries are missing from the archive.',
      '',
      '[OPEN STORY DECISION: crew names and mission chronology.]',
    ].join('\n'),
  },
  rover_log: {
    id: 'rover_log',
    kind: 'report',
    title: 'Rover R-1 — Survey Log (partial)',
    source: 'Rover onboard storage',
    draft: true,
    body: [
      'DRIVE SYSTEM ........ nominal',
      'BATTERY ............. 38%',
      'WHEEL 4 ............. bearing wear — service due',
      '',
      'SURVEY LOG: 214 entries.',
      'Entries 206–213 reference survey point DRL-2, on the channel floor south of the escarpment, and a scheduled core sample.',
      '',
      'These entries do not appear in the official Expedition 1 mission report, which lists the drilling survey as "not started".',
      '',
      'Entry 214: [record truncated]',
    ].join('\n'),
  },
  core_drl2: {
    id: 'core_drl2',
    kind: 'telemetry',
    title: 'Core Sample DRL-2',
    source: 'Drill telemetry',
    draft: true,
    body: [
      '0.0 – 3.1 m   layered fine-grained sediment',
      '3.1 m         torque spike; sample temperature drop',
      'Hydrogen-rich signature in the lower core. Further analysis required.',
      '',
      'Ground-penetrating radar: a large subsurface void under the cliff base approximately 170 m west of this site.',
      '',
      'Archive cross-check: Expedition 1 flagged this location — "not fully investigated".',
    ].join('\n'),
  },
  cliff_survey: {
    id: 'cliff_survey',
    kind: 'observation',
    title: 'Cliff Base Survey',
    source: 'Field observation',
    draft: true,
    body: [
      'At the base of the escarpment, where the radar placed the void, the cliff is undercut and fractured.',
      '',
      'This is the location the first expedition never fully investigated.',
      '',
      '[OPEN STORY DECISION: what the first expedition found here.]',
    ].join('\n'),
  },
};

/** Live base status shown at the hub panel (gameplay abstraction; values are illustrative). */
export function baseStatusRecord(s: { output: number; demand: number; farm: number; myco: number; bio: number; lifeSupport: number }): StoryRecord {
  const bar = (v: number) => '█'.repeat(Math.round(v / 10)).padEnd(10, '░') + ` ${Math.round(v)}%`;
  return {
    id: 'base_status',
    kind: 'status',
    title: 'Outpost Systems',
    source: 'Hub status panel',
    draft: false,
    body: [
      'POWER — fission reactor',
      `  Output  ${s.output.toFixed(1)} kWe`,
      `  Demand  ${s.demand.toFixed(1)} kWe   ${s.output >= s.demand ? 'SURPLUS' : 'DEFICIT'}`,
      '',
      'FOOD PRODUCTION',
      `  Indoor farm (greenhouse)   ${bar(s.farm)}`,
      `  Mycoprotein cultivation    ${bar(s.myco)}`,
      `  Bioreactor                 ${bar(s.bio)}`,
      '',
      `LIFE SUPPORT                 ${bar(s.lifeSupport)}`,
      '',
      'Radiation shelter: experimental system — standby.',
    ].join('\n'),
  };
}
