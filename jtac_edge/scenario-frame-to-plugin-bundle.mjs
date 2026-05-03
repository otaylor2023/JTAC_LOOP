#!/usr/bin/env node
/**
 * Recommendation-only step: one scenario frame → jtac_plugin_targets JSON for send_plugin_json_udp.py.
 * CoT playback and UDP sending stay in Python (jtac_scenario_runner.py); this script only runs the JS decision tree.
 *
 *   node jtac_edge/scenario-frame-to-plugin-bundle.mjs path/to/scenario.json --frame 0 --json-only
 *   node jtac_edge/scenario-frame-to-plugin-bundle.mjs jtac_edge/data/old_scenarios/las_vegas_scenario.json --frame 2 --out /tmp/bundle.json
 *
 * Mapping: Las Vegas-style vehicle heuristics; optional per-detection `target_class` (must be in demo ROE);
 * hostile + infantry/dismounted/personnel keywords → personnel_concentrated / personnel_open.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

import { recommend } from '../UI/jtac-sim-react/src/engine/decisionTree.js';
import { AIRCRAFT_ON_STATION, WEATHER, ROE } from '../UI/jtac-sim-react/src/data/units.js';

const ROE_VEHICLE_SOFT = 'vehicle_wheeled_soft';
const ROE_VEHICLE_SOFT_MOVING = 'vehicle_wheeled_soft_moving';
const ROE_PERSONNEL_CONCENTRATED = 'personnel_concentrated';
const ROE_PERSONNEL_OPEN = 'personnel_open';

const APPROVED = new Set(ROE.approved_categories || []);

function targetClassFor(det) {
  if (det.classification === 'unknown') return null;
  if (det.classification !== 'hostile') return null;
  if (typeof det.target_class === 'string' && APPROVED.has(det.target_class)) {
    return det.target_class;
  }
  const note = (det.note || '').toLowerCase();
  const cs = (det.callsign || '').toLowerCase();
  const blob = `${note} ${cs}`;
  if (
    /\b(infantry|dismounted|personnel|squad|troops|paratroop|dis\b|rifle)\b/.test(blob) ||
    /\bx\d+\b/.test(cs)
  ) {
    const mover =
      note.includes('slow') ||
      note.includes('north') ||
      note.includes('south') ||
      note.includes('moving') ||
      note.includes('convoy') ||
      note.includes('fleeing') ||
      cs.includes('convoy');
    return mover ? ROE_PERSONNEL_OPEN : ROE_PERSONNEL_CONCENTRATED;
  }
  const mover =
    note.includes('slow') ||
    note.includes('north') ||
    note.includes('convoy') ||
    note.includes('fleeing') ||
    (det.callsign || '').toUpperCase().startsWith('CONVOY');
  return mover ? ROE_VEHICLE_SOFT_MOVING : ROE_VEHICLE_SOFT;
}

function noteHeading(det) {
  const n = (det.note || '').toLowerCase();
  if (n.includes('north')) return 0;
  if (n.includes('northeast')) return 45;
  if (n.includes('south')) return 180;
  return 90;
}

function movementFor(det, targetClass) {
  if (det.classification !== 'hostile') {
    return { movement_state: 'stationary', speed_kts: undefined, heading_deg: undefined };
  }
  if (targetClass === ROE_VEHICLE_SOFT_MOVING || targetClass === ROE_PERSONNEL_OPEN) {
    return { movement_state: 'slow', speed_kts: targetClass === ROE_PERSONNEL_OPEN ? 4 : 12, heading_deg: noteHeading(det) };
  }
  return { movement_state: 'stationary', speed_kts: undefined, heading_deg: undefined };
}

function defaultElevationM(scenario, det) {
  if (det.elevation_m != null && Number.isFinite(Number(det.elevation_m))) return Number(det.elevation_m);
  if (scenario.jtac_plugin_elevation_m != null) return Number(scenario.jtac_plugin_elevation_m);
  return 400;
}

function detectionToHostile(det, scenario) {
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
    tle_category: det.tle_category || 'CAT_III',
    elevation_m: defaultElevationM(scenario, det),
    in_structure: Boolean(det.in_structure),
    is_nsl_cat_i: Boolean(det.is_nsl_cat_i),
  };
}

function detectionToFriendly(det) {
  return {
    id: det.uid,
    lat: det.lat,
    lng: det.lon,
    exposure: det.exposure || (det.uid && String(det.uid).includes('02') ? 'vehicle-mounted' : 'dug-in'),
    axis_orientation_deg:
      det.axis_orientation_deg != null ? Number(det.axis_orientation_deg) : det.uid && String(det.uid).includes('02') ? 90 : 45,
  };
}

function withGeoOffset(det, latOff, lonOff) {
  if (!latOff && !lonOff) return det;
  return {
    ...det,
    lat: Number(det.lat) + latOff,
    lon: Number(det.lon) + lonOff,
  };
}

function buildTacticalState(scenario, frame, latOff = 0, lonOff = 0) {
  const hostiles = [];
  const friendlies = [];
  for (const d of frame.detections || []) {
    const dd = withGeoOffset(d, latOff, lonOff);
    if (dd.classification === 'friendly') friendlies.push(detectionToFriendly(dd));
    else {
      const h = detectionToHostile(dd, scenario);
      if (h) hostiles.push(h);
    }
  }
  const blue1 = friendlies[0];
  const anchor = scenario.jtac_self_anchor || {};
  const firstDet = frame.detections?.[0];
  const firstOff = firstDet ? withGeoOffset(firstDet, latOff, lonOff) : { lat: 36.206 + latOff, lon: -115.084 + lonOff };
  const self = blue1
    ? {
        id: anchor.id || 'JTAC-LOOP',
        lat: anchor.lat != null ? Number(anchor.lat) + latOff : blue1.lat - 0.002,
        lng: anchor.lng != null ? Number(anchor.lng) + lonOff : blue1.lng - 0.002,
      }
    : {
        id: anchor.id || 'JTAC-LOOP',
        lat: anchor.lat != null ? Number(anchor.lat) + latOff : Number(firstOff.lat) || 36.206 + latOff,
        lng: anchor.lng != null ? Number(anchor.lng) + lonOff : Number(firstOff.lon) || -115.084 + lonOff,
      };
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

function alternateRecommendation(primaryRec, alt) {
  const tid = primaryRec.target_id;
  const primaryMun = {
    id: alt.id,
    name: alt.name,
    guidance: alt.guidance,
    effectiveness_rating: alt.effectiveness_rating,
    effectiveness_score: alt.effectiveness_score,
    why_considered: alt.why_considered,
  };
  return {
    engageability: primaryRec.engageability,
    target_id: tid,
    target_classification: primaryRec.target_classification,
    flags: primaryRec.flags,
    routing: primaryRec.routing,
    game_plan: primaryRec.game_plan,
    munition: {
      primary: primaryMun,
      alternatives: [],
      eliminated: [],
    },
  };
}

function buildPluginTargets(tactical, type3Window) {
  const targets = [];
  for (const h of tactical.hostiles) {
    const inp = baseInput(tactical, h.id, type3Window);
    const rec = recommend(inp);
    const track = {
      lat: h.lat,
      lon: h.lng,
      callsign: h.type || h.id,
    };
    const options = [{ role: 'primary', recommendation: rec }];
    const alts = rec.munition?.alternatives || [];
    for (const alt of alts) {
      options.push({
        role: 'alternate',
        recommendation: alternateRecommendation(rec, alt),
      });
    }
    targets.push({
      target_id: h.id,
      track,
      options,
    });
  }
  return targets;
}

function parseArgs(argv) {
  let scenarioPath = null;
  let frameIdx = 0;
  let type3Window = false;
  let jsonOnly = false;
  let outPath = null;
  let jtacSelfId = null;
  let latOffsetDeg = 0;
  let lonOffsetDeg = 0;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--frame' && argv[i + 1]) {
      frameIdx = parseInt(argv[i + 1], 10);
      i++;
      continue;
    }
    if (a === '--type3-window') {
      type3Window = true;
      continue;
    }
    if (a === '--json-only') {
      jsonOnly = true;
      continue;
    }
    if (a === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i++;
      continue;
    }
    if (a === '--jtac-self-id' && argv[i + 1]) {
      jtacSelfId = argv[i + 1];
      i++;
      continue;
    }
    if (a === '--lat-offset-deg' && argv[i + 1]) {
      latOffsetDeg = parseFloat(argv[i + 1]);
      i++;
      continue;
    }
    if (a === '--lon-offset-deg' && argv[i + 1]) {
      lonOffsetDeg = parseFloat(argv[i + 1]);
      i++;
      continue;
    }
    if (!a.startsWith('-') && !scenarioPath) {
      scenarioPath = a;
      continue;
    }
    rest.push(a);
  }
  return { scenarioPath, frameIdx, type3Window, jsonOnly, outPath, jtacSelfId, latOffsetDeg, lonOffsetDeg, rest };
}

function main() {
  const {
    scenarioPath,
    frameIdx,
    type3Window,
    jsonOnly,
    outPath,
    jtacSelfId,
    latOffsetDeg,
    lonOffsetDeg,
  } = parseArgs(process.argv.slice(2));
  if (!scenarioPath) {
    console.error(
      'usage: node jtac_edge/scenario-frame-to-plugin-bundle.mjs <scenario.json> --frame N [--json-only] [--out path] [--type3-window] [--jtac-self-id ID] [--lat-offset-deg D] [--lon-offset-deg D]'
    );
    process.exit(2);
  }
  const abs = path.isAbsolute(scenarioPath) ? scenarioPath : path.join(process.cwd(), scenarioPath);
  const scen = JSON.parse(readFileSync(abs, 'utf8'));
  const frames = scen.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    console.error('scenario has no frames[]');
    process.exit(1);
  }
  if (frameIdx < 0 || frameIdx >= frames.length) {
    console.error(`Invalid --frame ${frameIdx} (0..${frames.length - 1})`);
    process.exit(1);
  }
  const frame = frames[frameIdx];
  const tactical = buildTacticalState(scen, frame, latOffsetDeg, lonOffsetDeg);
  const jtac_plugin_targets = buildPluginTargets(tactical, type3Window);
  const bundle = {
    scenario: scen.scenario,
    schema_version: scen.schema_version ?? 1,
    jtac_self_id: jtacSelfId || scen.jtac_self_id || `JTAC_LOOP frame ${frameIdx}`,
    generated_at_utc: new Date().toISOString(),
    jtac_plugin_targets,
  };
  const text = JSON.stringify(bundle, null, jsonOnly ? 0 : 2) + (jsonOnly ? '' : '\n');
  if (outPath) {
    writeFileSync(outPath, text, 'utf8');
    if (!jsonOnly) console.error(`Wrote ${outPath}`);
  }
  if (jsonOnly) {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  } else if (!outPath) {
    process.stdout.write(text);
  }
}

main();
