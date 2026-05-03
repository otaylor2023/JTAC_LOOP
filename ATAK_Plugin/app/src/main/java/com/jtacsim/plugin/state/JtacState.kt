package com.jtacsim.plugin.state

import com.jtacsim.plugin.data.AIRCRAFT_ON_STATION
import com.jtacsim.plugin.data.FRIENDLIES
import com.jtacsim.plugin.data.HOSTILES
import com.jtacsim.plugin.data.HOSTILE_CORES
import com.jtacsim.plugin.data.NAMED_IPS
import com.jtacsim.plugin.data.ROE_DEFAULT
import com.jtacsim.plugin.data.SELF
import com.jtacsim.plugin.data.WEATHER
import com.jtacsim.plugin.engine.DecisionTree
import com.jtacsim.plugin.engine.Friendly
import com.jtacsim.plugin.engine.Geo
import com.jtacsim.plugin.engine.Hostile
import com.jtacsim.plugin.engine.Recommendation
import com.jtacsim.plugin.engine.TacticalState

// Canonical plugin state. The MapComponent owns this — views observe via the
// StateListener callback. Mirrors App.jsx top-level state:
//   - primaryTargetId
//   - userHeading      (set by map drag handle OR IP selection)
//   - weaponOverride   (set by OPT A/B radio in single-strike form)
//   - egressDir        (set by cardinal rose in single-strike form)
//   - tacticalFlags    (drone + JTAC visual switches)
//   - screen           (single-strike vs multi-strike vs map-only)
//
// On every mutation the engine re-runs and listeners are notified — same as
// useAIRecommendation in the React app.

enum class Screen { MAP, NINE_LINE, SEQUENCE }

data class TacticalFlags(
    val jtacVisualOnTarget: Boolean = false,
    val jtacVisualOnAircraft: Boolean = false,
    val friendliesTakingEffectiveFire: Boolean = false,
    val droneHasLaserDesignator: Boolean = true,
    val droneHasIrPointer: Boolean = true,
)

interface StateListener {
    fun onStateChanged(state: JtacState, recommendation: Recommendation)
    fun onScreenChanged(screen: Screen)
}

class JtacState {

    // ── Live entities (mutable; CoT listener writes here) ────────────────
    @Volatile var hostiles: MutableList<Hostile> = HOSTILE_CORES.toMutableList()
    @Volatile var friendlies: MutableList<Friendly> = FRIENDLIES.toMutableList()
    @Volatile var selfLat: Double = SELF.lat
    @Volatile var selfLng: Double = SELF.lng
    @Volatile var selfId: String = SELF.id

    // ── JTAC overrides on top of the engine ──────────────────────────────
    var primaryTargetId: String = HOSTILES.firstOrNull { it.primary }?.core?.id
        ?: HOSTILE_CORES.first().id
        private set
    var userHeading: Int? = null
        private set
    var weaponOverride: String? = null
        private set
    var egressDir: String? = null
        private set
    var prfCode: Int = 1688
        private set
    var egressAltFt: Int = 8000
        private set
    var ipId: String = "IP NORTH"
        private set
    var additionalRemarks: String = ""
        private set
    var tactical: TacticalFlags = TacticalFlags()
        private set

    // ── Screen state ─────────────────────────────────────────────────────
    var screen: Screen = Screen.MAP
        private set
    var recVisible: Boolean = true
        private set

    private val listeners = mutableListOf<StateListener>()

    fun addListener(l: StateListener) {
        listeners += l
    }
    fun removeListener(l: StateListener) {
        listeners -= l
    }

    // ── Engine driver ────────────────────────────────────────────────────
    fun computeRecommendation(): Recommendation {
        val ts = TacticalState(
            hostiles = hostiles,
            friendlies = friendlies,
            primaryTargetId = primaryTargetId,
            aircraft = AIRCRAFT_ON_STATION,
            weather = WEATHER,
            roe = ROE_DEFAULT,
            timeOfDay = "day",
            userHeading = userHeading,
            weaponOverride = weaponOverride,
            jtacVisualOnTarget = tactical.jtacVisualOnTarget,
            jtacVisualOnAircraft = tactical.jtacVisualOnAircraft,
            friendliesTakingEffectiveFire = tactical.friendliesTakingEffectiveFire,
            droneHasLaserDesignator = tactical.droneHasLaserDesignator,
            droneHasIrPointer = tactical.droneHasIrPointer,
        )
        return DecisionTree.recommend(ts)
    }

