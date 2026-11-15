// Merges the EXPEDITION 02 cinematic script (user's "GAME CUTSCENES AND OBJECTIVES" document, lines kept verbatim)
// into src/audio/voiceLines.json. Existing lines are kept; some get new triggers so they still play at the matching
// story moment of the chaptered campaign. Re-run safely (lines are keyed by id).
// Usage: node tools/campaign-lines.mjs [--count]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/audio/voiceLines.json');
const j = JSON.parse(readFileSync(file, 'utf8'));

j.speakers.astronaut = { name: 'Astronaut', voiceId: 'bIHbv24MWmeRgasZH58o', voiceName: 'Will (ElevenLabs premade)', settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3 } };
j.speakers.pda = { name: 'PDA', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'Sarah (ElevenLabs premade)', settings: { stability: 0.7, similarity_boost: 0.8, style: 0.05 }, device: true };
j.speakers.rover = { name: 'Rover system', voiceId: 'SAz9YHcvj6GT2YYXdXww', voiceName: 'River (ElevenLabs premade)', settings: { stability: 0.85, similarity_boost: 0.7, style: 0 }, device: true };
j.speakers.researcher = { name: 'Expedition One researcher', voiceId: 'pFZP5JQG7iQjIQuC4Bku', voiceName: 'Lily (ElevenLabs premade)', settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 }, radio: true, archive: true };

