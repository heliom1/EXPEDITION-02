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
  // ---- EXPEDITION 02 campaign records (user's cinematic script; kept close to its wording) ----
  reactor_diag: {
    id: 'reactor_diag', kind: 'telemetry', title: 'Reactor Diagnostic Report', source: 'Reactor control console', draft: false,
    body: [
      'PRIMARY POWER SYSTEM ..... fission surface power unit',
      'STATUS ................... standby → activation authorized',
      'CORE TEMPERATURE ......... nominal',
      'RADIATOR LOOPS ........... 2 of 2 pressurized',
      'OUTPUT AVAILABLE ......... 40 kWe',
      '',
      'Diagnostic report generated. Reactor activation authorized.',
    ].join('\n'),
  },
  c09: {
    id: 'c09', kind: 'report', title: 'ARCHIVED RECORD — Unfinished Expedition Report', source: 'Mission database', draft: false,
    body: [
      'UNFINISHED EXPEDITION REPORT',
      '',
      'Research location ....... C-09',
      'Status .................. Incomplete',
      'Last recorded activity .. 2035',
      'Associated personnel .... Expedition One',
      'Additional information .. Restricted',
    ].join('\n'),
  },
  vehicle_diag: {
    id: 'vehicle_diag', kind: 'telemetry', title: 'MEV-1 Vehicle Diagnostic', source: 'Hangar maintenance terminal', draft: false,
    body: [
      'ELECTRICAL ........ bus restored · battery 62 %',
      'NAVIGATION ........ IMU aligned · terrain-relative nav online',
      'INSTRUMENTS ....... survey radar · spectrometer · mast camera online',
      'DRIVE ............. 4 hub motors nominal · suspension within limits',
      '',
      'Vehicle initialization complete. Exploration systems online.',
    ].join('\n'),
  },
  survey1: {
    id: 'survey1', kind: 'telemetry', title: 'First Surface Survey', source: 'MEV-1 survey radar', draft: false,
    body: [
      'Surface survey completed. Geological data successfully collected.',
      '',
      'One additional navigation record detected: a periodic beacon on the plain to the east —',
      'identified as remote survey rover R-1 (Expedition 1), last command 2035.',
    ].join('\n'),
  },
  transmission_e1: {
    id: 'transmission_e1', kind: 'report', title: 'Recovered Transmission — Expedition One', source: 'Comms uplink (archived, damaged)', draft: false,
    body: [
      '"Expedition One, private research recording.',
      'We\'ve identified something beneath the surface.',
      'The readings are unusual.',
      'We need to investigate further before sending our final report.',
      'Coordinates are being stored in the research archive."',
      '',
      'Archived coordinates: survey point DRL-2, channel floor south of the escarpment.',
    ].join('\n'),
  },
  recorder_e1: {
    id: 'recorder_e1', kind: 'report', title: 'Expedition One Data Recorder', source: 'Abandoned survey station', draft: false,
    body: [
      'Archived expedition data recovered.',
      '',
      'Several records reference underground geological surveys:',
      '• ground-penetrating radar profiles across the escarpment',
      '• a void beneath the cliff base, west of DRL-2',
      '• beacon route B-1 … B-5 into the cavity',
      '',
      'The coordinates point toward a nearby cave system.',
    ].join('\n'),
  },
  lab_analysis: {
    id: 'lab_analysis', kind: 'telemetry', title: 'Laboratory Analysis — Ice Sample', source: 'Outpost laboratory', draft: false,
    body: [
      'Material composition, purity and geological characteristics evaluated.',
      '',
      'WATER ICE CONFIRMED — the sample contains frozen water.',
      'Hydrogen readings in the field are explained by H₂O ice; no significant CO₂ ice.',
      'Fine dust layers between ice bands indicate deposition over many cycles.',
      '',
      'Additional environmental sampling recommended to determine the extent and distribution of the deposit.',
    ].join('\n'),
  },
  e1_surveys: {
    id: 'e1_surveys', kind: 'report', title: 'Expedition One — Geological Survey Archive', source: 'Archived geological database', draft: false,
    body: [
      'Previous expedition records detected. Multiple geological surveys reference subsurface anomalies.',
      '',
      'TIMELINE',
      '2033  orbital neutron data: elevated hydrogen, mid-latitudes',
      '2034  radar profiles across the escarpment',
      '2035  core sample scheduled at DRL-2 · cave route surveyed · report never filed',
    ].join('\n'),
  },
  reconstruction: {
    id: 'reconstruction', kind: 'telemetry', title: 'Research Reconstruction', source: 'Holographic mapping table', draft: false,
    body: [
      'Expedition 1 surveys combined with Expedition 2 field data.',
      '',
      'Several potential ice-bearing geological regions identified, including an undocumented Expedition 1 installation',
      'on the plain west of the escarpment.',
    ].join('\n'),
  },
  e1_final: {
    id: 'e1_final', kind: 'report', title: 'Final Expedition Recording — 2035', source: 'Expedition 1 research facility', draft: false,
    body: [
      '"Our latest geological survey indicates the presence of significant subsurface ice deposits.',
      'We have confirmed that the region contains frozen water.',
      'However, our current survey equipment cannot establish the full extent of the deposits.',
      'We recommend further exploration and additional sampling.',
      '…Our investigation remains incomplete."',
    ].join('\n'),
  },
  geo_assessment: {
    id: 'geo_assessment', kind: 'telemetry', title: 'Consolidated Geological Assessment', source: 'Expedition 1 + Expedition 2 data', draft: false,
    body: [
      'Geological assessment completed.',
      'Confirmed water ice deposits documented (lower chamber, cave system C-09).',
      'Previously unexplored regions with probable ice: 4.',
      'Additional exploration recommended.',
    ].join('\n'),
  },
  final_report: {
    id: 'final_report', kind: 'mission', title: 'Final Scientific Report', source: 'Expedition 2', draft: false,
    body: [
      'ENVIRONMENT — habitat atmosphere, water and food production restored; storm protocol validated.',
      'GEOLOGY — subsurface water ice confirmed and sampled; survey of four further regions recommended.',
      'SETTLEMENT — outpost operational; MEV-1 and R-1 returned to service.',
      'ARCHIVE — Expedition 1 research recovered and preserved.',
    ].join('\n'),
  },
};

