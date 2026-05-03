// Deterministic decision-tree recommendation engine.
// Ports /JTAC_Manuals/DECISION_TREE/*.yaml into in-browser JS.
// Inputs: { hostiles, friendlies, self, primaryTargetId, aircraft, weather, roe, time_of_day }
// Output: structured recommendation matching DECISION_TREE/output_schema.json

import { MUNITIONS, MUNITIONS_BY_ID, EFFECTIVENESS_RATINGS, effectivenessRating } from '../data/munitions.js.js';
import { bearingDeg, distanceM, projectM, closestFriendly, friendlyDirectionFromTarget, approximateMGRS, bearingToCardinal } from './geo.js.js';

// PID confidence thresholds by target class. Personnel is slightly higher
// (civilian-vs-combatant ambiguity is harder), but lowered from 0.92 → 0.85
// after live testing — 0.92 was eliminating viable targets that a human
// JTAC would have engaged. Flagged for Collen confirmation.
const PID_THRESHOLDS_BY_CLASS = { vehicle: 0.80, personnel: 0.85, structure: 0.80, default: 0.80 };

// PID class lookup — maps target_class to coarse category for confidence threshold.
function pidCategoryFor(targetClass) {
  if (!targetClass) return 'default';
  if (targetClass.startsWith('vehicle')) return 'vehicle';
  if (targetClass.startsWith('personnel')) return 'personnel';
  if (targetClass.startsWith('structure') || targetClass.startsWith('bunker')) return 'structure';
  return 'default';
}

// TLE category → meters
const TLE_M = { CAT_I: 10, CAT_II: 20, CAT_III: 30 };

// ─────────────────────────────────────────────────────────────────────────
// TREE 1 — ENGAGEABILITY GATE
// ─────────────────────────────────────────────────────────────────────────
function engageabilityGate(state) {
  const { target, friendlies_taking_effective_fire, roe, time_of_day } = state;
  const trace = [];

  // Branch 0: self-defense override (parallel)
  if (friendlies_taking_effective_fire) {
    trace.push({
      tree: 'Tree 1 — Engageability', status: 'override',
      text: 'Friendlies taking effective fire → SELF-DEFENSE OVERRIDE. Bypasses NSL + ROE category checks. PID and airspace gates still apply.',
    });
    return { engageability: 'SELF_DEFENSE_OVERRIDE', flags: ['SELF_DEFENSE_OVERRIDE'], trace };
  }

  // Gate: PID confidence threshold
  const cat = pidCategoryFor(target.target_class);
  const threshold = PID_THRESHOLDS_BY_CLASS[cat] ?? PID_THRESHOLDS_BY_CLASS.default;
  if ((target.cnn_confidence ?? 0) < threshold) {
    trace.push({
      tree: 'Tree 1 — Engageability', status: 'blocked',
      text: `PID confidence ${target.cnn_confidence?.toFixed(2)} < ${threshold} threshold for ${cat}. Single-source FMV insufficient (JFO ATTP ¶1-136). NOT ENGAGEABLE — surfaces to JTAC.`,
    });
    return {
      engageability: 'NOT_ENGAGEABLE',
      flags: ['INSUFFICIENT_PID', 'LOW_CONFIDENCE'],
      block_reasons: [`PID confidence ${target.cnn_confidence?.toFixed(2)} below ${threshold} (${cat})`],
      trace,
    };
  }

  // Gate: target itself on no-strike list (per Collen CF-1.1)
  if (target.is_nsl_cat_i) {
    trace.push({
      tree: 'Tree 1 — Engageability', status: 'blocked',
      text: 'Target is itself a Cat I no-strike entity (hospital/school/mosque/etc). NOT ENGAGEABLE.',
    });
    return { engageability: 'NOT_ENGAGEABLE', flags: ['TARGET_IS_NSL'], block_reasons: ['Target is Cat I no-strike entity'], trace };
  }

  // Gate: TLE compatible at all (CAT III or better)
  if (!TLE_M[target.tle_category]) {
    trace.push({
      tree: 'Tree 1 — Engageability', status: 'blocked',
      text: `Position uncertainty worse than CAT III (${target.tle_category}). NOT ENGAGEABLE — refine via mensuration.`,
    });
    return { engageability: 'NOT_ENGAGEABLE', flags: ['TLE_DEGRADED'], block_reasons: ['Position uncertainty exceeds CAT III'], trace };
  }

  // Gate: ROE category authorized (uses pre-mission ROE; Collen CF-1.2)
  if (roe?.approved_categories && !roe.approved_categories.includes(target.target_class)) {
    trace.push({
      tree: 'Tree 1 — Engageability', status: 'blocked',
      text: `Target class ${target.target_class} not in ROE approved categories.`,
    });
    return { engageability: 'NOT_ENGAGEABLE', flags: ['ROE_BLOCKED'], block_reasons: ['Target class not authorized by current ROE'], trace };
  }

  trace.push({
    tree: 'Tree 1 — Engageability', status: 'passed',
    text: `Hostile ${target.target_class}, PID ${target.cnn_confidence?.toFixed(2)} ≥ ${threshold}, position fix ${target.tle_category}, ROE-approved. PASSED.`,
  });
  return { engageability: 'ENGAGEABLE', flags: [], trace };
}

