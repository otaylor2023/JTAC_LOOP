package com.jtacsim.plugin.cot

// Requires ATAK-CIV SDK on classpath via app/libs/main.aar
//
// CoT listener that translates incoming Cursor-on-Target events into engine
// inputs (Hostile/Friendly/SELF). 1:1 with the React app's drone-feed shape:
//   - a-h-G-* (atom-hostile-ground)  → Hostile upsert
//   - a-f-G-* (atom-friendly-ground) → Friendly upsert
//   - a-f-A-*  with own callsign      → SELF position
//
// TODO(SDK): in production, register this against
//   MapView.getMapView().getMapEventDispatcher().addMapEventListener(...)
// or hook the CotMapAdapter. For demo we leave the registration as a TODO and
// the parsing logic complete so it works the moment the SDK is on classpath.

import com.jtacsim.plugin.engine.Friendly
import com.jtacsim.plugin.engine.Hostile
import com.jtacsim.plugin.state.JtacState

// import com.atakmap.coremap.cot.event.CotEvent
// import com.atakmap.coremap.cot.event.CotDetail

class CotListener(private val state: JtacState) {

    /** Called by ATAK when any CoT event hits the bus. */
    fun onCotReceived(/* event: CotEvent */ event: Any) {
        // TODO(SDK): unwrap real CotEvent. For now pseudo-fields documented:
        //   val type    = event.type             // e.g. "a-h-G-U-C-V"  (hostile vehicle)
        //   val uid     = event.uid              // unique track id
        //   val point   = event.cotPoint         // { lat, lon, hae }
        //   val detail  = event.detail           // <detail> XML node
        //
        // Pseudo-routing:
        //   when {
        //     type.startsWith("a-h-") -> state.upsertHostile(parseHostile(uid, type, point, detail))
        //     type.startsWith("a-f-G-") -> state.upsertFriendly(parseFriendly(uid, point, detail))
        //     type.startsWith("a-f-A-") && uid == state.selfId -> state.setSelfPosition(uid, point.lat, point.lon)
        //   }
    }

    /**
     * Build a Hostile from CoT detail. CoT carries some classification
     * metadata; we map it to engine targetClass + tle category.
     *
     * If your CV pipeline emits richer metadata (cnnConfidence, movement),
     * add it to the <detail> CoT extension and pull it from there.
     */
    fun parseHostile(
        uid: String,
        cotType: String,
        lat: Double,
        lng: Double,
        elevationM: Int,
        description: String,
        targetClass: String = "vehicle_wheeled_soft",
        cnnConfidence: Double = 0.90,
        tleCategory: String = "CAT_III",
        movementState: String = "stationary",
    ): Hostile = Hostile(
        id = uid,
        lat = lat, lng = lng,
        description = description,
        targetClass = inferClassFromCotType(cotType, targetClass),
        movementState = movementState,
        cnnConfidence = cnnConfidence,
        tleCategory = tleCategory,
        elevationM = elevationM,
        inStructure = false,
    )

    fun parseFriendly(
        uid: String,
        lat: Double,
        lng: Double,
        exposure: String = "open",
        axisOrientationDeg: Int? = null,
    ): Friendly = Friendly(uid, lat, lng, exposure, axisOrientationDeg)

    /**
     * Maps CoT 2525 type strings to engine target_class buckets.
     * a-h-G-U-C-V    → vehicle_wheeled_soft  (Combat Vehicle)
     * a-h-G-U-C-A-T  → vehicle_tracked_armor (Armored Track)
     * a-h-G-U-U-I    → personnel_open
     * a-h-G-I-B      → structure_soft        (Installation/Building)
     */
    private fun inferClassFromCotType(cotType: String, fallback: String): String = when {
        cotType.startsWith("a-h-G-U-C-A-T") -> "vehicle_tracked_armor"
        cotType.startsWith("a-h-G-U-C-A")   -> "vehicle_tracked_light"
        cotType.startsWith("a-h-G-U-C-V")   -> "vehicle_wheeled_soft"
        cotType.startsWith("a-h-G-U-U")     -> "personnel_open"
        cotType.startsWith("a-h-G-U-C-D")   -> "personnel_dug_in"
        cotType.startsWith("a-h-G-I")       -> "structure_soft"
        cotType.startsWith("a-h-G-I-B-H")   -> "structure_hardened"
        else                                 -> fallback
    }
}
