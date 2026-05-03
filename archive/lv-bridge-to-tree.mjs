#!/usr/bin/env node
/**
 * Las Vegas toy scenario → deterministic decision tree (recommend / recommendSequence).
 * Maps CoT-style detections to engine hostiles/friendlies (target_class, movement_state, etc.).
 *
 * Run:  node archive/lv-bridge-to-tree.mjs
 *        node archive/lv-bridge-to-tree.mjs --frame 3
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

import { recommend, recommendSequence } from '../UI/jtac-sim-react/src/engine/decisionTree.js';
import { AIRCRAFT_ON_STATION, WEATHER, ROE } from '../UI/jtac-sim-react/src/data/units.js';

const LV_PATH = path.join(root, 'jtac_edge/data/old_scenarios/las_vegas_scenario.json');

/** ROE-approved classes used by 02_munition_selection / demo ROE */
const ROE_VEHICLE_SOFT = 'vehicle_wheeled_soft';
const ROE_VEHICLE_SOFT_MOVING = 'vehicle_wheeled_soft_moving';

function loadLasVegas() {
  return JSON.parse(readFileSync(LV_PATH, 'utf8'));
}

/**
 * Map scenario JSON "classification" + callsign/note to decision-tree target_class (same shape as jtac_scenario_runner).
 */
function targetClassFor(det) {
  const note = (det.note || '').toLowerCase();
  const cs = (det.callsign || '').toUpperCase();
  if (det.classification === 'unknown') return null;
  if (det.classification !== 'hostile') return null;
  const mover =
    note.includes('slow') ||
    note.includes('north') ||
    note.includes('convoy') ||
    note.includes('fleeing') ||
    cs.startsWith('CONVOY');
  return mover ? ROE_VEHICLE_SOFT_MOVING : ROE_VEHICLE_SOFT;
}

function movementFor(det, targetClass) {
  if (det.classification !== 'hostile') return { movement_state: 'stationary', speed_kts: undefined, heading_deg: undefined };
  if (targetClass === ROE_VEHICLE_SOFT_MOVING) {
    const h = noteHeading(det);
    return { movement_state: 'slow', speed_kts: 12, heading_deg: h };
  }
  return { movement_state: 'stationary', speed_kts: undefined, heading_deg: undefined };
}

function noteHeading(det) {
  const n = (det.note || '').toLowerCase();
  if (n.includes('north')) return 0;
  if (n.includes('northeast')) return 45;
  if (n.includes('south')) return 180;
  return 90;
}

function detectionToHostile(det) {
  const tc = targetClassFor(det);
  if (!tc) return null;
  const mv = movementFor(det, tc);
  return {
    id: det.uid,
    lat: det.lat,
    lng: det.lon,
    type: det.callsign,
    primary: false,
    description: `${det.callsign} — ${(det.note || '').replace(/·/g, '-').trim()}`,
    target_class: tc,
    movement_state: mv.movement_state,
    speed_kts: mv.speed_kts,
    heading_deg: mv.heading_deg,
    is_movable: true,
    cnn_confidence: Math.min(0.99, Math.max(0.5, Number(det.confidence) || 0.85)),
    tle_category: 'CAT_III',
    elevation_m: 920,
    in_structure: false,
    is_nsl_cat_i: false,
  };
}

function detectionToFriendly(det) {
  return {
    id: det.uid,
    lat: det.lat,
    lng: det.lon,
    exposure: det.uid.includes('02') ? 'vehicle-mounted' : 'dug-in',
    axis_orientation_deg: det.uid.includes('02') ? 90 : 45,
  };
}

function buildTacticalState(frame) {
  const hostiles = [];
  const friendlies = [];
  for (const d of frame.detections) {
    if (d.classification === 'friendly') friendlies.push(detectionToFriendly(d));
    else {
      const h = detectionToHostile(d);
      if (h) hostiles.push(h);
    }
  }
  const blue1 = friendlies.find((f) => f.id === 'friendly-01');
  const self = blue1
    ? { id: 'JTAC-LOOP', lat: blue1.lat - 0.002, lng: blue1.lng - 0.002 }
    : { id: 'JTAC-LOOP', lat: 36.206, lng: -115.084 };
  return { hostiles, friendlies, self };
}

function baseInput(tactical, primaryTargetId, type3Window) {
  return {
    hostiles: tactical.hostiles,
    friendlies: tactical.friendlies,
    self: tactical.self,
    primaryTargetId,
    aircraft: structuredClone(AIRCRAFT_ON_STATION),
    weather: { ...WEATHER },
    roe: ROE,
    time_of_day: 'day',
    friendlies_taking_effective_fire: false,
    civilians_within_500m: false,
    jtac_visual_on_target: false,
    jtac_visual_on_aircraft: false,
    multi_target_window: type3Window,
    supported_commander_authorized_type_3: type3Window,
    threats: [],
    target_is_time_sensitive: false,
    drone_has_laser_designator: true,
    drone_has_ir_pointer: true,
  };
}