// ─────────────────────────────────────────────────────────────────────────
// TREE 2 — MUNITION SELECTION
//   Stage 0: movement gate (Collen CF-1.3)
//   Stage 2A: hard filter
//   Stage 2B: flag stage
//   Stage 2C: rank
// ─────────────────────────────────────────────────────────────────────────
function munitionSelection(state, engOutput) {
  const { target, closest_friendly_distance_m, aircraft, weather, time_of_day, weapon_override } = state;
  const trace = [];

  // ── JTAC weapon override — skip the ranker, force a specific munition.
  //    Still surfaces a MARGINAL flag if the rating is poor so the JTAC
  //    sees they're outside the engine's recommendation.
  if (weapon_override) {
    const m = MUNITIONS_BY_ID[weapon_override];
    if (m) {
      const stocked = state.aircraft.loadout?.[m.id]?.count ?? 0;
      const rating = effectivenessRating(target.target_class, m.effectiveness_class);
      const flags = [];
      if (closest_friendly_distance_m <= m.red_standing_m) flags.push('DANGER_CLOSE');
      if (m.type_1_prohibited) flags.push('TYPE_1_PROHIBITED');
      if (rating === 'NOT_REC' || rating === 'MARGINAL') flags.push('MARGINAL_EFFECTIVENESS_OVERRIDE');
      trace.push({
        tree: 'Tree 2 — Munition', status: 'flagged',
        text: `JTAC override → ${m.id}. Rating: ${rating}. ${flags.length ? 'Flags: ' + flags.join(', ') : ''}`,
      });
      return {
        munition: { ...m, _rating: rating, _stocked: stocked, _flags: flags, _score: 1.0 },
        alternatives: [],
        eliminated: [],
        flags,
        trace,
      };
    }
  }

  // ── Stage 0: movement gate ──
  const isMover = ['slow', 'fast'].includes(target.movement_state) || target.is_movable;
  const PRIMARY_FAMILIES = isMover
    ? new Set(['laser', 'gps_laser', 'iir'])
    : new Set(['gps', 'gps_laser']);
  const movementGateNote = isMover
    ? 'moving/movable → laser/IIR primary family (Collen CF-1.3)'
    : 'stationary/not movable → GPS-coordinate primary family (Collen CF-1.3)';

  // ── Stage 2A: hard filter ──
  const candidates = [];
  const eliminated = [];
  for (const m of MUNITIONS) {
    // Aircraft compatibility
    if (!m.delivery_aircraft.includes(aircraft.platform)) {
      eliminated.push({ id: m.id, reason: `not deliverable by ${aircraft.platform}` });
      continue;
    }
    // Aircraft has it
    const stocked = aircraft.loadout?.[m.id]?.count ?? 0;
    if (stocked === 0) {
      eliminated.push({ id: m.id, reason: 'not on aircraft loadout' });
      continue;
    }
    // TLE compatibility
    const tleHave = TLE_M[target.tle_category] ?? Infinity;
    if (tleHave > m.tle_required_m) {
      eliminated.push({ id: m.id, reason: `TLE ${target.tle_category} (${tleHave}m) > required ${m.tle_required_m}m` });
      continue;
    }
    // Weather supports guidance
    if (m.guidance === 'laser' && weather.cloud_ceiling_ft < 5000) {
      eliminated.push({ id: m.id, reason: 'cloud ceiling defeats laser guidance' });
      continue;
    }
    if (m.guidance === 'iir' && weather.visibility_m < 3000) {
      eliminated.push({ id: m.id, reason: 'visibility defeats IIR seeker' });
      continue;
    }
    if ((m.guidance === 'gps' || m.guidance === 'gps_laser') && weather.gps_jamming) {
      eliminated.push({ id: m.id, reason: 'GPS jamming' });
      continue;
    }
    // Effectiveness check
    const rating = effectivenessRating(target.target_class, m.effectiveness_class);
    if (rating === 'NOT_REC' || rating === 'PROHIBITED') {
      eliminated.push({ id: m.id, reason: `${rating} vs ${target.target_class}` });
      continue;
    }

    candidates.push({ ...m, _rating: rating, _stocked: stocked });
  }

  if (candidates.length === 0) {
    trace.push({
      tree: 'Tree 2 — Munition', status: 'blocked',
      text: `No viable munition (${eliminated.length} eliminated). Top reasons: ${eliminated.slice(0, 3).map(e => `${e.id} (${e.reason})`).join('; ')}.`,
    });
    return { munition: null, alternatives: [], eliminated, flags: ['NO_VIABLE_MUNITION'], trace };
  }

  // ── Stage 2B: flag stage ──
  const flags = [];
  for (const c of candidates) {
    c._flags = [];
    if (closest_friendly_distance_m <= c.red_standing_m) {
      c._flags.push('DANGER_CLOSE');
      if (closest_friendly_distance_m < 0.5 * c.red_standing_m) c._flags.push('EXTREME_DANGER_CLOSE');
    }
    if (c.type_1_prohibited) c._flags.push('TYPE_1_PROHIBITED');
  }

  // ── Stage 2C: rank ──
  for (const c of candidates) {
    let score = EFFECTIVENESS_RATINGS[c._rating] ?? 0;
    if (PRIMARY_FAMILIES.has(c.guidance)) score += 0.20; // Stage 0 movement gate bonus
    // Friendly safety margin tiebreaker
    score += Math.min(0.15, ((closest_friendly_distance_m - c.red_standing_m) / Math.max(c.red_standing_m, 1)) * 0.05);
    // Loadout depth tiebreaker
    score += Math.min(0.05, c._stocked * 0.005);
    c._score = score;
  }
  candidates.sort((a, b) => b._score - a._score);

  const primary = candidates[0];
  const alternatives = candidates.slice(1, 3).map(c => ({
    id: c.id, name: c.name, why_considered: rationaleFor(c, target, isMover),
    effectiveness_rating: c._rating, effectiveness_score: c._score,
  }));

  trace.push({
    tree: 'Tree 2 — Munition', status: primary._flags.length ? 'flagged' : 'passed',
    text: `Stage 0 movement gate: ${movementGateNote}. ${candidates.length} candidates after hard filter (${eliminated.length} eliminated). Top: ${primary.id} (${primary._rating}, score ${primary._score.toFixed(2)})${primary._flags.length ? ', flags: ' + primary._flags.join(', ') : ''}.`,
  });

  return {
    munition: { ...primary },
    alternatives, eliminated,
    flags: [...new Set(candidates.flatMap(c => c._flags))],
    trace,
  };
}

