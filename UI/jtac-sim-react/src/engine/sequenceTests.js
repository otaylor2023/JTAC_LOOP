// Runnable engine tests — exercises the recursive multi-strike planner
// against doctrinally-meaningful scenarios. Run with:
//   node src/engine/sequenceTests.js
//
// Each test asserts what the planner SHOULD do for that scenario. If any
// assertion fails, the script exits non-zero so it can be wired into CI.

import {
  recommend, recommendSequence, applyStrike, autoPrioritize,
  consolidateAsType3, clusterByProximity, recommendComplexEngagement,
} from './decisionTree.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else      { failed++; failures.push({ label, detail }); console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

function header(name) { console.log(`\n── ${name} ` + '─'.repeat(Math.max(0, 70 - name.length))); }

// ── Shared mock pre-mission data ───────────────────────────────────────
const PERMISSIVE_ROE = {
  approved_categories: [
    'vehicle_wheeled_soft', 'vehicle_wheeled_soft_moving',
    'vehicle_tracked_light', 'vehicle_tracked_armor',
    'personnel_open', 'personnel_concentrated', 'personnel_dug_in',
    'structure_soft', 'structure_hardened',
  ],
  prohibited_munitions: [], cluster_prohibited: true,
};
const CLEAR_WEATHER = { cloud_ceiling_ft: 12000, visibility_m: 10000, wind_kts: 8, gps_jamming: false };

function mkHostile(id, lat, lng, opts = {}) {
  return {
    id, lat, lng,
    description: opts.description || `${opts.target_class || 'vehicle_wheeled_soft'} target`,
    target_class: opts.target_class || 'vehicle_wheeled_soft',
    movement_state: opts.movement_state || 'stationary',
    is_movable: opts.is_movable ?? true,
    cnn_confidence: opts.cnn_confidence ?? 0.92,
    tle_category: opts.tle_category || 'CAT_III',
    elevation_m: 380,
    in_structure: false,
    primary: opts.primary ?? false,
  };
}
function mkFriendly(id, lat, lng, opts = {}) {
  return { id, lat, lng, exposure: opts.exposure || 'dug-in', axis_orientation_deg: opts.axis ?? 45 };
}
function mkAircraft(loadout, platform = 'F-16') {
  return { platform, loadout: Object.fromEntries(Object.entries(loadout).map(([k, v]) => [k, { count: v }])), playtime_min: 45, nvg_capable: true };
}

const SELF = { id: 'JTAC LOOP', lat: 31.4778, lng: 64.2700 };

// ═══════════════════════════════════════════════════════════════════════
// TEST 1 — Single strike, baseline
// ═══════════════════════════════════════════════════════════════════════
header('TEST 1 — Single strike on a stationary technical');

(() => {
  const hostiles = [mkHostile('TGT.1', 31.4815, 64.2720)];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4, 'AGM-65D': 2, 'GAU-8': 1100 }, 'A-10');

  const rec = recommend({
    hostiles, friendlies, self: SELF, primaryTargetId: 'TGT.1',
    aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day',
  });

  assert('engageability is ENGAGEABLE', rec.engageability === 'ENGAGEABLE', `got ${rec.engageability}`);
  assert('munition selected (truthy)', !!rec.munition?.primary, 'no primary munition');
  assert('control type is Type_2 (drone-fed default)', rec.game_plan.control_type === 'Type_2');
  // Movement gate (Collen CF-1.3) should bias to laser/IIR; either GBU-12 or AGM-65D
  // is doctrinally correct for this scenario. The point is JDAMs are NOT picked
  // (CAT-III TLE blocks them) and ballistic 30mm is tiebroken below.
  assert('laser/IIR weapon ranked first (movement gate bonus)',
    ['GBU-12', 'AGM-65D', 'AGM-65L'].includes(rec.munition.primary.id),
    `got ${rec.munition.primary.id}`);
  assert('JDAM not picked (CAT-III TLE blocks it)',
    !['GBU-38', 'GBU-31', 'GBU-32', 'GBU-39'].includes(rec.munition.primary.id));
  assert('reasoning trace has 6 tree entries', rec.reasoning_trace.length >= 6);
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 2 — applyStrike removes target + decrements loadout
// ═══════════════════════════════════════════════════════════════════════
header('TEST 2 — applyStrike → predicted post-strike state');

