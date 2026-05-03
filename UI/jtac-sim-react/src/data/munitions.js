// Munition database — ported from /JTAC_Manuals/DECISION_TREE/munitions_database.yaml
// + RED values from /JTAC_Manuals/DECISION_TREE/red_table.yaml
// + effectiveness matrix from /JTAC_Manuals/DECISION_TREE/target_effectiveness_matrix.yaml
//
// All distances in meters. RED = 0.1% Pᵢ standing column (JFIRE Table 86).
// Source-of-truth lives in the YAML. Update both when changing.

export const MUNITIONS = [
  // ── 500-lb laser-guided bombs (Paveway II) ──────────────────────────────
  {
    id: 'GBU-12', name: 'GBU-12 Paveway II', class: 'bomb_lgb', effectiveness_class: 'bomb_lgb_500',
    warhead_lb: 500, guidance: 'laser', red_standing_m: 275, tle_required_m: 30,
    fuze_options: ['nose', 'tail', 'dual'],
    delivery_aircraft: ['A-10', 'F-15E', 'F-16', 'F/A-18', 'AV-8B', 'B-1', 'B-52', 'F-35', 'MQ-9'],
  },
  {
    id: 'GBU-16', name: 'GBU-16 Paveway II', class: 'bomb_lgb', effectiveness_class: 'bomb_lgb_2000',
    warhead_lb: 1000, guidance: 'laser', red_standing_m: 310, tle_required_m: 30,
    fuze_options: ['nose', 'tail', 'dual'],
    delivery_aircraft: ['F-15E', 'F/A-18', 'AV-8B', 'B-52'],
  },
  {
    id: 'GBU-10', name: 'GBU-10 Paveway II', class: 'bomb_lgb', effectiveness_class: 'bomb_lgb_2000',
    warhead_lb: 2000, guidance: 'laser', red_standing_m: 315, tle_required_m: 30,
    fuze_options: ['nose', 'tail', 'dual', 'hard_target_smart_fuze'],
    delivery_aircraft: ['F-15E', 'F/A-18', 'B-1', 'B-52'],
  },

  // ── GPS-guided JDAMs (Type 1 PROHIBITED — JP 3-09.3 III-43 note) ────────
  {
    id: 'GBU-38', name: 'GBU-38 JDAM (500 lb)', class: 'bomb_jdam', effectiveness_class: 'bomb_jdam_500',
    warhead_lb: 500, guidance: 'gps', red_standing_m: 290, red_airburst_m: 410, tle_required_m: 10,
    fuze_options: ['nose', 'tail', 'dual', 'airburst_proximity', 'delay'],
    delivery_aircraft: ['F-15E', 'F-16', 'F/A-18', 'AV-8B', 'B-1', 'B-2', 'B-52', 'F-35'],
    type_1_prohibited: true,
  },
  {
    id: 'GBU-32', name: 'GBU-32 JDAM (1000 lb)', class: 'bomb_jdam', effectiveness_class: 'bomb_jdam_2000',
    warhead_lb: 1000, guidance: 'gps', red_standing_m: 320, red_airburst_m: 410, tle_required_m: 10,
    fuze_options: ['nose', 'tail', 'dual', 'airburst_proximity', 'delay'],
    delivery_aircraft: ['F-15E', 'F-16', 'F/A-18', 'B-1', 'B-2', 'B-52'],
    type_1_prohibited: true,
  },
  {
    id: 'GBU-31', name: 'GBU-31 JDAM (2000 lb)', class: 'bomb_jdam', effectiveness_class: 'bomb_jdam_2000',
    warhead_lb: 2000, guidance: 'gps', red_standing_m: 335, red_airburst_m: 420, tle_required_m: 10,
    fuze_options: ['nose', 'tail', 'dual', 'airburst_proximity', 'delay'],
    delivery_aircraft: ['F-15E', 'F-16', 'F/A-18', 'B-1', 'B-2', 'B-52'],
    type_1_prohibited: true,
  },
  {
    id: 'GBU-54', name: 'GBU-54 LJDAM (Laser JDAM)', class: 'bomb_jdam', effectiveness_class: 'bomb_jdam_500_laser',
    warhead_lb: 500, guidance: 'gps_laser', red_standing_m: 290, tle_required_m: 30,
    fuze_options: ['nose', 'tail', 'dual', 'airburst_proximity', 'delay'],
    delivery_aircraft: ['F-15E', 'F-16', 'F/A-18', 'B-1'],
    type_1_prohibited: true,
  },

  // ── Small Diameter Bomb ────────────────────────────────────────────────
  {
    id: 'GBU-39', name: 'GBU-39 SDB (250 lb)', class: 'bomb_sdb', effectiveness_class: 'bomb_sdb',
    warhead_lb: 250, guidance: 'gps', red_standing_m: 205, red_airburst_m: 285, tle_required_m: 10,
    fuze_options: ['airburst_proximity', 'delay'],
    delivery_aircraft: ['F-15E', 'F-16', 'F/A-18', 'F-35', 'B-1', 'B-2', 'B-52'],
    type_1_prohibited: true,
    note: 'Preferred urban CDE option (small frag radius)',
  },
  {
    id: 'GBU-39_FLM', name: 'GBU-39 SDB FLM (focused lethality)', class: 'bomb_sdb', effectiveness_class: 'bomb_sdb_flm',
    warhead_lb: 250, guidance: 'gps', red_standing_m: 70, tle_required_m: 10,
    fuze_options: ['airburst_proximity', 'delay'],
    delivery_aircraft: ['F-15E', 'F-16', 'F/A-18'],
    type_1_prohibited: true,
    note: 'Extreme low-collateral option',
  },

  // ── Hellfire (rotary-wing / drone) ─────────────────────────────────────
  {
    id: 'AGM-114K', name: 'AGM-114K Hellfire II', class: 'missile_atgm', effectiveness_class: 'missile_atgm_l',
    warhead_lb: 20, guidance: 'laser', red_standing_m: 110, tle_required_m: 30,
    fuze_options: ['contact'],
    delivery_aircraft: ['AH-64', 'MQ-1', 'MQ-9', 'OH-58', 'AH-1Z'],
  },
  {
    id: 'AGM-114N', name: 'AGM-114N Hellfire (thermobaric)', class: 'missile_atgm', effectiveness_class: 'missile_thermo',
    warhead_lb: 18, guidance: 'laser', red_standing_m: 110, tle_required_m: 30,
    fuze_options: ['contact', 'delay'],
    delivery_aircraft: ['AH-64', 'MQ-1', 'MQ-9', 'AH-1Z'],
    note: 'Recommended for in-structure / cave engagements',
  },
  {
    id: 'AGM-114R', name: 'AGM-114R Hellfire (multi-purpose)', class: 'missile_atgm', effectiveness_class: 'missile_atgm_l',
    warhead_lb: 20, guidance: 'laser', red_standing_m: 130, tle_required_m: 30,
    fuze_options: ['contact', 'delay', 'airburst_proximity'],
    delivery_aircraft: ['AH-64', 'MQ-1', 'MQ-9', 'AH-1Z'],
  },

  // ── Maverick ───────────────────────────────────────────────────────────
  {
    id: 'AGM-65D', name: 'AGM-65D Maverick (IIR)', class: 'missile_atgm', effectiveness_class: 'missile_iir',
    warhead_lb: 125, guidance: 'iir', red_standing_m: 175, tle_required_m: 50,
    fuze_options: ['contact'],
    delivery_aircraft: ['A-10', 'F-15E', 'F-16', 'F/A-18', 'AV-8B'],
    note: 'Excellent against movers — preferred over LGB when target is moving',
  },
  {
    id: 'AGM-65L', name: 'AGM-65L Maverick (laser)', class: 'missile_atgm', effectiveness_class: 'missile_atgm_l',
    warhead_lb: 300, guidance: 'laser', red_standing_m: 175, tle_required_m: 30,
    fuze_options: ['contact', 'delay'],
    delivery_aircraft: ['A-10', 'F/A-18'],
  },

  // ── Rockets ────────────────────────────────────────────────────────────
  {
    id: 'APKWS', name: 'APKWS 70mm laser-guided rocket', class: 'rocket', effectiveness_class: 'rocket_apkws',
    warhead_lb: 10, guidance: 'laser', red_standing_m: 95, tle_required_m: 30,
    fuze_options: ['contact', 'airburst_proximity'],
    delivery_aircraft: ['AH-1Z', 'AH-64', 'OH-58', 'F/A-18', 'AV-8B'],
  },

  // ── Guns (direct fire <105mm exempt from CDE) ──────────────────────────
  {
    id: 'GAU-8', name: 'A-10 GAU-8 30 mm', class: 'gun', effectiveness_class: 'gun_30mm',
    warhead_lb: 0.7, guidance: 'ballistic', red_standing_m: 95, tle_required_m: 100,
    fuze_options: ['contact'],
    delivery_aircraft: ['A-10'],
    note: 'Direct fire <105 mm — EXEMPT from CDE methodology (CJCSI 3160.01 p.D-4)',
  },
  {
    id: 'gun_20mm', name: '20 mm cannon (M61)', class: 'gun', effectiveness_class: 'gun_20mm',
    warhead_lb: 0.2, guidance: 'ballistic', red_standing_m: 95, tle_required_m: 100,
    fuze_options: ['contact'],
    delivery_aircraft: ['F-15E', 'F-16', 'F/A-18', 'AV-8B'],
  },
];