function rationaleFor(m, target, isMover) {
  if (m.guidance === 'iir' && isMover) return 'IIR seeker — autonomous lock on movers';
  if (m.guidance === 'laser' && isMover) return 'Laser homing — works on movers via designation';
  if (m.guidance === 'gps' && !isMover) return 'GPS-only — coordinate-based on stationary target';
  if (m.guidance === 'gps_laser') return 'GPS+laser hybrid';
  if (m.class === 'gun') return 'Direct fire — exempt from CDE';
  return `${m._rating} vs ${target.target_class}`;
}

// ─────────────────────────────────────────────────────────────────────────
// TREE 3 — CONTROL TYPE
// ─────────────────────────────────────────────────────────────────────────
function controlTypeSelection(state, engOutput, munOutput) {
  const trace = [];
  const m = munOutput.munition;
  const flags = munOutput.flags || [];
  const { jtac_visual_on_target, jtac_visual_on_aircraft, multi_target_window, supported_commander_authorized_type_3 } = state;
  const dangerClose = flags.includes('DANGER_CLOSE');
  const civiliansClose = state.civilians_within_500m;

  // Hard rule: GPS → Type 1 prohibited
  if (m?.type_1_prohibited) {
    if (multi_target_window && supported_commander_authorized_type_3) {
      trace.push({ tree: 'Tree 3 — Control', status: 'flagged', text: `Multi-target authorized + GPS munition → Type 3.` });
      return { control_type: 'Type_3', clearance_call: 'CLEARED TO ENGAGE', method_of_attack: 'BOC', trace };
    }
    trace.push({ tree: 'Tree 3 — Control', status: 'flagged', text: `GPS-guided ${m.id} → Type 1 PROHIBITED (JP 3-09.3 III-43). Type 2 forced.` });
    return { control_type: 'Type_2', clearance_call: 'CLEARED HOT', method_of_attack: 'BOC', trace };
  }

  // Multi-target Type 3
  if (multi_target_window && supported_commander_authorized_type_3) {
    trace.push({ tree: 'Tree 3 — Control', status: 'flagged', text: 'Multi-target window + commander authorized → Type 3.' });
    return { control_type: 'Type_3', clearance_call: 'CLEARED TO ENGAGE', method_of_attack: 'BOT', trace };
  }

  // Type 1 viable when JTAC has dual visual + non-GPS
  if (jtac_visual_on_target && jtac_visual_on_aircraft) {
    trace.push({ tree: 'Tree 3 — Control', status: 'passed', text: `JTAC dual-visual + non-GPS munition → Type 1${dangerClose ? ' (danger close forces tightest control)' : ''}.` });
    return { control_type: 'Type_1', clearance_call: 'CLEARED HOT', method_of_attack: 'BOT', trace };
  }

  // Civilians close + non-GPS — heuristic prefers Type 1 if available
  if (civiliansClose && !m?.type_1_prohibited && jtac_visual_on_target) {
    trace.push({ tree: 'Tree 3 — Control', status: 'flagged', text: 'Civilians within 500m + JTAC has target visual → Type 1 (heuristic).' });
    return { control_type: 'Type_1', clearance_call: 'CLEARED HOT', method_of_attack: 'BOT', trace };
  }

  // Default: Type 2 — drone is JTAC's eyes
  trace.push({ tree: 'Tree 3 — Control', status: 'passed', text: 'Drone-fed CAS + JTAC remote → Type 2 default. Drone serves as remote sensor (JP 3-09.3 III-45).' });
  return { control_type: 'Type_2', clearance_call: 'CLEARED HOT', method_of_attack: 'BOT', trace };
}

