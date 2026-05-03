#!/usr/bin/env node
/**
 * Decision-tree throughput + phase latency (Node / V8).
 * Run from repo:  cd UI/jtac-sim-react && node scripts/benchmark-decision-tree.mjs
 */

import { performance } from 'node:perf_hooks';
import { recommend, recommendSequence, autoPrioritize } from '../src/engine/decisionTree.js';
import { HOSTILES, FRIENDLIES, SELF, AIRCRAFT_ON_STATION, WEATHER, ROE } from '../src/data/units.js';

globalThis.performance = performance;

function baseInput(primaryTargetId) {
  return {
    hostiles: HOSTILES,
    friendlies: FRIENDLIES,
    self: SELF,
    primaryTargetId,
    aircraft: AIRCRAFT_ON_STATION,
    weather: WEATHER,
    roe: ROE,
    time_of_day: 'day',
  };
}

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function summarizeMs(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    p50: pct(sorted, 50),
    p99: pct(sorted, 99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
  };
}

const WORKFLOW = `
JTAC_LOOP decision engine — execution workflow (single recommend call)
======================================================================
1. Resolve primary target from hostiles[] by id.
2. Geo: closest friendly to target (haversine + bearing) → standoff for RED / L8.
3. Tree 1 — Engageability: PID threshold, NSL, TLE, ROE, self-defense override branch.
4. Tree 2 — Munition: scan full MUNITIONS catalog (~24 rows): loadout, TLE, wx,
   effectiveness matrix; rank survivors (movement gate bonus).
5. Tree 3 — Control type: GPS / multi-target / dual-visual / default Type 2.
6. Tree 4 — Mark method: BOC/laser/IR/night branches.
7. Tree 5 — IP/egress: bearing from friendlies, placeholder IP label.
8. Tree 6 — Restrictions: parallel remark/restriction strings.
9. Compose structured nine_line + routing + traces.

Multi-strike (recommendSequence): for each target id, recommend on predicted
state; applyStrike removes hostile + decrements loadout; chain stops if blocked.

React UI (useAIRecommendation): useMemo runs recommend when inputs change;
optional initialDelayMs (default 1800) is cosmetic only — not engine time.
`;

console.log(WORKFLOW);

// --- Throughput: recommend(), no profiling ---
const THROUGHPUT = 50_000;
const primaryId = HOSTILES[0].id;
const input = baseInput(primaryId);
const wall = [];
for (let w = 0; w < 5; w++) {
  const t0 = performance.now();
  for (let i = 0; i < THROUGHPUT; i++) recommend(input);
  wall.push(performance.now() - t0);
}
const perCallUs = (wall.reduce((a, b) => a + b, 0) / wall.length / THROUGHPUT) * 1000;
console.log('Throughput (single-thread, same input)');
console.log(`  ${THROUGHPUT.toLocaleString()} calls × 5 batches`);
console.log(`  ~${perCallUs.toFixed(3)} µs / call mean  (~${(1_000_000 / perCallUs).toFixed(0)} calls/sec)`);
console.log('');

// --- Latency distribution: individual calls with profiling off ---
const LAT_N = 20_000;
const latSamples = [];
for (let i = 0; i < LAT_N; i++) {
  const t0 = performance.now();
  recommend(input);
  latSamples.push(performance.now() - t0);
}
const L = summarizeMs(latSamples);
console.log(`Latency sample  recommend()  n=${LAT_N}  (wall per call, incl. fn overhead)`);
console.log(`  min ${(L.min * 1000).toFixed(2)} µs  p50 ${(L.p50 * 1000).toFixed(2)} µs  p99 ${(L.p99 * 1000).toFixed(2)} µs  max ${(L.max * 1000).toFixed(2)} µs  mean ${(L.mean * 1000).toFixed(2)} µs`);
console.log('');

// --- Phase breakdown: averaged profile segments ---
const PROF_N = 5_000;
const segTotals = new Map();
let profileWallSum = 0;
for (let i = 0; i < PROF_N; i++) {
  const rec = recommend(input, { profile: true });
  profileWallSum += rec._profile.wall_ms;
  for (const s of rec._profile.segments) {
    segTotals.set(s.name, (segTotals.get(s.name) ?? 0) + s.ms);
  }
}
console.log(`Phase breakdown  (mean over ${PROF_N.toLocaleString()} profiled calls, V8)`);
console.log(`  profile wall (instrumented): ${((profileWallSum / PROF_N) * 1000).toFixed(2)} µs mean`);
const label = {
  after_resolve_target: 'resolve target + closest friendly',
  after_state_build: 'assemble state object',
  after_tree1: 'Tree 1 engageability',
  after_tree2: 'Tree 2 munition filter+rank',
  after_tree3: 'Tree 3 control type',
  after_tree4: 'Tree 4 mark method',
  after_tree5: 'Tree 5 IP/egress',
  after_tree6: 'Tree 6 restrictions',
  after_compose: 'compose nine_line object',
};
for (const [name, sum] of [...segTotals.entries()].sort((a, b) => b[1] - a[1])) {
  const meanUs = (sum / PROF_N) * 1000;
  const pctWall = (sum / profileWallSum) * 100;
  console.log(`  ${(meanUs).toFixed(2).padStart(8)} µs  ${pctWall.toFixed(1).padStart(5)}%  ${name}${label[name] ? ` — ${label[name]}` : ''}`);
}
console.log('');

// --- Sequence planner (wrapper calls recommend + applyStrike per step) ---
const seqIds = autoPrioritize(HOSTILES, 'confidence_desc');
const tSeq0 = performance.now();
const SEQ_IT = 2_000;
for (let i = 0; i < SEQ_IT; i++) {
  recommendSequence(baseInput(seqIds[0]), seqIds);
}
const seqMs = (performance.now() - tSeq0) / SEQ_IT;
const seq = recommendSequence(baseInput(seqIds[0]), seqIds);
console.log(`recommendSequence()  ${SEQ_IT} iterations  ~${(seqMs * 1000).toFixed(1)} µs / call mean  (3-target demo order)`);
console.log(`  demo chain: ${seqIds.length} ids  successful_steps=${seq.successful_steps}  chain_broken=${seq.chain_broken}`);
console.log('  (Later demo hostiles use personnel PID thresholds > their CNN scores, so Tree 1 often blocks step 2.)');

const oneId = [seqIds[0]];
const t1 = performance.now();
for (let i = 0; i < SEQ_IT; i++) recommendSequence(baseInput(oneId[0]), oneId);
const oneSeqMs = (performance.now() - t1) / SEQ_IT;
console.log(`recommendSequence()  ${SEQ_IT} iterations  ~${(oneSeqMs * 1000).toFixed(1)} µs / call mean  (1-target chain — planner overhead only)`);
console.log('');
