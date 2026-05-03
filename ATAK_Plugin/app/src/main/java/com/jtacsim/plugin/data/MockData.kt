package com.jtacsim.plugin.data

import com.jtacsim.plugin.engine.Aircraft
import com.jtacsim.plugin.engine.Friendly
import com.jtacsim.plugin.engine.Hostile
import com.jtacsim.plugin.engine.ROE
import com.jtacsim.plugin.engine.Weather

// 1:1 port of /UI/jtac-sim-react/src/data/units.js + rationale.js.
//
// In production these become live CoT-fed inputs. For demo + offline testing
// the plugin uses these constants so the engine produces the same
// recommendations the React app does and the JTAC sees identical fields.

// ── Self / JTAC marker stand-in ───────────────────────────────────────────
data class Self(val id: String, val lat: Double, val lng: Double)

val SELF = Self(id = "JTAC LOOP", lat = 31.4778, lng = 64.2700)

// ── Hostiles (stream-jitter source in production from drone CV) ───────────
// `primary` = the engine's default primary target on first load.
data class HostileMock(val core: Hostile, val type: String, val primary: Boolean)

val HOSTILES: List<HostileMock> = listOf(
    HostileMock(
        core = Hostile(
            id = "TGT.2.201451", lat = 31.4815, lng = 64.2720,
            description = "Light skinned vehicle (technical) with mounted weapon",
            targetClass = "vehicle_wheeled_soft",
            movementState = "stationary",
            isMovable = true,
            cnnConfidence = 0.94,
            tleCategory = "CAT_III",
            elevationM = 380,
            inStructure = false,
        ),
        type = "Light Skinned Vehicle",
        primary = true,
    ),
    HostileMock(
        core = Hostile(
            id = "TGT.2.201452", lat = 31.4821, lng = 64.2692,
            description = "Dismounted infantry x4",
            targetClass = "personnel_concentrated",
            movementState = "slow",
            isMovable = true,
            cnnConfidence = 0.88,
            tleCategory = "CAT_III",
            elevationM = 376,
            inStructure = false,
            speedKts = 4.0,
            headingDeg = 90.0,
        ),
        type = "Dismounted Infantry x4",
        primary = false,
    ),
    HostileMock(
        core = Hostile(
            id = "TGT.2.201452.1", lat = 31.4828, lng = 64.2671,
            description = "Dismounted infantry x2",
            targetClass = "personnel_concentrated",
            movementState = "stationary",
            isMovable = true,
            cnnConfidence = 0.81,
            tleCategory = "CAT_III",
            elevationM = 372,
            inStructure = false,
        ),
        type = "Dismounted Infantry x2",
        primary = false,
    ),
)

val HOSTILE_CORES: List<Hostile> = HOSTILES.map { it.core }

// ── Friendlies (PLI broadcasts in production) ─────────────────────────────
val FRIENDLIES: List<Friendly> = listOf(
    Friendly("F.2.202018", 31.4804, 64.2743, exposure = "dug-in",          axisOrientationDeg = 45),
    Friendly("F.2.202020", 31.4797, 64.2758, exposure = "vehicle-mounted", axisOrientationDeg = 90),
    Friendly("F.2.202021", 31.4790, 64.2745, exposure = "dug-in",          axisOrientationDeg = 60),
)

// ── Aircraft on station (would be from PASS-IT / config in production) ───
val AIRCRAFT_ON_STATION: Aircraft = Aircraft(
    platform = "F-16",
    loadout = mapOf(
        "GBU-12"   to 2,
        "GBU-38"   to 4,
        "GBU-39"   to 8,
        "gun_20mm" to 510,
    ),
    playtimeMin = 45,
    nvgCapable = true,
)

// ── Weather (would be from theater feed in production) ───────────────────
val WEATHER: Weather = Weather(
    cloudCeilingFt = 12000,
    visibilityM = 10000,
    windKts = 8,
    precipitation = "none",
    gpsJamming = false,
)

// ── ROE (permissive demo per Collen CF-1.2) ──────────────────────────────
val ROE_DEFAULT: ROE = ROE(
    approvedCategories = setOf(
        "vehicle_wheeled_soft", "vehicle_wheeled_soft_moving",
        "vehicle_tracked_light", "vehicle_tracked_armor",
        "personnel_open", "personnel_concentrated", "personnel_dug_in",
        "structure_soft", "structure_hardened",
    ),
    prohibitedMunitions = setOf("cluster"),
    clusterProhibited = true,
)

// ── Named IPs (mission-planning data) ─────────────────────────────────────
data class NamedIP(val id: String, val label: String, val lat: Double, val lng: Double)