    fun toTacticalState(): TacticalState = TacticalState(
        hostiles = hostiles,
        friendlies = friendlies,
        primaryTargetId = primaryTargetId,
        aircraft = AIRCRAFT_ON_STATION,
        weather = WEATHER,
        roe = ROE_DEFAULT,
        timeOfDay = "day",
        userHeading = userHeading,
        weaponOverride = weaponOverride,
        jtacVisualOnTarget = tactical.jtacVisualOnTarget,
        jtacVisualOnAircraft = tactical.jtacVisualOnAircraft,
        friendliesTakingEffectiveFire = tactical.friendliesTakingEffectiveFire,
        droneHasLaserDesignator = tactical.droneHasLaserDesignator,
        droneHasIrPointer = tactical.droneHasIrPointer,
    )

    // ── Mutators (each fires onStateChanged) ─────────────────────────────
    fun setPrimaryTarget(id: String) {
        if (primaryTargetId == id) return
        primaryTargetId = id
        // Tapping a hostile in the React app clears overrides — match that.
        weaponOverride = null
        egressDir = null
        userHeading = null
        notifyState()
    }

    fun setWeaponOverride(id: String?) {
        if (weaponOverride == id) return
        weaponOverride = id
        notifyState()
    }

    fun setEgressDir(dir: String?) {
        if (egressDir == dir) return
        egressDir = dir
        notifyState()
    }

    fun setUserHeading(deg: Int?) {
        if (userHeading == deg) return
        userHeading = deg?.let { ((it % 360) + 360) % 360 }
        notifyState()
    }

    fun setIpById(id: String) {
        ipId = id
        // Doctrinal: heading = bearing(IP → primary target).
        val ip = NAMED_IPS.firstOrNull { it.id == id } ?: return
        val tgt = hostiles.firstOrNull { it.id == primaryTargetId } ?: return
        val brg = Geo.bearingDeg(ip.lat, ip.lng, tgt.lat, tgt.lng)
        setUserHeading(Math.round(brg).toInt())
    }

    fun setPrfCode(code: Int) {
        prfCode = code.coerceIn(1111, 8888)
        notifyState()
    }

    fun setEgressAlt(ft: Int) {
        egressAltFt = ft.coerceIn(500, 25000)
        notifyState()
    }

    fun setAdditionalRemarks(text: String) {
        additionalRemarks = text
        // Doesn't change engine output, but listeners may want to re-render.
        notifyState()
    }

    fun setTactical(flags: TacticalFlags) {
        tactical = flags
        notifyState()
    }

    fun setRecVisible(visible: Boolean) {
        recVisible = visible
        notifyState()
    }

    fun setScreen(s: Screen) {
        if (screen == s) return
        screen = s
        listeners.forEach { it.onScreenChanged(s) }
    }

    // ── CoT-driven mutations ─────────────────────────────────────────────
    fun upsertHostile(h: Hostile) {
        val idx = hostiles.indexOfFirst { it.id == h.id }
        if (idx >= 0) hostiles[idx] = h else hostiles.add(h)
        notifyState()
    }

    fun removeHostile(id: String) {
        if (hostiles.removeAll { it.id == id }) notifyState()
    }

    fun upsertFriendly(f: Friendly) {
        val idx = friendlies.indexOfFirst { it.id == f.id }
        if (idx >= 0) friendlies[idx] = f else friendlies.add(f)
        notifyState()
    }

    fun setSelfPosition(id: String, lat: Double, lng: Double) {
        selfId = id; selfLat = lat; selfLng = lng
        notifyState()
    }

    private fun notifyState() {
        val rec = computeRecommendation()
        listeners.forEach { it.onStateChanged(this, rec) }
    }
}
