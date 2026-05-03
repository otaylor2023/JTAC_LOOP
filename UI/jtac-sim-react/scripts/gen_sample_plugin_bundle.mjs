/**
 * Writes JTAC_LOOP/jtac_edge/data/sample_plugin_targets_bundle.json — one envelope with
 * per-hostile attack options for the ATAK plugin (Jetson wire example).
 *
 * For each hostile: recommend() primary + recommend() with weapon_override
 * when munition.alternatives[0] exists (same semantics as React NineLineForm A/B).
 *
 *   node scripts/gen_sample_plugin_bundle.mjs
 *   node scripts/gen_sample_plugin_bundle.mjs 26.709723 -80.064163
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

function baseInput(primaryTargetId) {
  return {
    hostiles,
    friendlies,
    self,
    primaryTargetId,
    aircraft: AIRCRAFT_ON_STATION,
    weather: WEATHER,
    roe: ROE,
    time_of_day: 'day',
  };
}

const targets = hostiles.map((h) => {
  const input = baseInput(h.id);
  const primary = recommend(input);
  const options = [{ role: 'primary', recommendation: primary }];

  const altId = primary.munition?.alternatives?.[0]?.id;
  if (altId) {
    const alternate = recommend({ ...input, weapon_override: altId });
    options.push({ role: 'alternate', recommendation: alternate });
  }

  return {
    target_id: h.id,
    track: {
      lat: h.lat,
      lon: h.lng,
      callsign: h.type ?? h.id,
    },
    options,
  };
});

const bundle = {
  schema_version: 1,
  generated_at_utc: new Date().toISOString(),
  jtac_self_id: self.id,
  targets,
};

const outPath = path.resolve(__dirname, '../../../jtac_edge/data/sample_plugin_targets_bundle.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath);
console.log('targets:', targets.length, 'options per target:', targets.map((t) => t.options.length).join(','));