// Convenience lookup
export const MUNITIONS_BY_ID = Object.fromEntries(MUNITIONS.map(m => [m.id, m]));

// ─── EFFECTIVENESS MATRIX ────────────────────────────────────────────────
// Rows: target classes. Columns: munition effectiveness_class.
// Ratings: PREFERRED (1.0), ACCEPTABLE (0.7), MARGINAL (0.4), NOT_REC (0.0), PROHIBITED (-1.0)
export const EFFECTIVENESS_RATINGS = { PREFERRED: 1.0, ACCEPTABLE: 0.7, MARGINAL: 0.4, NOT_REC: 0.0, PROHIBITED: -1.0 };

export const EFFECTIVENESS = {
  vehicle_wheeled_soft: {
    bomb_lgb_500: 'PREFERRED', bomb_jdam_500: 'PREFERRED', bomb_jdam_500_laser: 'PREFERRED',
    bomb_sdb: 'PREFERRED', missile_atgm_l: 'PREFERRED', missile_iir: 'PREFERRED',
    rocket_apkws: 'PREFERRED', gun_30mm: 'PREFERRED', gun_20mm: 'ACCEPTABLE',
    bomb_lgb_2000: 'NOT_REC', bomb_jdam_2000: 'NOT_REC',
  },
  vehicle_wheeled_soft_moving: {
    missile_atgm_l: 'PREFERRED', missile_iir: 'PREFERRED', bomb_jdam_500_laser: 'PREFERRED',
    bomb_lgb_500: 'MARGINAL', bomb_jdam_500: 'NOT_REC', gun_30mm: 'PREFERRED',
  },
  vehicle_tracked_light: {
    bomb_lgb_500: 'PREFERRED', bomb_jdam_500: 'PREFERRED', bomb_jdam_500_laser: 'PREFERRED',
    missile_atgm_l: 'PREFERRED', missile_iir: 'PREFERRED', gun_30mm: 'PREFERRED',
    bomb_sdb: 'ACCEPTABLE', gun_20mm: 'MARGINAL',
  },
  vehicle_tracked_armor: {
    missile_atgm_l: 'PREFERRED', missile_iir: 'PREFERRED', bomb_lgb_2000: 'PREFERRED',
    bomb_jdam_2000: 'PREFERRED', bomb_lgb_500: 'MARGINAL', gun_30mm: 'ACCEPTABLE',
    bomb_sdb: 'NOT_REC',
  },
  personnel_open: {
    bomb_lgb_500: 'ACCEPTABLE', bomb_jdam_500: 'ACCEPTABLE', bomb_sdb: 'PREFERRED',
    bomb_sdb_flm: 'PREFERRED', missile_atgm_l: 'ACCEPTABLE', rocket_apkws: 'PREFERRED',
    gun_30mm: 'PREFERRED', gun_20mm: 'PREFERRED', bomb_lgb_2000: 'NOT_REC', bomb_jdam_2000: 'NOT_REC',
  },
  personnel_concentrated: {
    bomb_lgb_500: 'PREFERRED', bomb_jdam_500: 'PREFERRED', bomb_jdam_500_laser: 'PREFERRED',
    bomb_sdb: 'PREFERRED', bomb_sdb_flm: 'PREFERRED', missile_atgm_l: 'ACCEPTABLE',
    missile_thermo: 'PREFERRED', rocket_apkws: 'ACCEPTABLE', gun_30mm: 'ACCEPTABLE',
  },
  personnel_dug_in: {
    bomb_lgb_500: 'ACCEPTABLE', bomb_jdam_500: 'PREFERRED', bomb_jdam_500_laser: 'PREFERRED',
    bomb_sdb: 'ACCEPTABLE', missile_atgm_l: 'MARGINAL', missile_iir: 'MARGINAL', gun_30mm: 'ACCEPTABLE',
  },
  structure_soft: {
    bomb_lgb_500: 'PREFERRED', bomb_jdam_500: 'PREFERRED', bomb_sdb: 'PREFERRED',
    missile_thermo: 'PREFERRED', missile_atgm_l: 'PREFERRED', missile_iir: 'PREFERRED',
    gun_30mm: 'ACCEPTABLE',
  },
  structure_hardened: {
    bomb_lgb_2000: 'PREFERRED', bomb_jdam_2000: 'PREFERRED',
    bomb_lgb_500: 'MARGINAL', missile_atgm_l: 'MARGINAL',
  },
};

// Effectiveness lookup — falls back to NOT_REC when missing.
export function effectivenessRating(targetClass, effectivenessClass) {
  const row = EFFECTIVENESS[targetClass];
  if (!row) return 'NOT_REC';
  return row[effectivenessClass] || 'NOT_REC';
}
