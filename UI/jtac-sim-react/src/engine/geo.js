// Geographic helpers used by the recommendation engine.
// All bearings in compass degrees (0 = N, 90 = E). All distances in meters.

const RAD = Math.PI / 180;
const EARTH_R_M = 6371000;

// Great-circle bearing from A → B in compass degrees [0, 360).
export function bearingDeg(latA, lngA, latB, lngB) {
  const φ1 = latA * RAD, φ2 = latB * RAD;
  const Δλ = (lngB - lngA) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Great-circle distance A → B in meters (haversine).
export function distanceM(latA, lngA, latB, lngB) {
  const φ1 = latA * RAD, φ2 = latB * RAD;
  const Δφ = (latB - latA) * RAD;
  const Δλ = (lngB - lngA) * RAD;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_R_M * c;
}

// Compass deg → cardinal/sub-cardinal token (8-wedge).
export function bearingToCardinal(deg) {
  const wedges = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return wedges[Math.round(((deg % 360) / 45)) % 8];
}

// "From target, where is the friendly?" — used for Line 8 of the 9-line.
// Returns the cardinal direction the friendly is in *as seen from the target*.
export function friendlyDirectionFromTarget(target, friendly) {
  const brg = bearingDeg(target.lat, target.lng, friendly.lat, friendly.lng);
  return { cardinal: bearingToCardinal(brg), bearingDeg: Math.round(brg) };
}

// Approximate MGRS for display — uses real UTM zone + band but simplifies the
// 100km-square letters to a deterministic pseudo-pair. For ops use the `mgrs`
// npm package; this is sufficient for visual demo fidelity.
export function approximateMGRS(lat, lng) {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const bandLetters = 'CDEFGHJKLMNPQRSTUVWX';
  const band = bandLetters[Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)))] ?? 'M';
  // Pseudo 100km square — deterministic from coarse position.
  const sqLetters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const sqA = sqLetters[Math.floor(((lng + 180) * 1.5) % 24)];
  const sqB = sqLetters[Math.floor(((lat + 90) * 2.0) % 24)];
  // Easting / northing approximations (5 digits each — 1m precision visual).
  const fracLng = ((lng + 180) % 6) / 6;
  const fracLat = ((lat + 80) % 8) / 8;
  const e = Math.floor(fracLng * 100000);
  const n = Math.floor(fracLat * 100000);
  return `${zone}${band} ${sqA}${sqB} ${String(e).padStart(5, '0')} ${String(n).padStart(5, '0')}`;
}

// Project a point `dist` meters from origin along compass bearing `brng`.
// Returns [lat, lng]. Used for IP placement, egress points, etc.
export function projectM(lat, lng, brngDeg, distM) {
  const δ = distM / EARTH_R_M;
  const θ = brngDeg * RAD;
  const φ1 = lat * RAD, λ1 = lng * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  return [φ2 / RAD, ((λ2 / RAD) + 540) % 360 - 180];
}

// Closest-friendly utility — returns { friendly, distance_m, bearing_cardinal, bearing_deg }.
export function closestFriendly(target, friendlies) {
  let best = null;
  for (const f of friendlies) {
    const d = distanceM(target.lat, target.lng, f.lat, f.lng);
    if (!best || d < best.distance_m) {
      const brg = bearingDeg(target.lat, target.lng, f.lat, f.lng);
      best = { friendly: f, distance_m: d, bearing_cardinal: bearingToCardinal(brg), bearing_deg: Math.round(brg) };
    }
  }
  return best;
}
