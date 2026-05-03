package com.jtacsim.plugin.engine

// Deterministic decision-tree recommendation engine.
// 1:1 port of /JTAC_Manuals/UI/jtac-sim-react/src/engine/decisionTree.js
// → Kotlin. Has no Android or ATAK dependencies — pure logic.
//
// Inputs come in as plain data classes (Hostile, Friendly, Aircraft, ...).
// Output is a structured Recommendation matching DECISION_TREE/output_schema.json.

// ─── DATA CLASSES ─────────────────────────────────────────────────────────

data class Hostile(
    val id: String,
    val lat: Double, val lng: Double,
    val description: String,
    val targetClass: String,                // e.g. "vehicle_wheeled_soft"
    val movementState: String,              // "stationary" | "slow" | "fast"
    val isMovable: Boolean = true,
    val cnnConfidence: Double,
    val tleCategory: String,                // "CAT_I" | "CAT_II" | "CAT_III"
    val elevationM: Int,
    val inStructure: Boolean = false,
    val isNslCatI: Boolean = false,
    val speedKts: Double? = null,
    val headingDeg: Double? = null,
)

data class Friendly(
    val id: String,
    val lat: Double, val lng: Double,
    val exposure: String = "open",
    val axisOrientationDeg: Int? = null,
)

data class Aircraft(
    val platform: String,                   // "A-10" | "F-15E" | ...
    val loadout: Map<String, Int>,          // munitionId → count
    val playtimeMin: Int = 30,
    val nvgCapable: Boolean = true,
)

data class Weather(
    val cloudCeilingFt: Int,
    val visibilityM: Int,
    val windKts: Int,
    val precipitation: String = "none",
    val gpsJamming: Boolean = false,
)

data class ROE(
    val approvedCategories: Set<String>,
    val prohibitedMunitions: Set<String> = emptySet(),
    val clusterProhibited: Boolean = true,
)

data class TacticalState(
    val hostiles: List<Hostile>,
    val friendlies: List<Friendly>,
    val primaryTargetId: String,
    val aircraft: Aircraft,
    val weather: Weather,
    val roe: ROE,
    val timeOfDay: String = "day",          // "day" | "night"
    val userHeading: Int? = null,           // JTAC override
    val jtacVisualOnTarget: Boolean = false,
    val jtacVisualOnAircraft: Boolean = false,
    val friendliesTakingEffectiveFire: Boolean = false,
    val multiTargetWindow: Boolean = false,
    val supportedCommanderAuthorizedType3: Boolean = false,
    val targetIsTimeSensitive: Boolean = false,
    val droneHasLaserDesignator: Boolean = true,
    val droneHasIrPointer: Boolean = true,
    val civiliansWithin500m: Boolean = false,
)

// ─── OUTPUT ──────────────────────────────────────────────────────────────

data class TraceStep(val tree: String, val status: String, val text: String)

data class MunitionPick(
    val id: String, val name: String, val guidance: String, val warheadLb: Int,
    val redStandingM: Int, val tleRequiredM: Int, val fuze: String, val count: Int,
    val effectivenessRating: String, val effectivenessScore: Double,
)
data class Alternative(val id: String, val name: String, val whyConsidered: String, val rating: String, val score: Double)

data class NineLine(
    val ipBp: String,
    val headingDeg: Int,
    val distanceNm: Double,
    val targetElevationFt: Int,
    val targetDescription: String,
    val targetMgrs: String,
    val targetTleCategory: String,
    val markType: String,
    val markValue: String,
    val prfCode: String?,
    val friendliesDirection: String,
    val friendliesDistanceM: Int,
    val egressDirection: String,
    val egressValue: String,
)

data class Recommendation(
    val engageability: String,                // "ENGAGEABLE" | "NOT_ENGAGEABLE" | "SELF_DEFENSE_OVERRIDE" | "ENGAGEABLE_WITH_CAVEATS"
    val targetId: String,
    val flags: List<String>,
    val blockReasons: List<String> = emptyList(),
    val controlType: String = "Type_2",
    val methodOfAttack: String = "BOT",
    val clearanceCall: String = "CLEARED HOT",
    val munition: MunitionPick? = null,
    val alternatives: List<Alternative> = emptyList(),
    val nineLine: NineLine? = null,
    val remarks: List<String> = emptyList(),
    val restrictions: List<String> = emptyList(),
    val reasoningTrace: List<TraceStep>,
    val routingChain: List<String>,
    val nextRecipient: String,
    val finalApprover: String?,
    val requiresGfcInitials: Boolean,
)