function formatNineLine(rec) {
  if (!rec?.nine_line) return '(no nine_line — engageability blocked or no munition)\n';
  const n = rec.nine_line;
  const lines = [];
  lines.push(`L4  elevation : ${n.line_4?.value ?? '?'} ${n.line_4?.units ?? ''} ${n.line_4?.datum ?? ''}`);
  lines.push(`L5  target    : ${n.line_5?.value ?? '?'}`);
  lines.push(`L6  location  : ${n.line_6?.value ?? '?'} (${n.line_6?.datum ?? ''}) TLE ${n.line_6?.tle_category ?? ''}`);
  lines.push(`L7  mark      : ${n.line_7?.value ?? '?'}`);
  lines.push(`L8  friendlies: ${n.line_8?.value ?? '?'}`);
  lines.push(`L9  egress    : ${n.line_9?.value ?? '?'}`);
  if (rec.remarks?.length) {
    lines.push('REMARKS:');
    for (const r of rec.remarks) lines.push(`  - ${r.text}`);
  }
  if (rec.restrictions?.length) {
    lines.push('RESTRICTIONS (read-back):');
    for (const r of rec.restrictions) lines.push(`  - ${r.text}`);
  }
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  let frameIdx = 1;
  let type3Window = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--frame' && argv[i + 1]) frameIdx = parseInt(argv[i + 1], 10);
    if (argv[i] === '--type3-window') type3Window = true;
  }
  const scen = loadLasVegas();
  const frames = scen.frames;
  if (frameIdx < 0 || frameIdx >= frames.length) {
    console.error(`Invalid --frame ${frameIdx} (0..${frames.length - 1})`);
    process.exit(1);
  }
  const frame = frames[frameIdx];
  const tactical = buildTacticalState(frame);

  console.log('='.repeat(72));
  console.log(`Las Vegas scenario → decision tree  |  frame ${frameIdx}  t=${frame.t_sec}s`);
  console.log(`Hostiles: ${tactical.hostiles.map((h) => h.id).join(', ')}`);
  console.log(`Mapping: hostile technical/stationary → ${ROE_VEHICLE_SOFT}; convoy/slow → ${ROE_VEHICLE_SOFT_MOVING}`);
  console.log(`Type-3 window: ${type3Window} (pass --type3-window for cleared-to-engage multi-target)`);
  console.log('='.repeat(72));

  const attackOptions = [];

  for (const h of tactical.hostiles) {
    const inp = baseInput(tactical, h.id, type3Window);
    const rec = recommend(inp);
    attackOptions.push({ target_id: h.id, callsign: h.type, recommendation: rec });
    console.log(`\n--- Attack option (primary ${h.id} / ${h.type}) ---`);
    console.log(`engageability: ${rec.engageability}`);
    if (rec.munition?.primary) {
      console.log(
        `primary munition: ${rec.munition.primary.id}  control: ${rec.game_plan?.control_type}  MOA: ${rec.game_plan?.method_of_attack}`
      );
      if (rec.munition.alternatives?.length) {
        console.log(
          'alternatives:',
          rec.munition.alternatives.map((a) => a.id).join(', ')
        );
      }
    }
    console.log('\n9-LINE (L4–L9 + remarks/restrictions):\n');
    console.log(formatNineLine(rec));
  }

  const seqIds = tactical.hostiles.map((h) => h.id);
  const seqInput = baseInput(tactical, seqIds[0], type3Window);
  const seq = recommendSequence(seqInput, seqIds);

  console.log('\n' + '='.repeat(72));
  console.log('MULTI-STRIKE SEQUENCE (recommendSequence — same loadout depletion model)');
  console.log('='.repeat(72));
  for (const step of seq.steps) {
    if (step.skipped) {
      console.log(`\nStep ${step.step} ${step.target_id}: SKIPPED — ${step.skip_reason}`);
      continue;
    }
    const r = step.recommendation;
    console.log(`\nStep ${step.step}  ${step.target_id}`);
    console.log(`  engageability: ${r.engageability}`);
    if (r.munition?.primary) {
      console.log(`  weapon: ${r.munition.primary.id}  ${r.game_plan?.control_type}`);
    }
    console.log('  9-LINE:\n' + formatNineLine(r).replace(/^/gm, '    '));
  }
  console.log(`\nexpended summary: ${JSON.stringify(seq.munitions_expended)}`);
  console.log(`chain_broken: ${seq.chain_broken}`);

  const outPath = path.join(root, 'las_vegas_tree_output.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        scenario: scen.scenario,
        frame: frameIdx,
        attack_options: attackOptions.map(({ target_id, callsign, recommendation: r }) => ({
          target_id,
          callsign,
          engageability: r.engageability,
          game_plan: r.game_plan,
          munition_primary: r.munition?.primary ?? null,
          munition_alternatives: r.munition?.alternatives ?? [],
          nine_line: r.nine_line ?? null,
          remarks: r.remarks,
          restrictions: r.restrictions,
          reasoning_trace: r.reasoning_trace,
        })),
        multi_strike: seq,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`\nWrote ${outPath}`);
}

main();