(() => {
  const hostiles = [mkHostile('TGT.1', 31.4815, 64.2720), mkHostile('TGT.2', 31.4821, 64.2692)];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4, 'GAU-8': 1100 }, 'A-10');
  const input = { hostiles, friendlies, self: SELF, primaryTargetId: 'TGT.1', aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' };

  const rec = recommend(input);
  const nextState = applyStrike(input, rec);

  assert('TGT.1 removed from hostiles', !nextState.hostiles.find(h => h.id === 'TGT.1'));
  assert('TGT.2 still in hostiles', !!nextState.hostiles.find(h => h.id === 'TGT.2'));
  assert('GBU-12 count decremented 4 → 3', nextState.aircraft.loadout['GBU-12'].count === 3, `got ${nextState.aircraft.loadout['GBU-12'].count}`);
  assert('original input not mutated', input.aircraft.loadout['GBU-12'].count === 4);
  assert('original hostiles not mutated', input.hostiles.length === 2);
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 3 — Three-target chain (engine recurses correctly)
// ═══════════════════════════════════════════════════════════════════════
header('TEST 3 — Three-target chain, ample loadout');

(() => {
  const hostiles = [
    mkHostile('TGT.1', 31.4815, 64.2720, { cnn_confidence: 0.95 }),
    mkHostile('TGT.2', 31.4821, 64.2692, { cnn_confidence: 0.91 }),
    mkHostile('TGT.3', 31.4828, 64.2671, { cnn_confidence: 0.88 }),
  ];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4, 'GAU-8': 1100 }, 'A-10');
  const order = autoPrioritize(hostiles, 'confidence_desc');

  assert('autoPrioritize returns confidence-desc order',
    JSON.stringify(order) === JSON.stringify(['TGT.1', 'TGT.2', 'TGT.3']),
    `got ${JSON.stringify(order)}`);

  const seq = recommendSequence(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    order,
  );

  assert('sequence has 3 steps', seq.steps.length === 3);
  assert('all 3 successful', seq.successful_steps === 3, `got ${seq.successful_steps}`);
  assert('chain not broken', !seq.chain_broken);
  assert('GBU-12 expended ×3', seq.munitions_expended['GBU-12'] === 3, `got ${seq.munitions_expended['GBU-12']}`);
  assert('no hostiles remaining (predicted)', seq.final_remaining_hostiles.length === 0);
  assert('step 2 input snapshot has 2 hostiles', seq.steps[1].input_snapshot.remaining_hostiles === 2);
  assert('step 3 input snapshot has 1 hostile',  seq.steps[2].input_snapshot.remaining_hostiles === 1);
  assert('step 2 input snapshot loadout reflects 1 GBU-12 used',
    seq.steps[1].input_snapshot.loadout['GBU-12'].count === 3,
    `got ${seq.steps[1].input_snapshot.loadout['GBU-12'].count}`);
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 4 — Loadout exhaustion blocks the chain
// ═══════════════════════════════════════════════════════════════════════
header('TEST 4 — Loadout exhaustion → chain breaks at step 3');

(() => {
  const hostiles = [
    mkHostile('TGT.1', 31.4815, 64.2720),
    mkHostile('TGT.2', 31.4821, 64.2692),
    mkHostile('TGT.3', 31.4828, 64.2671),
  ];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  // Only 2 GBU-12 — chain should break at step 3 (no GAU-8 on this F-16; it's not the carrier)
  const aircraft = mkAircraft({ 'GBU-12': 2 }, 'A-10');

  const seq = recommendSequence(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    ['TGT.1', 'TGT.2', 'TGT.3'],
  );

  assert('step 1 succeeded', seq.steps[0].recommendation?.engageability === 'ENGAGEABLE');
  assert('step 2 succeeded', seq.steps[1].recommendation?.engageability === 'ENGAGEABLE');
  assert('step 3 blocked or skipped',
    seq.steps[2].recommendation?.engageability === 'NOT_ENGAGEABLE' || seq.steps[2].skipped,
    `got engageability=${seq.steps[2].recommendation?.engageability} skipped=${seq.steps[2].skipped}`);
  assert('chain marked broken', seq.chain_broken);
  assert('successful_steps == 2', seq.successful_steps === 2, `got ${seq.successful_steps}`);
  assert('GBU-12 expended ×2 (not 3)', seq.munitions_expended['GBU-12'] === 2);
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 5 — User-customizable strike count (only top N)
// ═══════════════════════════════════════════════════════════════════════
header('TEST 5 — User picks N=2 from 3 available targets');

(() => {
  const hostiles = [
    mkHostile('TGT.A', 31.4815, 64.2720, { cnn_confidence: 0.95 }),
    mkHostile('TGT.B', 31.4821, 64.2692, { cnn_confidence: 0.91 }),
    mkHostile('TGT.C', 31.4828, 64.2671, { cnn_confidence: 0.88 }),
  ];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4 }, 'A-10');

  const all = autoPrioritize(hostiles, 'confidence_desc');
  const topTwo = all.slice(0, 2);

  const seq = recommendSequence(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    topTwo,
  );

  assert('only 2 steps planned', seq.total_steps_planned === 2);
  assert('both successful', seq.successful_steps === 2);
  assert('TGT.C not in chain (still in remaining)',
    !!seq.final_remaining_hostiles.find(h => h.id === 'TGT.C'));
  assert('TGT.A engaged first (highest confidence)', seq.steps[0].target_id === 'TGT.A');
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 6 — Type 3 consolidation (doctrinally-correct multi-target brief)
// ═══════════════════════════════════════════════════════════════════════
header('TEST 6 — consolidateAsType3 produces JP 3-09.3 V-27 multi-target format');

(() => {
  const hostiles = [
    mkHostile('TGT.1', 31.4815, 64.2720, { cnn_confidence: 0.95 }),
    mkHostile('TGT.2', 31.4821, 64.2692, { cnn_confidence: 0.91 }),
    mkHostile('TGT.3', 31.4828, 64.2671, { cnn_confidence: 0.88 }),
  ];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4 }, 'A-10');

  const seq = recommendSequence(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    ['TGT.1', 'TGT.2', 'TGT.3'],
  );
  const brief = consolidateAsType3(seq);

  assert('brief is non-null', !!brief);
  assert('strike_count == 3', brief.strike_count === 3, `got ${brief.strike_count}`);
  assert('marked is_type_3', brief.is_type_3);
  assert('control_type == Type_3', brief.game_plan.control_type === 'Type_3');
  assert('clearance_call == CLEARED TO ENGAGE', brief.game_plan.clearance_call_phrase === 'CLEARED TO ENGAGE');
  assert('primary_brief has all 9 lines', !!brief.primary_brief.line_4 && !!brief.primary_brief.line_6 && !!brief.primary_brief.line_8);
  assert('additional_targets has 2 entries (Lines 4,6,8 only)', brief.additional_targets.length === 2);
  assert('first additional has only line_4, line_6, line_8',
    !!brief.additional_targets[0].line_4 && !!brief.additional_targets[0].line_6 && !!brief.additional_targets[0].line_8);
  assert('restrictions include target set whitelist',
    brief.restrictions.some(r => r.text.includes('Specific target set')));
  assert('restrictions end with TOT (last per V-32)',
    brief.restrictions[brief.restrictions.length - 1].text.startsWith('TOT'));
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 7 — Single strike does NOT get Type 3 consolidation
// ═══════════════════════════════════════════════════════════════════════
header('TEST 7 — N=1 stays Type 2 (no Type 3 promotion)');

(() => {
  const hostiles = [mkHostile('TGT.1', 31.4815, 64.2720)];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4 }, 'A-10');

  const seq = recommendSequence(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    ['TGT.1'],
  );
  const brief = consolidateAsType3(seq);

  assert('brief produced', !!brief);
  assert('strike_count == 1', brief.strike_count === 1);
  assert('NOT type 3 (single target)', !brief.is_type_3);
  assert('additional_targets empty', brief.additional_targets.length === 0);
  assert('control_type stays Type_2 (not promoted)', brief.game_plan.control_type === 'Type_2');
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 8 — Low PID confidence blocks the chain at step 1
// ═══════════════════════════════════════════════════════════════════════
header('TEST 8 — Low PID confidence → step 1 blocks, chain breaks immediately');

(() => {
  const hostiles = [
    mkHostile('TGT.UNK', 31.4815, 64.2720, { cnn_confidence: 0.55 }),
    mkHostile('TGT.OK',  31.4821, 64.2692, { cnn_confidence: 0.93 }),
  ];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4 }, 'A-10');

  const seq = recommendSequence(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    ['TGT.UNK', 'TGT.OK'],
  );

  assert('step 1 NOT_ENGAGEABLE', seq.steps[0].recommendation?.engageability === 'NOT_ENGAGEABLE');
  assert('step 1 has INSUFFICIENT_PID flag', seq.steps[0].recommendation?.flags?.includes('INSUFFICIENT_PID'));
  assert('chain marked broken', seq.chain_broken);
  assert('step 2 surfaces as skipped (chain broken)',
    seq.steps[1].skipped === true,
    `got skipped=${seq.steps[1].skipped} engageability=${seq.steps[1].recommendation?.engageability}`);
  assert('successful_steps == 0', seq.successful_steps === 0);
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 9 — Cluster by proximity (3 close + 1 distant)
// ═══════════════════════════════════════════════════════════════════════
header('TEST 9 — clusterByProximity: 3 close (~150m) + 1 distant (~3km)');

(() => {
  // Three hostiles at lat 31.4815..31.4823, all within ~150 m.
  // One hostile at 31.5100, ~3 km north — outside any reasonable cluster.
  const hostiles = [
    mkHostile('A', 31.4815, 64.2720),
    mkHostile('B', 31.4818, 64.2723),
    mkHostile('C', 31.4823, 64.2717),
    mkHostile('FAR', 31.5100, 64.2720),
  ];

  const clusters = clusterByProximity(hostiles, ['A', 'B', 'C', 'FAR'], 500);

  assert('produces 2 clusters', clusters.length === 2, `got ${clusters.length}`);
  const closeCluster = clusters.find(c => c.includes('A'));
  const farCluster   = clusters.find(c => c.includes('FAR'));
  assert('close cluster has A, B, C', closeCluster?.length === 3 && ['A','B','C'].every(id => closeCluster.includes(id)));
  assert('FAR cluster is a singleton', farCluster?.length === 1);
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 10 — Complex engagement: 1 Type 3 brief + 1 Type 2 brief
// ═══════════════════════════════════════════════════════════════════════
header('TEST 10 — recommendComplexEngagement: 3 close + 1 distant → 2 briefs');

(() => {
  const hostiles = [
    mkHostile('A', 31.4815, 64.2720, { cnn_confidence: 0.95 }),
    mkHostile('B', 31.4818, 64.2723, { cnn_confidence: 0.91 }),
    mkHostile('C', 31.4823, 64.2717, { cnn_confidence: 0.88 }),
    mkHostile('FAR', 31.5100, 64.2720, { cnn_confidence: 0.90 }),
  ];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  const aircraft = mkAircraft({ 'GBU-12': 4, 'GAU-8': 1100 }, 'A-10');

  const plan = recommendComplexEngagement(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    ['A', 'B', 'C', 'FAR'],
    { maxClusterDistanceM: 500 },
  );

  assert('2 briefs produced', plan.briefs.length === 2, `got ${plan.briefs.length}`);
  assert('cluster_count == 2', plan.cluster_count === 2);
  assert('total_strikes_planned == 4', plan.total_strikes_planned === 4);
  assert('total_strikes_successful == 4', plan.total_strikes_successful === 4);

  const closeBrief = plan.briefs.find(b => b.cluster_size === 3);
  const farBrief   = plan.briefs.find(b => b.cluster_size === 1);

  assert('close-brief is Type 3', closeBrief?.brief?.is_type_3 === true);
  assert('close-brief CLEARED TO ENGAGE', closeBrief?.brief?.game_plan.clearance_call_phrase === 'CLEARED TO ENGAGE');
  assert('close-brief has 2 additional targets (3 total)', closeBrief?.brief?.additional_targets.length === 2);

  assert('far-brief is Type 2 (singleton)', farBrief?.brief?.is_type_3 === false);
  assert('far-brief CLEARED HOT', farBrief?.brief?.game_plan.clearance_call_phrase === 'CLEARED HOT');
  assert('far-brief has 0 additional targets', farBrief?.brief?.additional_targets.length === 0);
})();

// ═══════════════════════════════════════════════════════════════════════
// TEST 11 — Loadout exhaustion across clusters
// ═══════════════════════════════════════════════════════════════════════
header('TEST 11 — Cluster 1 uses GBU-12; cluster 2 plans against depleted state');

(() => {
  const hostiles = [
    mkHostile('A', 31.4815, 64.2720),
    mkHostile('B', 31.4818, 64.2723),
    mkHostile('FAR', 31.5100, 64.2720),
  ];
  const friendlies = [mkFriendly('F.1', 31.4804, 64.2743)];
  // Only 2 GBU-12 — cluster 1 will use both, leaving FAR with only GAU-8.
  const aircraft = mkAircraft({ 'GBU-12': 2, 'GAU-8': 1100 }, 'A-10');

  const plan = recommendComplexEngagement(
    { hostiles, friendlies, self: SELF, aircraft, weather: CLEAR_WEATHER, roe: PERMISSIVE_ROE, time_of_day: 'day' },
    ['A', 'B', 'FAR'],
    { maxClusterDistanceM: 500 },
  );

  assert('produces 2 briefs', plan.briefs.length === 2);
  const cluster1 = plan.briefs.find(b => b.cluster_size === 2);
  const cluster2 = plan.briefs.find(b => b.cluster_size === 1);

  // FAR brief should plan against state where GBU-12 count is 0 — engine
  // should still find a viable munition (GAU-8 strafe).
  assert('cluster 2 still produces a brief', !!cluster2?.brief);
  assert('cluster 2 uses something other than GBU-12',
    cluster2?.brief?.primary_munition?.id !== 'GBU-12',
    `got ${cluster2?.brief?.primary_munition?.id}`);
})();

// ═══════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(72));
console.log(`RESULT: ${passed} passed · ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f.label}${f.detail ? ' — ' + f.detail : ''}`));
  process.exit(1);
}
console.log('═'.repeat(72));