// ─── TREES ───────────────────────────────────────────────────────────────

object DecisionTree {

    private val PID_THRESHOLDS = mapOf(
        "vehicle"   to 0.85,
        "personnel" to 0.92,
        "structure" to 0.85,
        "default"   to 0.85,
    )

    private val TLE_M = mapOf("CAT_I" to 10, "CAT_II" to 20, "CAT_III" to 30)

    private fun pidCategoryFor(tc: String): String = when {
        tc.startsWith("vehicle")   -> "vehicle"
        tc.startsWith("personnel") -> "personnel"
        tc.startsWith("structure") || tc.startsWith("bunker") -> "structure"
        else -> "default"
    }

    fun recommend(state: TacticalState): Recommendation {
        val target = state.hostiles.firstOrNull { it.id == state.primaryTargetId }
            ?: return blocked(listOf("No primary target"), listOf(TraceStep("Tree 1 — Engageability", "blocked", "Primary target not in feed.")))

        val trace = mutableListOf<TraceStep>()

        // ─── Tree 1: Engageability gate ─────────────────────────────────
        // Branch 0: self-defense override (parallel)
        if (state.friendliesTakingEffectiveFire) {
            trace += TraceStep("Tree 1 — Engageability", "override",
                "Friendlies under effective fire → SELF-DEFENSE OVERRIDE. Bypasses NSL + ROE category checks.")
            // Continue rest of trees with override flag in mind.
        } else {
            // PID confidence by class
            val cat = pidCategoryFor(target.targetClass)
            val threshold = PID_THRESHOLDS[cat] ?: PID_THRESHOLDS["default"]!!
            if (target.cnnConfidence < threshold) {
                trace += TraceStep("Tree 1 — Engageability", "blocked",
                    "PID confidence ${"%.2f".format(target.cnnConfidence)} < $threshold ($cat). Single-source FMV insufficient (JFO ATTP ¶1-136).")
                return blocked(listOf("PID confidence ${"%.2f".format(target.cnnConfidence)} below $threshold ($cat)"), trace, listOf("INSUFFICIENT_PID", "LOW_CONFIDENCE"), target.id)
            }

            if (target.isNslCatI) {
                trace += TraceStep("Tree 1 — Engageability", "blocked",
                    "Target itself is Cat I no-strike entity (hospital/school/mosque/...).")
                return blocked(listOf("Target is Cat I no-strike entity"), trace, listOf("TARGET_IS_NSL"), target.id)
            }

            if (TLE_M[target.tleCategory] == null) {
                trace += TraceStep("Tree 1 — Engageability", "blocked",
                    "Position uncertainty worse than CAT III (${target.tleCategory}). Refine via mensuration.")
                return blocked(listOf("Position uncertainty exceeds CAT III"), trace, listOf("TLE_DEGRADED"), target.id)
            }

            if (target.targetClass !in state.roe.approvedCategories) {
                trace += TraceStep("Tree 1 — Engageability", "blocked",
                    "Target class ${target.targetClass} not in ROE approved categories.")
                return blocked(listOf("Target class not authorized by current ROE"), trace, listOf("ROE_BLOCKED"), target.id)
            }

            trace += TraceStep("Tree 1 — Engageability", "passed",
                "Hostile ${target.targetClass}, PID ${"%.2f".format(target.cnnConfidence)} ≥ $threshold, position fix ${target.tleCategory}, ROE-approved.")
        }

        // ─── Tree 2: Munition selection ─────────────────────────────────
        val closest = Geo.closestFriendly(target, state.friendlies)
        val friendlyDistanceM = closest?.distanceM ?: Double.POSITIVE_INFINITY

        // Stage 0 — movement gate (Collen CF-1.3)
        val isMover = target.movementState in listOf("slow", "fast") || target.isMovable
        val primaryFamilies: Set<String> = if (isMover) setOf("laser", "gps_laser", "iir") else setOf("gps", "gps_laser")
        val movementNote = if (isMover) "moving/movable → laser/IIR primary" else "stationary/not movable → GPS-coordinate primary"

        // Stage 2A: hard filter
        val survivors = mutableListOf<Triple<Munition, Rating, Int>>()
        val eliminations = mutableListOf<Pair<String, String>>()
        for (m in Munitions.ALL) {
            if (state.aircraft.platform !in m.deliveryAircraft) {
                eliminations += m.id to "not deliverable by ${state.aircraft.platform}"; continue
            }
            val stocked = state.aircraft.loadout[m.id] ?: 0
            if (stocked == 0) { eliminations += m.id to "not on aircraft loadout"; continue }
            val tleHave = TLE_M[target.tleCategory] ?: Int.MAX_VALUE
            if (tleHave > m.tleRequiredM) { eliminations += m.id to "TLE ${target.tleCategory} (${tleHave}m) > required ${m.tleRequiredM}m"; continue }
            if (m.guidance == "laser" && state.weather.cloudCeilingFt < 5000) { eliminations += m.id to "cloud ceiling defeats laser"; continue }
            if (m.guidance == "iir" && state.weather.visibilityM < 3000) { eliminations += m.id to "visibility defeats IIR"; continue }
            if ((m.guidance == "gps" || m.guidance == "gps_laser") && state.weather.gpsJamming) { eliminations += m.id to "GPS jamming"; continue }
            val rating = TargetEffectiveness.rating(target.targetClass, m.effectivenessClass)
            if (rating == Rating.NOT_REC || rating == Rating.PROHIBITED) { eliminations += m.id to "$rating vs ${target.targetClass}"; continue }
            survivors += Triple(m, rating, stocked)
        }

        if (survivors.isEmpty()) {
            trace += TraceStep("Tree 2 — Munition", "blocked",
                "No viable munition (${eliminations.size} eliminated). Top reasons: ${eliminations.take(3).joinToString("; ") { "${it.first} (${it.second})" }}")
            return blocked(listOf("No viable munition"), trace, listOf("NO_VIABLE_MUNITION"), target.id)
        }

        // Stage 2B + 2C: rank with movement-gate bonus + tiebreakers
        val ranked = survivors.map { (m, rating, stocked) ->
            var score = rating.score
            if (m.guidance in primaryFamilies) score += 0.20
            score += minOf(0.15, ((friendlyDistanceM - m.redStandingM) / maxOf(m.redStandingM, 1).toDouble()) * 0.05)
            score += minOf(0.05, stocked * 0.005)
            val flags = mutableListOf<String>()
            if (friendlyDistanceM <= m.redStandingM) {
                flags += "DANGER_CLOSE"
                if (friendlyDistanceM < 0.5 * m.redStandingM) flags += "EXTREME_DANGER_CLOSE"
            }
            if (m.type1Prohibited) flags += "TYPE_1_PROHIBITED"
            Quad(m, rating, stocked, score, flags)
        }.sortedByDescending { it.score }

        val top = ranked.first()
        val alternatives = ranked.drop(1).take(2).map { q ->
            val why = when {
                q.m.guidance == "iir" && isMover -> "IIR seeker — autonomous lock on movers"
                q.m.guidance == "laser" && isMover -> "Laser homing — works on movers via designation"
                q.m.guidance == "gps" && !isMover -> "GPS-only — coordinate-based on stationary target"
                q.m.guidance == "gps_laser" -> "GPS+laser hybrid"
                q.m.classBucket == "gun" -> "Direct fire — exempt from CDE"
                else -> "${q.rating} vs ${target.targetClass}"
            }
            Alternative(q.m.id, q.m.name, why, q.rating.name, q.score)
        }

        trace += TraceStep("Tree 2 — Munition", if (top.flags.isNotEmpty()) "flagged" else "passed",
            "Stage 0 movement gate: $movementNote. ${ranked.size} candidates after hard filter. Top: ${top.m.id} (${top.rating}, ${"%.2f".format(top.score)})${if (top.flags.isNotEmpty()) ", flags: ${top.flags.joinToString(", ")}" else ""}.")

        // ─── Tree 3: Control type ──────────────────────────────────────
        val controlType: String
        val methodOfAttack: String
        val clearanceCall: String
        val dangerClose = "DANGER_CLOSE" in top.flags
        when {
            top.m.type1Prohibited && state.multiTargetWindow && state.supportedCommanderAuthorizedType3 -> {
                controlType = "Type_3"; clearanceCall = "CLEARED TO ENGAGE"; methodOfAttack = "BOC"
                trace += TraceStep("Tree 3 — Control", "flagged", "Multi-target authorized + GPS munition → Type 3.")
            }
            top.m.type1Prohibited -> {
                controlType = "Type_2"; clearanceCall = "CLEARED HOT"; methodOfAttack = "BOC"
                trace += TraceStep("Tree 3 — Control", "flagged", "GPS-guided ${top.m.id} → Type 1 PROHIBITED (JP 3-09.3 III-43). Type 2 forced.")
            }
            state.multiTargetWindow && state.supportedCommanderAuthorizedType3 -> {
                controlType = "Type_3"; clearanceCall = "CLEARED TO ENGAGE"; methodOfAttack = "BOT"
                trace += TraceStep("Tree 3 — Control", "flagged", "Multi-target window + commander authorized → Type 3.")
            }
            state.jtacVisualOnTarget && state.jtacVisualOnAircraft -> {
                controlType = "Type_1"; clearanceCall = "CLEARED HOT"; methodOfAttack = "BOT"
                trace += TraceStep("Tree 3 — Control", "passed",
                    "JTAC dual-visual + non-GPS munition → Type 1${if (dangerClose) " (danger close forces tightest control)" else ""}.")
            }
            else -> {
                controlType = "Type_2"; clearanceCall = "CLEARED HOT"; methodOfAttack = "BOT"
                trace += TraceStep("Tree 3 — Control", "passed",
                    "Drone-fed CAS + JTAC remote → Type 2 default (drone serves as remote sensor — JP 3-09.3 III-45).")
            }
        }

        // ─── Tree 4: Mark method ──────────────────────────────────────
        val (markType, markValue, prfCode) = when {
            methodOfAttack == "BOC" && top.m.guidance == "gps" -> {
                trace += TraceStep("Tree 4 — Mark", "passed", "BOC + GPS-guided → Line 7 = no mark."); Triple("no_mark", "No mark — pilot acquires via GPS", null)
            }
            top.m.guidance == "laser" || top.m.guidance == "gps_laser" -> {
                trace += TraceStep("Tree 4 — Mark", "passed", "Laser-guided → drone laser primary, PRF 1688."); Triple("laser", "Drone laser, code 1688", "1688")
            }
            top.m.guidance == "iir" -> {
                trace += TraceStep("Tree 4 — Mark", "passed", "IIR seeker → no mark; pilot acquires."); Triple("no_mark", "No mark — pilot acquisition (IIR)", null)
            }
            state.timeOfDay == "night" && state.droneHasIrPointer -> {
                trace += TraceStep("Tree 4 — Mark", "passed", "Night + NVG aircrew + IR pointer → SPARKLE."); Triple("ir_pointer", "IR pointer SPARKLE", null)
            }
            else -> {
                trace += TraceStep("Tree 4 — Mark", "passed", "Talk-on from common reference point."); Triple("talk_on", "Talk-on from CRP", null)
            }
        }

        // ─── Tree 5: IP/Egress (geometry) ──────────────────────────────
        val egressDeg = if (closest != null) (closest.bearingDeg + 180) % 360 else 0
        val attackHeading = state.userHeading ?: egressDeg
        val egressCardinal = Geo.bearingToCardinal(egressDeg.toDouble())
        trace += TraceStep("Tree 5 — IP/Egress", "passed",
            "Egress $egressCardinal (${egressDeg}°) — opposite friendly bearing. Attack heading ${attackHeading}°M.")

        // ─── Tree 6: Restrictions ──────────────────────────────────────
        val remarks = mutableListOf<String>()
        val restrictions = mutableListOf<String>()
        if (markType == "laser") {
            val ltl = (attackHeading + 180) % 360
            remarks += "LTL ${"%03d".format(ltl)}°M"
            val fahLow = (ltl + 10) % 360
            val fahHigh = (ltl + 60) % 360
            restrictions += "FAH ${"%03d".format(fahLow)}-${"%03d".format(fahHigh)} clockwise (laser cone)"
        }
        if ("DANGER_CLOSE" in top.flags) {
            restrictions += "DANGER CLOSE — friendlies inside ${top.m.id} RED (${friendlyDistanceM.toInt()}m vs ${top.m.redStandingM}m); GFC initials required"
            closest?.friendly?.axisOrientationDeg?.let {
                restrictions += "FAH parallel to friendly axis ${"%03d".format(it)}° ± 30°"
            }
        }
        if (state.friendliesTakingEffectiveFire) remarks += "SELF-DEFENSE — friendlies under effective fire"
        if (target.movementState != "stationary") {
            val ts = "TS:${java.time.Instant.now().toString().take(16).replace("T", " ")}Z"
            remarks += "Moving target: ${target.speedKts ?: "?"} kts hdg ${target.headingDeg ?: "?"}°, $ts"
        }
        restrictions += if (state.targetIsTimeSensitive) "TOT immediate" else "TOT push when ready"

        trace += TraceStep("Tree 6 — Restrictions",
            if (restrictions.any { it.startsWith("DANGER CLOSE") }) "flagged" else "passed",
            "${remarks.size} remarks + ${restrictions.size} restrictions.${if (restrictions.any { it.startsWith("DANGER CLOSE") }) " Danger close active." else ""}")

        // ─── Compose 9-line ────────────────────────────────────────────
        val targetElevationFt = (target.elevationM * 3.28084).toInt()
        val mgrs = Geo.approximateMGRS(target.lat, target.lng)

        val nineLine = NineLine(
            ipBp = "IP NORTH",
            headingDeg = attackHeading,
            distanceNm = 2.4,           // simplified — real impl computes from IP
            targetElevationFt = targetElevationFt,
            targetDescription = target.description,
            targetMgrs = mgrs,
            targetTleCategory = target.tleCategory,
            markType = markType,
            markValue = markValue,
            prfCode = prfCode,
            friendliesDirection = closest?.bearingCardinal ?: "—",
            friendliesDistanceM = closest?.distanceM?.toInt() ?: 0,
            egressDirection = egressCardinal,
            egressValue = "Egress $egressCardinal, climb to 8000 ft MSL",
        )

        val flagsAll = (top.flags + (if (state.friendliesTakingEffectiveFire) listOf("SELF_DEFENSE_OVERRIDE") else emptyList())).distinct()

        return Recommendation(
            engageability = if (state.friendliesTakingEffectiveFire) "SELF_DEFENSE_OVERRIDE" else "ENGAGEABLE",
            targetId = target.id,
            flags = flagsAll,
            controlType = controlType,
            methodOfAttack = methodOfAttack,
            clearanceCall = clearanceCall,
            munition = MunitionPick(
                top.m.id, top.m.name, top.m.guidance, top.m.warheadLb, top.m.redStandingM,
                top.m.tleRequiredM, top.m.fuzeOptions.first(), top.stocked, top.rating.name, top.score,
            ),
            alternatives = alternatives,
            nineLine = nineLine,
            remarks = remarks,
            restrictions = restrictions,
            reasoningTrace = trace,
            routingChain = listOf("system_generated", "jtac_review", "gfc_approval", "aircrew_transmit"),
            nextRecipient = "jtac",
            finalApprover = "gfc",
            requiresGfcInitials = "DANGER_CLOSE" in top.flags,
        )
    }

    private fun blocked(reasons: List<String>, trace: List<TraceStep>, flags: List<String> = emptyList(), targetId: String = ""): Recommendation =
        Recommendation(
            engageability = "NOT_ENGAGEABLE",
            targetId = targetId,
            flags = flags,
            blockReasons = reasons,
            reasoningTrace = trace,
            routingChain = listOf("system_generated", "jtac_review", "closed_not_engaged"),
            nextRecipient = "jtac",
            finalApprover = null,
            requiresGfcInitials = false,
        )

    private data class Quad(
        val m: Munition, val rating: Rating, val stocked: Int,
        val score: Double, val flags: List<String>,
    )
}