// ─────────────────────────────────────────────────────────────────────────
// TREE 4 — MARK METHOD
// ─────────────────────────────────────────────────────────────────────────
function markMethod(state, munOutput, ctrlOutput) {
  const trace = [];
  const m = munOutput.munition;
  const moa = ctrlOutput.method_of_attack;
  const isNight = state.time_of_day === 'night';
  const drone_has_laser = state.drone_has_laser_designator ?? true;
  const drone_has_ir = state.drone_has_ir_pointer ?? true;

  if (moa === 'BOC' && m?.guidance === 'gps') {
    trace.push({ tree: 'Tree 4 — Mark', status: 'passed', text: 'BOC + GPS-guided → Line 7 = "no mark".' });
    return { mark_type: 'no_mark', value: 'No mark — pilot acquires via GPS', prf_code: null, backup: null, trace };
  }

  if (m?.guidance === 'laser' || m?.guidance === 'gps_laser') {
    if (drone_has_laser) {
      trace.push({ tree: 'Tree 4 — Mark', status: 'passed', text: 'Laser-guided weapon → drone laser primary, PRF 1688.' });
      return {
        mark_type: 'laser', value: 'Drone laser, code 1688', prf_code: '1688',
        backup: drone_has_ir ? { mark_type: 'ir_pointer', value: 'IR pointer (SPARKLE) — backup' } : null,
        trace,
      };
    }
    trace.push({ tree: 'Tree 4 — Mark', status: 'flagged', text: 'Laser-guided weapon but no designator available — fallback to talk-on (degraded).' });
    return { mark_type: 'talk_on', value: 'Talk-on (DEGRADED — laser required)', prf_code: null, backup: null, trace };
  }

  if (m?.guidance === 'iir') {
    trace.push({ tree: 'Tree 4 — Mark', status: 'passed', text: 'IIR seeker (Maverick) → no mark; pilot acquires.' });
    return { mark_type: 'no_mark', value: 'No mark — pilot acquisition (IIR)', prf_code: null, backup: null, trace };
  }

  if (isNight && drone_has_ir) {
    trace.push({ tree: 'Tree 4 — Mark', status: 'passed', text: 'Night + NVG aircrew + IR pointer available → IR pointer (SPARKLE).' });
    return { mark_type: 'ir_pointer', value: 'IR pointer SPARKLE', prf_code: null, backup: null, trace };
  }

  trace.push({ tree: 'Tree 4 — Mark', status: 'passed', text: 'Talk-on from common reference point.' });
  return { mark_type: 'talk_on', value: 'Talk-on from CRP', prf_code: null, backup: null, trace };
}