// [id, speaker, trigger, text]
const L = [
  // ---- Opening (Part 1, scenes 02–09) ----
  ['o_brief', 'control', 'open:brief', "Welcome, Expedition Two. Ten years ago, humanity established its first permanent research outpost on Mars. Your assignment is to continue their work, restore the existing settlement, and investigate the planet's potential for long-term human habitation. Several scientific objectives remain unfinished. Your primary responsibilities include habitat maintenance, rover operations, environmental monitoring, and geological exploration. All mission systems are prepared. Destination: Mars."],
  ['o_journey', 'control', 'open:journey', 'Expedition Two, this is Mission Control. You are now approaching the final stage of your interplanetary journey. Estimated arrival at Mars is confirmed. All onboard systems are functioning within acceptable parameters. Prepare for orbital insertion.'],
  ['o_reveal1', 'astronaut', 'open:reveal1', 'Mission Control, Expedition Two. Mars is in visual range.'],
  ['o_reveal2', 'astronaut', 'open:reveal2', "Ten years since the first expedition... Now it's our turn."],
  ['o_approach', 'control', 'open:approach', 'Expedition Two, begin atmospheric entry preparations. Confirm heat shield integrity. Confirm landing sequence. All systems are ready.'],
  ['o_copy', 'astronaut', 'open:copy', 'Copy that. Beginning descent preparations.'],
  ['o_entry1', 'control', 'open:entry1', 'Atmospheric entry confirmed. Maintain your descent trajectory. Telemetry is stable.'],
  ['o_entry2', 'control', 'open:entry2', 'Expedition Two, we are experiencing signal interference. Continue descent.'],
  ['o_chute', 'control', 'open:chute', 'Parachute deployment confirmed. Descent velocity decreasing. Prepare for powered landing.'],
  ['o_alt1', 'control', 'open:alt1', 'Altitude decreasing. Five hundred meters.'],
  ['o_alt2', 'control', 'open:alt2', 'One hundred meters. Contact expected.'],
  ['o_touch', 'control', 'open:touch', 'Touchdown confirmed. Welcome to Mars, Expedition Two.'],
  ['o_steps1', 'astronaut', 'open:steps1', 'Mission Control... Expedition Two has successfully landed.'],
  ['o_steps2', 'astronaut', 'open:steps2', "It's beautiful out here."],
  ['o_steps3', 'control', 'open:steps3', 'Welcome to Mars. Your mission begins now.'],
  // ---- Chapter 01 ----
  ['c1_view', 'astronaut', 'obj:locate_outpost:approach', "According to the navigation system, the research outpost should be somewhere ahead. Let's see what ten years on Mars has done to this place."],
  ['c1_outpost', 'pda', 'obj:locate_outpost:done', 'Destination reached. Original research outpost identified. Structural integrity: assessment required.'],
  ['c1_airlock', 'pda', 'obj:airlock:approach', 'External airlock detected. Access authorization required.'],
  ['c1_airlock_done', 'pda', 'obj:airlock:done', 'Airlock cycle completed. Internal atmospheric conditions are within acceptable limits.'],
  ['c1_power_a', 'pda', 'obj:emergency_power:approach', 'Primary electrical distribution is offline. Emergency power is available. Manual activation required.'],
  ['c1_power_b', 'pda', 'obj:emergency_power:done', 'Emergency power restored. Habitat control systems are now accessible.'],
  ['c1_power_c', 'control', 'obj:emergency_power:done', "Expedition Two, we've detected your habitat connection. Welcome to the settlement."],
  ['c1_inspect_a', 'pda', 'obj:inspect_habitat:approach', 'Initial habitat inspection required. Several facilities require assessment.'],
  ['c1_inspect_b', 'pda', 'obj:inspect_habitat:done', 'Initial assessment completed. Multiple systems require restoration.'],
  ['c1_inspect_c', 'astronaut', 'obj:inspect_habitat:done', "Looks like we've got some work to do."],
  // ---- Chapter 02 ----
  ['c2_reactor_a', 'pda', 'obj:reactor:approach', 'Primary power system identified. Current operational status: standby. Complete a diagnostic assessment before activation.'],
  ['c2_reactor_b', 'pda', 'obj:reactor:done', 'Diagnostic report generated. Reactor activation authorized.'],
  ['c2_elec_a', 'pda', 'obj:electrical:approach', 'Several distribution channels are inactive. Restore the designated power connections.'],
  ['c2_elec_b', 'pda', 'obj:electrical:done', 'Electrical distribution restored. Essential habitat systems may now be activated.'],
  ['c2_water_a', 'pda', 'obj:water:approach', 'Water-recycling facility detected. Processing efficiency is below operational requirements.'],
  ['c2_water_b', 'pda', 'obj:water:done', 'Water-recycling system operational. Resource monitoring has resumed.'],
  ['c2_o2_a', 'pda', 'obj:oxygen:approach', 'Atmospheric processing system requires inspection. Review oxygen-generation status.'],
  ['c2_o2_b', 'pda', 'obj:oxygen:done', 'Oxygen-generation system operational. Habitat atmospheric support restored.'],
  ['c2_food_a', 'astronaut', 'obj:food:approach', "An entire food-production facility. Let's see if we can bring it back."],
  ['c2_food_b', 'pda', 'obj:food:approach', 'Food-production modules require restoration. Hydroponic cultivation, fungal cultivation, and nutrient recycling are available for assessment.'],
  ['c2_food_c', 'pda', 'obj:food:done', 'Food-production facilities operational. Long-term resource monitoring initiated.'],
  ['c2_final_a', 'pda', 'obj:restoration:approach', 'All designated restoration tasks have been recorded. Final habitat assessment required.'],
  ['c2_final_b', 'control', 'obj:restoration:done', "Expedition Two, we've received your restoration report. Your settlement is operational. Excellent work."],
  ['c2_hook', 'astronaut', 'hook:c09', "What's Sector C-09?"],
  // ---- Chapter 03 ----
  ['c3_garage', 'pda', 'obj:garage:done', 'Rover maintenance facility identified. Available exploration vehicles detected.'],
  ['c3_inspect', 'astronaut', 'obj:inspect_vehicle:approach', "This should be our primary exploration vehicle. Let's see what condition it's in."],
  ['c3_inspect_b', 'pda', 'obj:inspect_vehicle:approach', 'Vehicle diagnostic required.'],
  ['c3_restore_a', 'pda', 'obj:restore_vehicle:approach', 'Electrical, navigation, and scientific instrumentation systems require inspection.'],
  ['c3_restore_b', 'rover', 'obj:restore_vehicle:done', 'Vehicle initialization complete. Exploration systems online.'],
  ['c3_deploy_a', 'astronaut', 'obj:first_deploy:approach', 'Expedition Two beginning first surface survey.'],
  ['c3_deploy_b', 'pda', 'obj:first_deploy:done', 'Surface survey completed. Geological data successfully collected. One additional navigation record detected.'],
  ['c3_deploy_c', 'astronaut', 'obj:first_deploy:done', "That's strange. Where did these coordinates come from?"],
  // ---- Chapter 04 ----
  ['c4_alert', 'pda', 'obj:storm_alert:approach', 'Environmental alert. Severe dust storm approaching the settlement. External operations should be suspended.'],
  ['c4_secure', 'pda', 'obj:secure:approach', 'External equipment security required. Return exploration vehicles to protected storage.'],
  ['c4_protect', 'pda', 'obj:storm_mode:approach', 'Environmental protection protocol available. Prioritize essential habitat functions.'],
  ['c4_maintain', 'pda', 'obj:maintain:approach', 'Monitor essential resource production. Maintain stable habitat conditions until the storm passes.'],
  ['c4_trans_a', 'pda', 'obj:transmission1:approach', 'Unidentified archived transmission detected. Source: Expedition One.'],
  ['c4_trans_b', 'researcher', 'obj:transmission1:done', "Expedition One, private research recording. We've identified something beneath the surface. The readings are unusual. We need to investigate further before sending our final report. Coordinates are being stored in the research archive."],
  ['c4_trans_c', 'astronaut', 'obj:transmission1:done', 'Beneath the surface?'],
  // ---- Chapter 05 ----
  ['c5_prep', 'pda', 'obj:long_prep:approach', 'Long-distance exploration preparation required. Inspect vehicle condition, navigation, communications, and scientific instruments.'],
  ['c5_prep_b', 'astronaut', 'obj:long_prep:done', "All right. Let's find out what's out there."],
  ['c5_travel', 'pda', 'obj:travel:approach', 'Navigation destination confirmed. Proceed to designated survey coordinates.'],
  ['c5_arrive', 'pda', 'obj:travel:done', 'Survey location reached.'],
  ['c5_sample_a', 'pda', 'obj:samples:approach', 'Geological sample collection authorized. Record surface composition and environmental conditions.'],
  ['c5_sample_b', 'pda', 'obj:samples:done', 'Sample successfully catalogued.'],
  ['c5_form_a', 'pda', 'obj:formation:approach', 'Unusual subsurface readings detected. Additional scanning required.'],
  ['c5_form_b', 'pda', 'obj:formation:done', 'Subsurface anomaly recorded. Data correlation pending.'],
  ['c5_rec_a', 'astronaut', 'obj:recorder:approach', 'This equipment belongs to the first expedition. How long has this been sitting here?'],
  ['c5_rec_b', 'pda', 'obj:recorder:done', 'Archived expedition data recovered. Several records reference underground geological surveys.'],
  // ---- Chapter 06 ----
  ['c6_ent_a', 'pda', 'obj:cave_entrance:approach', 'Geological formation identified. Subsurface readings indicate a possible underground cavity. Proceed with environmental assessment.'],
  ['c6_ent_b', 'astronaut', 'obj:cave_entrance:done', "This is the location from the archived coordinates. Let's take a closer look."],
  ['c6_prep_a', 'pda', 'obj:cave_prep:approach', 'Underground exploration preparation required. Inspect portable lighting, environmental sensors, and geological scanning equipment.'],
  ['c6_prep_b', 'pda', 'obj:cave_prep:done', 'Exploration equipment ready. Underground survey authorized.'],
  ['c6_enter', 'astronaut', 'obj:enter_cave:approach', "Mission Control, Expedition Two. We've entered the underground formation. Visibility is limited, but the structure appears stable."],
  ['c6_chamber', 'pda', 'obj:enter_cave:done', 'Underground chamber identified. Environmental survey initiated.'],
  ['c6_scan_a', 'pda', 'obj:subsurface:approach', 'Unusual subsurface signal detected. Deploy geological scanning equipment.'],
  ['c6_scan_b', 'pda', 'obj:subsurface:done', 'High hydrogen concentration detected. Additional material identification required.'],
  ['c6_scan_c', 'astronaut', 'obj:subsurface:done', 'Hydrogen readings? That could mean several things. We need a closer look.'],
  ['c6_ice_a', 'pda', 'obj:ice:approach', 'Significant subsurface anomaly detected. Material composition remains unconfirmed. Proceed to designated scanning location.'],
  ['c6_ice_b', 'astronaut', 'reveal:ice:1', '...No way.'],
  ['c6_ice_c', 'astronaut', 'reveal:ice:2', "Mission Control... You're going to want to see this."],
  ['c6_ice_d', 'control', 'reveal:ice:3', 'Expedition Two, go ahead.'],
  ['c6_ice_e', 'astronaut', 'reveal:ice:4', "We've found ice. Not just traces. There's a massive deposit beneath the surface."],
  ['c6_ice_f', 'control', 'reveal:ice:5', 'Please repeat your last transmission.'],
  ['c6_ice_g', 'astronaut', 'reveal:ice:6', "Confirmed subsurface water ice. Large-scale deposits. Mission Control... I think we've found something important."],
  ['c6_sample_a', 'pda', 'obj:ice_sample:approach', 'Scientific sample collection authorized. Collect a controlled sample for laboratory analysis.'],
  ['c6_sample_b', 'astronaut', 'obj:ice_sample:done', "Sample secured. Let's get this back to the lab."],
  ['c6_return_a', 'pda', 'obj:return:approach', 'Scientific discovery successfully recorded. Return to the research outpost for laboratory analysis.'],
  ['c6_return_b', 'control', 'obj:return:done', "Expedition Two, we've received your discovery report. Congratulations. This could be one of the most significant findings of the mission."],
  // ---- Chapter 07 ----
  ['c7_lab_a', 'pda', 'obj:lab_transfer:approach', 'Laboratory transfer station identified. Secure the collected geological sample for analysis.'],
  ['c7_lab_b', 'pda', 'obj:lab_transfer:done', 'Sample successfully transferred. Laboratory analysis available.'],
  ['c7_an_a', 'pda', 'obj:analyze:approach', 'Scientific analysis initiated. Material composition, purity, and geological characteristics will be evaluated.'],
  ['c7_an_b', 'pda', 'obj:analyze:done', 'Water ice confirmed. Sample contains frozen water. Additional environmental sampling recommended to determine the extent and distribution of the deposit.'],
  ['c7_an_c', 'astronaut', 'obj:analyze:done', "So it's real. There's water beneath this surface."],
  ['c7_rev_a', 'pda', 'obj:review:approach', 'Previous expedition records detected. Multiple geological surveys reference subsurface anomalies.'],
  ['c7_rev_b', 'astronaut', 'obj:review:done', "They were looking for this. They already had evidence. But why didn't they finish the investigation?"],
  ['c7_rec_a', 'pda', 'obj:reconstruct:approach', "Available geological records can be combined. Reconstruct the previous expedition's underground survey."],
  ['c7_rec_b', 'pda', 'obj:reconstruct:done', 'Research reconstruction completed. Several potential ice-bearing geological regions identified.'],
  ['c7_com_a', 'pda', 'obj:earth:approach', 'Long-range communication system available. Transmit the verified scientific discovery.'],
  ['c7_com_b', 'control', 'obj:earth:done', "Expedition Two, we have received your findings. Your discovery is significant. We're forwarding the information to the scientific review team. Continue the investigation and preserve all original research records."],
  // ---- Chapter 08 ----
  ['c8_loc_a', 'pda', 'obj:facility:approach', 'Undocumented research facility identified. Architecture and equipment signatures correspond to Expedition One.'],
  ['c8_loc_b', 'astronaut', 'obj:facility:done', "This has to be the place. Let's see what they left behind."],
  ['c8_aux_a', 'pda', 'obj:aux:approach', 'Auxiliary power unavailable. Research archive inaccessible. Restore the designated facility systems.'],
  ['c8_aux_b', 'pda', 'obj:aux:done', 'Research archive accessible.'],
  ['c8_recs_a', 'pda', 'obj:records:approach', 'Multiple archived geological records detected. Recover and synchronize the available research files.'],
  ['c8_recs_b', 'astronaut', 'obj:records:done', 'They found the same readings. They knew there was something beneath this region.'],
  ['c8_final_a', 'pda', 'obj:final_recording:approach', 'Final expedition recording recovered. Recording date: twenty thirty-five.'],
  ['c8_final_b', 'researcher', 'archive:final:1', 'Our latest geological survey indicates the presence of significant subsurface ice deposits. We have confirmed that the region contains frozen water. However, our current survey equipment cannot establish the full extent of the deposits. We recommend further exploration and additional sampling.'],
  ['c8_final_c', 'researcher', 'archive:final:2', 'Our investigation remains incomplete.'],
  ['c8_final_d', 'astronaut', 'obj:final_recording:done', "They weren't hiding some impossible discovery. They simply never finished documenting it."],
  ['c8_survey_a', 'pda', 'obj:survey:approach', 'Original survey records recovered. Current Expedition Two observations available. Combine available data to produce a consolidated geological assessment.'],
  ['c8_survey_b', 'pda', 'obj:survey:done', 'Geological assessment completed. Confirmed water ice deposits documented. Additional exploration recommended.'],
  ['c8_report_a', 'pda', 'obj:final_report:approach', 'Final mission assessment required. Compile environmental, geological, and settlement data.'],
  ['c8_report_b', 'control', 'obj:final_report:done', "Expedition Two, your findings have been received. Your work has provided new evidence of Mars' potential for future human settlement. We are awaiting your final recommendation."],
  // ---- Epilogue ----
  ['e_assess', 'pda', 'obj:assessment:approach', 'All primary mission objectives have been recorded. Final assessment available.'],
  ['e_choice', 'control', 'obj:choice:approach', 'Expedition Two, your final report has been received. Humanity has waited a long time for a discovery like this. We need your recommendation.'],
  ['e_final1', 'astronaut', 'final:1', "Expedition Two, final log. Ten years ago, humanity came here to discover whether Mars could become our second home. Today, we've found another reason to keep looking."],
  ['e_final2', 'astronaut', 'final:2', "There's still so much we don't understand. Until the next expedition... End of transmission."],
];