const LEGACY_RECORDS: Record<string, StoryRecord> = {
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
      'Ground-penetrating radar: a large subsurface void under the escarpment approximately 190 m west of this site.',
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
      'At the base of the escarpment, where the radar placed the void, an opening leads into the mesa.',
      '',
      'A survey beacon stands just inside, still blinking. The first expedition came this way.',
      '',
      'This is the location the official record lists as never fully investigated.',
    ].join('\n'),
  },
  beacon_log: {
    id: 'beacon_log',
    kind: 'telemetry',
    title: 'Survey Beacon B-5',
    source: 'Beacon memory',
    draft: true,
    body: [
      'UNIT ............ B-5 of 5',
      'DEPLOYED BY ..... Expedition 1',
      'BATTERY ......... 9%',
      'ROUTE ........... mouth → throat → hall → lower passage',
      '',
      'Air temperature here: −71 °C, falling with depth.',
      'Final route note: "continue south — cold trap below."',
      '',
      'No beacons were deployed beyond this point.',
      '[OPEN STORY DECISION: who placed the beacons and when.]',
    ].join('\n'),
  },
  west_cache: {
    id: 'west_cache',
    kind: 'observation',
    title: 'Expedition 1 Sample Case',
    source: 'Field observation',
    draft: true,
    body: [
      'A sealed sample case in the west chamber. Six of twelve tube slots are filled, labelled CW-01 to CW-06 (cave wall).',
      '',
      'The case was never returned to the outpost, and none of these samples appear in the archive.',
      '',
      '[OPEN STORY DECISION: why the case was left here.]',
    ].join('\n'),
  },
  ice_discovery: {
    id: 'ice_discovery',
    kind: 'telemetry',
    title: 'Deposit Analysis — Lower Chamber',
    source: 'Suit spectrometer',
    draft: true,
    body: [
      'IDENTIFICATION: water ice (H₂O)',
      '  Strong absorption at 1.5 µm and 2.0 µm; no significant CO₂ ice signature.',
      '',
      'STRUCTURE: layered deposit, at least 2 m thick, with thin dust bands between layers.',
      'TEMPERATURE: −68 °C at the surface of the deposit.',
      'SETTING: a cold trap — the lower chamber stays colder than the passages above it.',
      '',
      'SIGNIFICANCE: accessible water close to the outpost — a resource for drinking water, oxygen production and agriculture.',
      '',
      'This deposit is not mentioned in the official Expedition 1 report.',
    ].join('\n'),
  },
  transmission: {
    id: 'transmission',
    kind: 'mission',
    title: 'Transmission Sent',
    source: 'Outpost terminal',
    draft: true,
    body: [
      'Findings transmitted: rover R-1 survey log, core sample DRL-2, cave survey, deposit analysis.',
      '',
      'Awaiting acknowledgement.',
      '',
      'Open question for the record: the first expedition reached this cave and mapped a route to the ice, yet their official report lists the site as never investigated.',
      '',
      '[OPEN STORY DECISION: the response, and what the first expedition knew.]',
    ].join('\n'),
  },
};
Object.assign(RECORDS, LEGACY_RECORDS);

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