val NAMED_IPS: List<NamedIP> = listOf(
    NamedIP("IP NORTH", "IP NORTH", 31.5450, 64.2720),
    NamedIP("IP SOUTH", "IP SOUTH", 31.4180, 64.2720),
    NamedIP("IP EAST",  "IP EAST",  31.4815, 64.3450),
    NamedIP("IP WEST",  "IP WEST",  31.4815, 64.1990),
    NamedIP("IP ALPHA", "IP ALPHA", 31.5300, 64.3300),
    NamedIP("IP BRAVO", "IP BRAVO", 31.4300, 64.3300),
    NamedIP("IP HOTEL", "IP HOTEL", 31.5300, 64.2100),
    NamedIP("BP HASTY", "BP HASTY", 31.4300, 64.2100),
)

// ── Remark presets ────────────────────────────────────────────────────────
data class RemarkPreset(val id: String, val label: String, val text: String)

val REMARK_PRESETS: List<RemarkPreset> = listOf(
    RemarkPreset("roe_a",                "ROE-A",          "Per ROE-A: positive ID confirmed"),
    RemarkPreset("self_defense",         "SELF DEFENSE",   "Self-defense — friendlies under effective fire"),
    RemarkPreset("time_sensitive",       "TIME SENSITIVE", "TST — expedited approval"),
    RemarkPreset("cde_elevated",         "CDE ELEVATED",   "CDE Level 3+ refined assessment required"),
    RemarkPreset("abort_troops_in_cone", "ABORT: TROOPS",  "Abort if friendly troops enter attack cone"),
    RemarkPreset("abort_civ_in_cone",    "ABORT: CIV",     "Abort if civilians enter attack cone"),
    RemarkPreset("urban_delay_fuze",     "DELAY FUZE",     "Delay fuze — in-structure target"),
    RemarkPreset("multi_target",         "MULTI-TARGET",   "Multi-target Type 3 engagement window"),
    RemarkPreset("manpads_floor",        "MANPADS FLOOR",  "MANPADS active — observe SPINS altitude floor"),
    RemarkPreset("gps_deny",             "GPS DENIED",     "GPS-denied environment — laser fallback"),
)

// ── Weapon options (display metadata for OPT B etc.) ─────────────────────
data class WeaponOption(
    val id: String,
    val label: String,
    val sub: String,
    val full: String,
    val standoff: String,
    val warn: Boolean,
    val minSafe: Int,
)

val WEAPON_OPTIONS: List<WeaponOption> = listOf(
    WeaponOption("GBU-12", "GBU-12", "500-lb LGB",  "GBU-12 (500-lb)",  "Laser mark required",                   false, 275),
    WeaponOption("GBU-38", "GBU-38", "500-lb JDAM", "GBU-38 (500-lb)",  "GPS-guided · Type 1 prohibited",        false, 290),
    WeaponOption("GBU-39", "GBU-39", "250-lb SDB",  "GBU-39 (250-lb)",  "Smallest CDE option",                   false, 205),
    WeaponOption("GBU-31", "GBU-31", "2000-lb",     "GBU-31 (2000-lb)", "Heavy frag — verify standoff",          true,  335),
)

// ── Rationale text (RationaleModal.jsx 1:1) ──────────────────────────────
data class Rationale(val title: String, val text: String, val ref: String)

val RATIONALE: Map<String, Rationale> = mapOf(
    "target" to Rationale(
        title = "WHY THIS TARGET?",
        text  = "TGT.2.201451 identified as primary threat. YOLO CV confidence 94% — Light Skinned Vehicle confirmed across 3 consecutive drone frames with ByteTrack ID persistence. Threat axis directly toward F.2.202018 (nearest friendly, 96m standoff). Secondary hostiles are dismounted infantry assessed as lower immediate risk.",
        ref   = "FM 3-09.32 §4.3 — Priority target selection based on threat axis orientation and proximity to friendly forces.",
    ),
    "vector" to Rationale(
        title = "WHY THIS ATTACK VECTOR?",
        text  = "Attack heading 260°M selected to keep all three friendly units outside the FAH corridor. Eastern approach avoids terrain masking to the north. FAH 245°–275°M gives 30° corridor with ≥19° deconfliction from nearest friendly bearing. Egress north is clear of all known threat SA.",
        ref   = "FM 3-09.32 §6.1 — FAH must provide minimum 15° deconfliction from nearest friendly unit bearing.",
    ),
    "weapon" to Rationale(
        title = "WHY GBU-38?",
        text  = "GBU-38 (500-lb JDAM) selected: (1) target type — light vehicle, 500-lb sufficient; (2) standoff compliance — nearest friendly 96m vs 85m minimum; (3) laser mark unavailable — eliminates GBU-12. GBU-31 excluded — 96m proximity to F.2.202018 violates 200m minimum safe distance.",
        ref   = "AFTTP 3-1 §8.4 — GBU-38 min safe: 85m. GBU-31 min safe: 200m (EXCLUDES). ATP 3-09.34 §5.2.",
    ),
)