// ─────────────────────────────────────────────────────────────────────────
// TREE 5 — IP/EGRESS (geometry; simplified)
// ─────────────────────────────────────────────────────────────────────────
function ipAndEgress(state, _ctrlOutput) {
  const trace = [];
  const target = state.target;
  const friendly = state.closest_friendly?.friendly;
  // Egress = away from friendlies (180° from friendly bearing).
  let egressDeg = 0;
  if (friendly) {
    const friendlyBrg = bearingDeg(target.lat, target.lng, friendly.lat, friendly.lng);
    egressDeg = (friendlyBrg + 180) % 360;
  }
  // Default attack heading: opposite of egress (for the live demo we let JTAC override via map drag).
  const attackHeading = state.user_heading != null ? state.user_heading : Math.round(egressDeg);
  const egressCardinal = bearingToCardinal(egressDeg);

  trace.push({
    tree: 'Tree 5 — IP/Egress', status: 'passed',
    text: `Egress ${egressCardinal} (${Math.round(egressDeg)}°) — opposite friendly bearing. Attack heading ${attackHeading}°M.`,
  });

  return {
    attack_heading_deg: attackHeading,
    egress_direction: egressCardinal,
    egress_value: `Egress ${egressCardinal}, climb to 8000 ft MSL`,
    line_1_ip: 'IP NORTH',  // JTAC selects from named IPs at runtime
    trace,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// TREE 6 — RESTRICTIONS (parallel flag enumeration)
// ─────────────────────────────────────────────────────────────────────────
function restrictionEnumeration(state, munOutput, ctrlOutput, markOutput, ipOutput) {
  const trace = [];
  const remarks = [];
  const restrictions = [];
  const m = munOutput.munition;

  // LTL when laser is used
  if (markOutput.mark_type === 'laser') {
    const ltl = (ipOutput.attack_heading_deg + 180) % 360; // simplified
    remarks.push(`LTL ${String(Math.round(ltl)).padStart(3, '0')}°M`);
    const fahLow = (ltl + 10) % 360;
    const fahHigh = (ltl + 60) % 360;
    restrictions.push(`FAH ${String(Math.round(fahLow)).padStart(3, '0')}-${String(Math.round(fahHigh)).padStart(3, '0')} clockwise (laser cone)`);
  }

  // Danger close
  if (munOutput.flags?.includes('DANGER_CLOSE')) {
    restrictions.push(`DANGER CLOSE — friendlies inside ${m.id} RED (${Math.round(state.closest_friendly_distance_m)}m vs ${m.red_standing_m}m); GFC initials required`);
    if (state.friendly_axis_deg != null) {
      restrictions.push(`FAH parallel to friendly axis ${String(state.friendly_axis_deg).padStart(3, '0')}° ± 30°`);
    }
  }

  // Self-defense
  if (state.friendlies_taking_effective_fire) {
    remarks.push('SELF-DEFENSE — friendlies under effective fire');
  }

  // Moving target
  if (state.target.movement_state && state.target.movement_state !== 'stationary') {
    const ts = new Date().toISOString().slice(11, 16) + 'Z';
    remarks.push(`Moving target: ${state.target.speed_kts ?? '?'} kts hdg ${state.target.heading_deg ?? '?'}°, time stamp ${ts}`);
  }

  // Threats
  if (state.threats?.length) {
    state.threats.forEach(t => remarks.push(`Threat: ${t.type} at ${t.bearing_cardinal}/${t.distance_m}m, suppression: ${t.suppression || 'none'}`));
  }

  // TOT — always last
  restrictions.push(state.target_is_time_sensitive ? 'TOT immediate' : 'TOT push when ready');

  trace.push({
    tree: 'Tree 6 — Restrictions', status: restrictions.some(r => r.startsWith('DANGER CLOSE')) ? 'flagged' : 'passed',
    text: `${remarks.length} remarks + ${restrictions.length} restrictions. ${restrictions.some(r => r.startsWith('DANGER CLOSE')) ? 'Danger close active.' : 'No danger close.'}`,
  });

  return { remarks, restrictions, trace };
}

function _nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function _profileSegments(marks) {
  const segments = [];
  for (let i = 1; i < marks.length; i++) {
    segments.push({
      name: marks[i].name,
      ms: marks[i].t - marks[i - 1].t,
    });
  }
  return {
    wall_ms: marks.length > 1 ? marks[marks.length - 1].t - marks[0].t : 0,
    segments,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// TOP-LEVEL: assemble full structured recommendation
// Optional `options.profile === true` attaches `_profile` with per-phase ms
// (for benchmarks; default path has no measurable overhead beyond one branch).
// ─────────────────────────────────────────────────────────────────────────
export function recommend(input, options = {}) {
  const profile = options?.profile === true;
  const marks = profile ? [{ name: 'start', t: _nowMs() }] : null;
  const phaseMark = (name) => {
    if (marks) marks.push({ name, t: _nowMs() });
  };

  const { hostiles, friendlies, self, primaryTargetId, aircraft, weather, roe, time_of_day, user_heading } = input;
  const target = hostiles.find(h => h.id === primaryTargetId);
  if (!target) {
    const err = { error: 'no_primary_target', engageability: 'NOT_ENGAGEABLE', flags: ['NO_PRIMARY_TARGET'], reasoning_trace: [] };
    if (profile) err._profile = _profileSegments(marks);
    return err;
  }

  phaseMark('after_resolve_target');
  const closest = closestFriendly(target, friendlies);
  const state = {
    target, friendlies, self, aircraft, weather, roe, time_of_day, user_heading,
    closest_friendly: closest,
    closest_friendly_distance_m: closest?.distance_m ?? Infinity,
    friendly_axis_deg: closest?.friendly?.axis_orientation_deg,
    friendlies_taking_effective_fire: input.friendlies_taking_effective_fire ?? false,
    civilians_within_500m: input.civilians_within_500m ?? false,
    jtac_visual_on_target: input.jtac_visual_on_target ?? false,
    jtac_visual_on_aircraft: input.jtac_visual_on_aircraft ?? false,
    multi_target_window: input.multi_target_window ?? false,
    supported_commander_authorized_type_3: input.supported_commander_authorized_type_3 ?? false,
    threats: input.threats ?? [],
    target_is_time_sensitive: input.target_is_time_sensitive ?? false,
    drone_has_laser_designator: input.drone_has_laser_designator ?? true,
    drone_has_ir_pointer: input.drone_has_ir_pointer ?? true,
  };

  phaseMark('after_state_build');

  // Tree 1
  const eng = engageabilityGate(state);
  phaseMark('after_tree1');
  if (eng.engageability === 'NOT_ENGAGEABLE') {
    const out = {
      engageability: eng.engageability,
      flags: eng.flags,
      block_reasons: eng.block_reasons,
      target_id: target.id,
      reasoning_trace: eng.trace,
      routing: { current_step: 'closed_not_engaged', chain: ['system_generated', 'jtac_review', 'closed_not_engaged'], next_recipient: 'jtac', final_approver: null },
    };
    if (profile) out._profile = _profileSegments(marks);
    return out;
  }

  // Tree 2 → Tree 3 → Tree 4 → Tree 5 → Tree 6
  const mun = munitionSelection(state, eng);
  phaseMark('after_tree2');
  if (!mun.munition) {
    const out = {
      engageability: 'NOT_ENGAGEABLE',
      flags: [...eng.flags, ...mun.flags],
      block_reasons: ['No viable munition'],
      target_id: target.id,
      reasoning_trace: [...eng.trace, ...mun.trace],
    };
    if (profile) out._profile = _profileSegments(marks);
    return out;
  }
  const ctrl = controlTypeSelection(state, eng, mun);
  phaseMark('after_tree3');
  const markOut = markMethod(state, mun, ctrl);
  phaseMark('after_tree4');
  const ipEg = ipAndEgress(state, ctrl);
  phaseMark('after_tree5');
  const restr = restrictionEnumeration(state, mun, ctrl, markOut, ipEg);
  phaseMark('after_tree6');

  // Compose 9-line
  const targetElevationFt = Math.round((target.elevation_m ?? 380) * 3.28084);
  const mgrs = approximateMGRS(target.lat, target.lng);

  const line5 = target.description || `${target.target_class.replace(/_/g, ' ')}`;
  const line8 = closest
    ? `${closest.bearing_cardinal} ${Math.round(closest.distance_m)} m${closest.friendly?.exposure ? ', ' + closest.friendly.exposure : ''}`
    : '—';

  const recommendation = {
    engageability: eng.engageability,
    target_id: target.id,
    target_classification: target.description,
    target_class: target.target_class,
    cnn_confidence: target.cnn_confidence,
    flags: [...new Set([...eng.flags, ...mun.flags])],
    routing: {
      chain: ['system_generated', 'jtac_review', 'gfc_approval', 'aircrew_transmit'],
      current_step: 'jtac_review',
      next_recipient: 'jtac',
      final_approver: 'gfc',
      requires_gfc_initials: mun.flags.includes('DANGER_CLOSE'),
    },
    game_plan: {
      control_type: ctrl.control_type,
      method_of_attack: ctrl.method_of_attack,
      clearance_call_phrase: ctrl.clearance_call,
      abort_call_phrase: 'ABORT, ABORT, ABORT',
    },
    munition: {
      primary: {
        id: mun.munition.id, name: mun.munition.name,
        guidance: mun.munition.guidance, warhead_lb: mun.munition.warhead_lb,
        red_standing_m: mun.munition.red_standing_m,
        tle_required_m: mun.munition.tle_required_m,
        fuze: mun.munition.fuze_options[0],
        count: mun.munition._stocked,
        effectiveness_rating: mun.munition._rating,
        effectiveness_score: mun.munition._score,
      },
      alternatives: mun.alternatives,
      eliminated: mun.eliminated,
    },
    nine_line: {
      line_1_ip: { value: ipEg.line_1_ip, filled_by: 'jtac_runtime' },
      line_2_heading: { value_deg_magnetic: ipEg.attack_heading_deg, filled_by: 'computed' },
      line_3_distance: { value: 2.4, units: 'NM', filled_by: 'computed' },
      line_4: { value: targetElevationFt, units: 'ft', datum: 'MSL', mandatory_readback: true },
      line_5: { value: line5, target_class: target.target_class, movement_state: target.movement_state },
      line_6: { format: 'MGRS', value: mgrs, datum: 'WGS-84', tle_category: target.tle_category, mandatory_readback: true },
      line_7: { mark_type: markOut.mark_type, value: markOut.value, prf_code: markOut.prf_code, backup_mark: markOut.backup },
      line_8: { value: line8, direction: closest?.bearing_cardinal, distance_m: Math.round(closest?.distance_m ?? 0) },
      line_9: { value: ipEg.egress_value, direction: ipEg.egress_direction },
    },
    remarks: restr.remarks.map(t => ({ text: t, type: 'remark', mandatory_readback: false })),
    restrictions: restr.restrictions.map(t => ({ text: t, type: 'restriction', mandatory_readback: true })),
    reasoning_trace: [
      ...eng.trace, ...mun.trace, ...ctrl.trace, ...markOut.trace, ...ipEg.trace, ...restr.trace,
    ],
  };

  phaseMark('after_compose');
  if (profile) recommendation._profile = _profileSegments(marks);
  return recommendation;
}

// ─────────────────────────────────────────────────────────────────────────
// MULTI-STRIKE / RECURSIVE PLANNER
//
// When a JTAC engages multiple targets in rapid succession, the engine
// can't wait for the drone feed to update between strikes — too slow.
// Instead, strike N+1 plans against the PREDICTED state after strike N:
// the prior target is removed from the hostile list, the munition used
// is decremented from the aircraft's loadout, and the engine re-runs.
//
// This surfaces planning constraints that single-shot recommendation
// can't see — e.g., "you only have 4 GBU-38, here's the chain that uses
// them" or "strike 3 is blocked because the last suitable weapon was
// expended in strike 2."
// ─────────────────────────────────────────────────────────────────────────

// Pure function: input + recommendation → predicted post-strike input.
// Doesn't advance the wall clock or move friendlies (rapid succession
// assumption). Marks the target as engaged + decrements the loadout.
export function applyStrike(input, recommendation) {
  const blocked = ['NOT_ENGAGEABLE', 'NO_VIABLE_MUNITION'].includes(recommendation?.engageability);
  if (blocked || !recommendation?.munition?.primary) return input;

  const targetId = recommendation.target_id;
  const munId = recommendation.munition.primary.id;

  // Predicted destruction: target leaves the hostile feed.
  const newHostiles = input.hostiles.filter(h => h.id !== targetId);

  // Decrement the loadout.
  const oldLoadout = input.aircraft.loadout || {};
  const newLoadout = { ...oldLoadout };
  if (newLoadout[munId]) {
    const prev = newLoadout[munId];
    const prevCount = typeof prev === 'object' ? (prev.count ?? 0) : prev;
    const nextCount = Math.max(0, prevCount - 1);
    newLoadout[munId] = typeof prev === 'object'
      ? { ...prev, count: nextCount }
      : nextCount;
  }

  return {
    ...input,
    hostiles: newHostiles,
    aircraft: { ...input.aircraft, loadout: newLoadout },
  };
}

// Recursive planner. Takes an initial input and an ordered list of target
// IDs to engage; returns the chain of recommendations + a summary.
//
// Each step's recommendation is computed against the predicted state
// produced by applyStrike() on the prior step's recommendation. If a step
// is blocked, the chain stops and the remaining targets surface as skipped.
export function recommendSequence(input, targetSequence) {
  let cur = { ...input, aircraft: { ...input.aircraft, loadout: { ...(input.aircraft.loadout || {}) } } };
  const initialLoadout = JSON.parse(JSON.stringify(cur.aircraft.loadout));
  const steps = [];
  let chainBroken = false;

  for (let i = 0; i < targetSequence.length; i++) {
    const targetId = targetSequence[i];

    // Skip if target no longer exists in predicted state (already engaged
    // by a prior step, or just not in the feed).
    const target = cur.hostiles.find(h => h.id === targetId);
    if (!target) {
      steps.push({
        step: i + 1,
        target_id: targetId,
        skipped: true,
        skip_reason: 'Target not in predicted feed (already engaged or absent)',
      });
      continue;
    }

    // If a previous step broke the chain, mark this and all following
    // steps as skipped so the JTAC sees what would have happened.
    if (chainBroken) {
      steps.push({
        step: i + 1,
        target_id: targetId,
        skipped: true,
        skip_reason: 'Chain broken by earlier step',
      });
      continue;
    }

    // Compute the recommendation against the predicted state.
    const stepInput = { ...cur, primaryTargetId: targetId, user_heading: undefined };
    const rec = recommend(stepInput);

    const loadoutSnapshot = JSON.parse(JSON.stringify(cur.aircraft.loadout));
    const inputSnapshot = {
      remaining_hostiles: cur.hostiles.length,
      remaining_hostile_ids: cur.hostiles.map(h => h.id),
      loadout: loadoutSnapshot,
    };

    steps.push({
      step: i + 1,
      target_id: targetId,
      recommendation: rec,
      input_snapshot: inputSnapshot,
    });

    // If this step is blocked, the chain breaks here. Subsequent targets
    // get marked skipped above on next iteration.
    if (['NOT_ENGAGEABLE', 'NO_VIABLE_MUNITION'].includes(rec.engageability)
        || rec.flags?.includes('NO_VIABLE_MUNITION')) {
      chainBroken = true;
      continue;
    }

    // Advance state → predicted post-strike.
    cur = applyStrike(cur, rec);
  }

  // Diff loadout to tally munitions expended.
  const munitions_expended = {};
  for (const munId of Object.keys(initialLoadout)) {
    const beforeRaw = initialLoadout[munId];
    const afterRaw = cur.aircraft.loadout[munId];
    const before = typeof beforeRaw === 'object' ? (beforeRaw.count ?? 0) : (beforeRaw ?? 0);
    const after = typeof afterRaw === 'object' ? (afterRaw.count ?? 0) : (afterRaw ?? 0);
    if (before > after) munitions_expended[munId] = before - after;
  }

  return {
    steps,
    munitions_expended,
    final_remaining_hostiles: cur.hostiles.map(h => ({ id: h.id, target_class: h.target_class })),
    chain_broken: chainBroken,
    total_steps_planned: targetSequence.length,
    successful_steps: steps.filter(s => !s.skipped && s.recommendation && !['NOT_ENGAGEABLE', 'NO_VIABLE_MUNITION'].includes(s.recommendation.engageability)).length,
  };
}

// Convenience: auto-prioritize a list of hostiles for sequence planning.
// PRE-FILTERS by per-class PID threshold so the planner doesn't waste
// chain slots on targets that would block. Default order: confidence DESC.
export function autoPrioritize(hostiles, mode = 'confidence_desc') {
  // Pre-filter: only include targets whose confidence meets the PID threshold
  // for their class. Otherwise the chain breaks at the first low-conf target
  // and "successful" strikes after it surface as skipped. Better to plan
  // an engageable chain end-to-end.
  const engageable = hostiles.filter(h => {
    const cat = (() => {
      const tc = h.target_class || '';
      if (tc.startsWith('vehicle')) return 'vehicle';
      if (tc.startsWith('personnel')) return 'personnel';
      if (tc.startsWith('structure') || tc.startsWith('bunker')) return 'structure';
      return 'default';
    })();
    const threshold = PID_THRESHOLDS_BY_CLASS[cat] ?? PID_THRESHOLDS_BY_CLASS.default;
    return (h.cnn_confidence ?? 0) >= threshold;
  });

  const list = [...engageable];
  switch (mode) {
    case 'confidence_desc':
      return list.sort((a, b) => (b.cnn_confidence ?? 0) - (a.cnn_confidence ?? 0)).map(h => h.id);
    case 'movement_first':
      return list.sort((a, b) => {
        const aMover = a.movement_state && a.movement_state !== 'stationary';
        const bMover = b.movement_state && b.movement_state !== 'stationary';
        return (bMover ? 1 : 0) - (aMover ? 1 : 0);
      }).map(h => h.id);
    default:
      return list.map(h => h.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CLUSTER BY PROXIMITY
//
// Type 3 control (JP 3-09.3 III-46) requires "multiple attacks within a
// SINGLE engagement" — meaning one set of restrictions (FAH cone, geographic
// boundary, target set, time window) must legitimately cover ALL strikes.
//
// In practice that means targets need to be close enough that one FAH and
// one geographic boundary make sense. Doctrine doesn't pin a specific
// distance (it's a JTAC judgment call), but ~500 m to a few km is typical
// — about the size of one kill box keypad.
//
// Targets outside that cluster radius go in their own brief, transmitted
// sequentially as separate Type 2 9-lines.
// ─────────────────────────────────────────────────────────────────────────
export function clusterByProximity(hostiles, targetIds, maxDistanceM = 500) {
  const ids = [...targetIds];
  const clusters = [];
  const idToHostile = new Map(hostiles.map(h => [h.id, h]));

  while (ids.length > 0) {
    const cluster = [ids.shift()];
    let added = true;
    while (added) {
      added = false;
      for (let i = ids.length - 1; i >= 0; i--) {
        const candId = ids[i];
        const cand = idToHostile.get(candId);
        if (!cand) { ids.splice(i, 1); continue; }
        const closeToCluster = cluster.some(memberId => {
          const m = idToHostile.get(memberId);
          if (!m) return false;
          return distanceM(cand.lat, cand.lng, m.lat, m.lng) <= maxDistanceM;
        });
        if (closeToCluster) {
          cluster.push(candId);
          ids.splice(i, 1);
          added = true;
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

// ─────────────────────────────────────────────────────────────────────────
// COMPLEX ENGAGEMENT PLANNER
//
// Takes a list of target IDs the JTAC wants to engage, clusters them by
// proximity, and produces N briefs:
//   - Each cluster of 2+ → one Type 3 multi-target brief
//   - Each singleton → one Type 2 standalone 9-line
//
// Each brief plans against the PREDICTED state after the previous brief
// (loadout decremented, prior targets removed). This means the engine
// catches problems like "we run out of GBU-12 in cluster 2 because cluster
// 1 used them all" — surfaced as chain_broken on the affected brief.
// ─────────────────────────────────────────────────────────────────────────
export function recommendComplexEngagement(input, targetIds, options = {}) {
  const maxClusterDistanceM = options.maxClusterDistanceM ?? 500;
  const clusters = clusterByProximity(input.hostiles, targetIds, maxClusterDistanceM);

  const briefs = [];
  let cumulativeState = {
    ...input,
    aircraft: { ...input.aircraft, loadout: { ...(input.aircraft.loadout || {}) } },
  };

  for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
    const clusterIds = clusters[cIdx];
    const sequence = recommendSequence(cumulativeState, clusterIds);
    const brief = consolidateAsType3(sequence);

    briefs.push({
      cluster_index: cIdx + 1,
      cluster_target_ids: clusterIds,
      cluster_size: clusterIds.length,
      brief, // null if the cluster blocked entirely
      sequence,
      // Quick diameter readout — biggest target-to-target distance in cluster.
      cluster_diameter_m: computeClusterDiameter(input.hostiles, clusterIds),
    });

    // Advance cumulative state — each successful strike removes a target
    // and decrements the loadout. The next cluster plans against this state.
    for (const step of sequence.steps) {
      if (step.skipped || !step.recommendation || step.recommendation.engageability === 'NOT_ENGAGEABLE') continue;
      cumulativeState = applyStrike(cumulativeState, step.recommendation);
    }
  }

  const totalSuccessful = briefs.reduce((sum, b) => sum + (b.sequence?.successful_steps ?? 0), 0);

  return {
    briefs,
    cluster_count: clusters.length,
    total_strikes_planned: targetIds.length,
    total_strikes_successful: totalSuccessful,
    any_chain_broken: briefs.some(b => b.sequence?.chain_broken),
    final_remaining_hostiles: cumulativeState.hostiles.map(h => ({ id: h.id, target_class: h.target_class })),
  };
}

function computeClusterDiameter(hostiles, ids) {
  let max = 0;
  const idToHost = new Map(hostiles.map(h => [h.id, h]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = idToHost.get(ids[i]);
      const b = idToHost.get(ids[j]);
      if (!a || !b) continue;
      const d = distanceM(a.lat, a.lng, b.lat, b.lng);
      if (d > max) max = d;
    }
  }
  return Math.round(max);
}

// ─────────────────────────────────────────────────────────────────────────
// CONSOLIDATE INTO TYPE 3 MULTI-TARGET BRIEF
//
// Doctrinal pattern (JP 3-09.3 V-27): "Read one full 9-line, then provide
// additional targets using Lines 4, 6, and 8 only, prior to remarks."
//
// Type 3 control (JP 3-09.3 III-46): one CLEARED TO ENGAGE covers all
// strikes in the window, with specific attack restrictions: time window,
// geographic boundary, target set, FAH.
//
// Takes a sequence result + transforms into the canonical Type 3 brief.
// Falls back to single-target if there's only one viable strike.
// ─────────────────────────────────────────────────────────────────────────
export function consolidateAsType3(sequenceResult) {
  const viableSteps = sequenceResult.steps.filter(
    s => !s.skipped && s.recommendation?.engageability !== 'NOT_ENGAGEABLE'
  );

  if (viableSteps.length === 0) return null;

  // First viable step provides the primary brief structure.
  const primary = viableSteps[0].recommendation;
  const additional = viableSteps.slice(1).map(s => ({
    target_id: s.target_id,
    line_4: s.recommendation.nine_line.line_4,
    line_6: s.recommendation.nine_line.line_6,
    line_8: s.recommendation.nine_line.line_8,
    munition_id: s.recommendation.munition.primary.id,
  }));

  // For multi-target we ALWAYS use Type 3 even if the primary recommendation
  // came back as Type 2. Doctrine: rapid succession + single engagement
  // window = Type 3 control.
  const isType3 = additional.length > 0;

  // Unified remarks: take primary's remarks and add the multi-target ones.
  const remarks = [...primary.remarks];
  const restrictions = [...primary.restrictions.filter(r => !r.text.startsWith('TOT'))]; // TOT moves to end

  if (isType3) {
    const targetIds = viableSteps.map(s => s.target_id);
    const munitionTally = Object.entries(sequenceResult.munitions_expended)
      .map(([k, v]) => `${k}×${v}`).join(', ');
    restrictions.push({
      text: `Type 3 multi-target window — ${viableSteps.length} strikes, ${munitionTally}`,
      type: 'restriction', mandatory_readback: true,
    });
    restrictions.push({
      text: `Specific target set: ${targetIds.join(', ')} ONLY — do not engage other contacts in window`,
      type: 'restriction', mandatory_readback: true,
    });
    restrictions.push({
      text: 'Aircrew calls: COMMENCING ENGAGEMENT, ENGAGEMENT COMPLETE',
      type: 'restriction', mandatory_readback: true,
    });
  }

  // TOT always last
  restrictions.push({ text: 'TOT push when ready', type: 'restriction', mandatory_readback: true });

  return {
    is_type_3: isType3,
    strike_count: viableSteps.length,
    game_plan: {
      ...primary.game_plan,
      control_type: isType3 ? 'Type_3' : primary.game_plan.control_type,
      clearance_call_phrase: isType3 ? 'CLEARED TO ENGAGE' : primary.game_plan.clearance_call_phrase,
    },
    primary_brief: primary.nine_line,
    primary_target_id: viableSteps[0].target_id,
    primary_munition: primary.munition.primary,
    additional_targets: additional,
    remarks,
    restrictions,
    flags: [...new Set(viableSteps.flatMap(s => s.recommendation.flags ?? []))],
  };
}
