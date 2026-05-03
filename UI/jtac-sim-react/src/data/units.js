// Battlefield mock data — extended with the metadata the recommendation
// engine needs. In production this comes from the drone's CV pipeline
// (target_class, movement_state, cnn_confidence, tle_category) and from
// friendly GPS beacons (exposure, axis_orientation_deg).

export const HOSTILES = [
  {
    id: 'TGT.2.201451', lat: 31.4815, lng: 64.2720,
    type: 'Light Skinned Vehicle', primary: true,
    description: 'Light skinned vehicle (technical) with mounted weapon',
    target_class: 'vehicle_wheeled_soft',
    movement_state: 'stationary',
    is_movable: true,
    cnn_confidence: 0.94,
    tle_category: 'CAT_III',
    elevation_m: 380,
    in_structure: false,
  },
  {
    id: 'TGT.2.201452', lat: 31.4821, lng: 64.2692,
    type: 'Dismounted Infantry x4', primary: false,
    description: 'Dismounted infantry x4',
    target_class: 'personnel_concentrated',
    movement_state: 'slow',
    speed_kts: 4,
    heading_deg: 90,
    is_movable: true,
    cnn_confidence: 0.88,
    tle_category: 'CAT_III',
    elevation_m: 376,
    in_structure: false,
  },
  {
    id: 'TGT.2.201452.1', lat: 31.4828, lng: 64.2671,
    type: 'Dismounted Infantry x2', primary: false,
    description: 'Dismounted infantry x2',
    target_class: 'personnel_concentrated',
    movement_state: 'stationary',
    is_movable: true,
    cnn_confidence: 0.81,
    tle_category: 'CAT_III',
    elevation_m: 372,
    in_structure: false,
  },
];

export const FRIENDLIES = [
  { id: 'F.2.202018', lat: 31.4804, lng: 64.2743, exposure: 'dug-in',         axis_orientation_deg: 45 },
  { id: 'F.2.202020', lat: 31.4797, lng: 64.2758, exposure: 'vehicle-mounted', axis_orientation_deg: 90 },
  { id: 'F.2.202021', lat: 31.4790, lng: 64.2745, exposure: 'dug-in',         axis_orientation_deg: 60 },
];

export const SELF = { id: 'JTAC LOOP', lat: 31.4778, lng: 64.2700 };

// Pre-mission data — would come from theater SPINS / OPORD in production.
export const AIRCRAFT_ON_STATION = {
  platform: 'F-16',
  loadout: {
    'GBU-12':   { count: 2, fuze: 'dual' },
    'GBU-38':   { count: 4, fuze: 'dual' },
    'GBU-39':   { count: 8, fuze: 'airburst_proximity' },
    'gun_20mm': { count: 510 },
  },
  playtime_min: 45,
  nvg_capable: true,
};

export const WEATHER = {
  cloud_ceiling_ft: 12000,
  visibility_m: 10000,
  wind_kts: 8,
  precipitation: 'none',
  gps_jamming: false,
};

// Permissive demo ROE per Collen CF-1.2 (pre-mission data, hackathon default).
export const ROE = {
  approved_categories: [
    'vehicle_wheeled_soft', 'vehicle_wheeled_soft_moving',
    'vehicle_tracked_light', 'vehicle_tracked_armor',
    'personnel_open', 'personnel_concentrated', 'personnel_dug_in',
    'structure_soft', 'structure_hardened',
  ],
  prohibited_munitions: ['cluster'],
  cluster_prohibited: true,
};

// UI dropdown options (kept for backward compatibility with NineLineForm).
export const TARGET_OPTIONS = HOSTILES.map(h => ({
  id: h.id,
  label: h.id.split('.').slice(-1)[0],
  sub: h.type.split(' ')[0],
  desc: `${h.type} · ${Math.round(h.cnn_confidence * 100)}% conf`,
}));

// Pre-loaded named Initial Points — would come from mission planning in production.
export const NAMED_IPS = [
  { id: 'IP NORTH',   label: 'IP NORTH'   },
  { id: 'IP SOUTH',   label: 'IP SOUTH'   },
  { id: 'IP EAST',    label: 'IP EAST'    },
  { id: 'IP WEST',    label: 'IP WEST'    },
  { id: 'IP ALPHA',   label: 'IP ALPHA'   },
  { id: 'IP BRAVO',   label: 'IP BRAVO'   },
  { id: 'IP HOTEL',   label: 'IP HOTEL'   },
  { id: 'BP HASTY',   label: 'BP HASTY'   },
];

// Preset remark / restriction tags JTAC can add with one tap. Each is a
// chip whose label appears in the UI and whose `text` is what gets
// transmitted in the 9-line remarks block.
export const REMARK_PRESETS = [
  { id: 'roe_a',                label: 'ROE-A',            text: 'Per ROE-A: positive ID confirmed' },
  { id: 'self_defense',         label: 'SELF DEFENSE',     text: 'Self-defense — friendlies under effective fire' },
  { id: 'time_sensitive',       label: 'TIME SENSITIVE',   text: 'TST — expedited approval' },
  { id: 'cde_elevated',         label: 'CDE ELEVATED',     text: 'CDE Level 3+ refined assessment required' },
  { id: 'abort_troops_in_cone', label: 'ABORT: TROOPS',    text: 'Abort if friendly troops enter attack cone' },
  { id: 'abort_civ_in_cone',    label: 'ABORT: CIV',       text: 'Abort if civilians enter attack cone' },
  { id: 'urban_delay_fuze',     label: 'DELAY FUZE',       text: 'Delay fuze — in-structure target' },
  { id: 'multi_target',         label: 'MULTI-TARGET',     text: 'Multi-target Type 3 engagement window' },
  { id: 'manpads_floor',        label: 'MANPADS FLOOR',    text: 'MANPADS active — observe SPINS altitude floor' },
  { id: 'gps_deny',             label: 'GPS DENIED',       text: 'GPS-denied environment — laser fallback' },
];

export const WEAPON_OPTIONS = [
  { id: 'GBU-12', label: 'GBU-12', sub: '500-lb LGB',  full: 'GBU-12 (500-lb)',  standoff: '⚠ Laser mark required',           warn: false, minSafe: 275 },
  { id: 'GBU-38', label: 'GBU-38', sub: '500-lb JDAM', full: 'GBU-38 (500-lb)',  standoff: 'GPS-guided · Type 1 prohibited',  warn: false, minSafe: 290 },
  { id: 'GBU-39', label: 'GBU-39', sub: '250-lb SDB',  full: 'GBU-39 (250-lb)',  standoff: 'Smallest CDE option',             warn: false, minSafe: 205 },
  { id: 'GBU-31', label: 'GBU-31', sub: '⚠ 2000-lb',   full: 'GBU-31 (2000-lb)', standoff: '⚠ Heavy frag — verify standoff',  warn: true,  minSafe: 335 },
];