// Existing lines move to the matching moment of the chaptered campaign (text unchanged).
const RETRIGGER = {
  checkin: 'obj:first_deploy:after', rover_board: 'first:remote', rover_log: 'obj:r1_link:done', drill_core: 'obj:formation:after',
  cliff: 'obj:cave_entrance:after', ice: 'reveal:ice:7', transmission: 'obj:earth:after', arrival: 'cutscene:arrival',
};
for (const l of j.lines) if (RETRIGGER[l.id]) l.trigger = RETRIGGER[l.id];
const byId = new Map(j.lines.map((l) => [l.id, l]));
for (const [id, speaker, trigger, text] of L) {
  if (!j.speakers[speaker]) throw new Error(`unknown speaker ${speaker}`);
  const prev = byId.get(id);
  if (prev) Object.assign(prev, { speaker, trigger, text });
  else { const l = { id, speaker, trigger, text }; j.lines.push(l); byId.set(id, l); }
}
if (process.argv.includes('--count')) {
  const per = {};
  for (const [id, , , t] of L) { const k = id.split('_')[0]; per[k] = (per[k] ?? 0) + t.length; }
  console.log(per, 'total', L.reduce((n, l) => n + l[3].length, 0));
} else {
  writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
  console.log(`${j.lines.length} lines in voiceLines.json`);
}
