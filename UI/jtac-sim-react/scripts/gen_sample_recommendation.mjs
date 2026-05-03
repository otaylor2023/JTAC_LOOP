/**
 * Writes JTAC_LOOP/data/sample_recommendation.json — one recommend() output
 * for demo / Jetson wire format. Rehomes hostile/friendly/self coords to a
 * configurable AO center (default: primary hostile at 26.709723°N, -80.064163°W).
 *
 *   node scripts/gen_sample_recommendation.mjs
 *   node scripts/gen_sample_recommendation.mjs 26.71 -80.06
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { recommend } from '../src/engine/decisionTree.js';
import { HOSTILES, FRIENDLIES, SELF, AIRCRAFT_ON_STATION, WEATHER, ROE } from '../src/data/units.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REF_PRIMARY_LAT = 31.4815;
const REF_PRIMARY_LNG = 64.272;

const DEFAULT_AO_LAT = 26.709723;
const DEFAULT_AO_LNG = -80.064163;

const aoLat = parseFloat(process.argv[2], 10) || DEFAULT_AO_LAT;
const aoLng = parseFloat(process.argv[3], 10) || DEFAULT_AO_LNG;
const dLat = aoLat - REF_PRIMARY_LAT;
const dLng = aoLng - REF_PRIMARY_LNG;

function shiftPt(p) {
  return { ...p, lat: p.lat + dLat, lng: p.lng + dLng };
}

const hostiles = HOSTILES.map(shiftPt);
const friendlies = FRIENDLIES.map(shiftPt);
const self = shiftPt(SELF);

const primaryId = hostiles.find((h) => h.primary)?.id ?? hostiles[0].id;

const rec = recommend({
  hostiles,
  friendlies,
  self,
  primaryTargetId: primaryId,
  aircraft: AIRCRAFT_ON_STATION,
  weather: WEATHER,
  roe: ROE,
  time_of_day: 'day',
});

const outPath = path.resolve(__dirname, '../../../data/sample_recommendation.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(rec, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath);
console.log('AO center (primary hostile):', aoLat, aoLng);
