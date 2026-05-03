package com.jtacsim.plugin.ui

// Requires ATAK-CIV SDK on classpath via app/libs/main.aar
//
// Owns the map-overlay layer for the 9-Line plugin. 1:1 with MapView.jsx —
// renders:
//   • Hostile markers (red dot, larger if primary). Tap = retarget.
//   • Friendly markers (blue dot).
//   • Self marker (cyan).
//   • Threat ring around primary (red dashed circle, ~115 m).
//   • Attack vector polyline (amber dashed) from offset-along-heading to target.
//   • FAH cone polygon (amber translucent, ±15° wedge).
//   • Blast / min-safe ring (red translucent circle of weaponMinSafe meters).
//   • Draggable orange heading handle at the tip of the attack vector.
//   • Egress arrow (amber dashed) from target outward in egressDir.
//
// All shapes live in a single MapGroup so cleanup is one call.

import com.jtacsim.plugin.engine.Geo
import com.jtacsim.plugin.engine.Hostile
import com.jtacsim.plugin.engine.Recommendation
import com.jtacsim.plugin.state.JtacState
import com.jtacsim.plugin.state.Screen

// import com.atakmap.android.maps.MapView
// import com.atakmap.android.maps.MapGroup
// import com.atakmap.android.maps.Marker
// import com.atakmap.android.maps.Polyline
// import com.atakmap.android.maps.Polygon
// import com.atakmap.android.drawing.shapes.DrawingCircle
// import com.atakmap.coremap.maps.coords.GeoPoint
// import com.atakmap.android.icons.Icon2525cTypeResolver

class MapOverlayManager(
    /* private val mapView: MapView, */
    private val state: JtacState,
) {

    companion object {
        const val FAH_HALF_DEG = 15
        const val THREAT_RING_M = 115
        const val ATTACK_VECTOR_DEG_OFFSET = 0.015        // ~1.6 km
        const val FAH_CONE_DEG_OFFSET = 0.022             // ~2.4 km
        const val EGRESS_LINE_DEG_OFFSET = 0.018          // ~2.0 km
        const val LAYER_GROUP_NAME = "JTAC_9LINE_OVERLAY"
    }

    // private var overlayGroup: MapGroup? = null
    // private val hostileMarkers = mutableMapOf<String, Marker>()
    // private val friendlyMarkers = mutableMapOf<String, Marker>()
    // private var selfMarker: Marker? = null
    // private var threatRing: DrawingCircle? = null
    // private var attackLine: Polyline? = null
    // private var fahCone: Polygon? = null
    // private var blastRing: DrawingCircle? = null
    // private var headingHandle: Marker? = null
    // private var egressLine: Polyline? = null

    private var draggingHandle: Boolean = false

    // Callback for when the JTAC taps a hostile on the map.
    var onHostileTapped: ((String) -> Unit)? = null
    var onHeadingChanged: ((Int) -> Unit)? = null

    /**
     * Initialise the overlay group. Call once after the MapView is alive.
     */
    fun attach() {
        // TODO(SDK):
        //   overlayGroup = mapView.rootGroup.addGroup(LAYER_GROUP_NAME)
        //   overlayGroup.metaData["nevercot"] = true
        //   overlayGroup.metaData["addToObjList"] = false
    }

    fun detach() {
        // TODO(SDK):
        //   overlayGroup?.let { mapView.rootGroup.removeGroup(it) }
        //   overlayGroup = null
        //   hostileMarkers.clear()
        //   friendlyMarkers.clear()
        //   selfMarker = null
    }

    /**
     * Re-render every overlay layer based on the current state + recommendation.
     * Called whenever JtacState fires onStateChanged.
     */
    fun render(rec: Recommendation) {
        renderSelfMarker()
        renderFriendlyMarkers()
        renderHostileMarkers()
        val primary = state.hostiles.firstOrNull { it.id == state.primaryTargetId } ?: return
        renderThreatRing(primary)

        val show = state.recVisible && rec.engageability != "NOT_ENGAGEABLE"
        if (!show) {
            clearScenarioLayers()
            return
        }

        val nl = rec.nineLine ?: return
        renderAttackVector(primary, nl.headingDeg)
        renderFahCone(primary, nl.headingDeg)
        rec.munition?.redStandingM?.let { renderBlastRing(primary, it) }
        renderHeadingHandle(primary, nl.headingDeg)

        val effectiveEgress = state.egressDir ?: nl.egressDirection
        renderEgressArrow(primary, effectiveEgress)
    }

    private fun renderSelfMarker() {
        // TODO(SDK):
        //   if (selfMarker == null) {
        //     selfMarker = Marker(GeoPoint(state.selfLat, state.selfLng), "jtac.self")
        //     selfMarker.title = state.selfId
        //     selfMarker.type = "a-f-A-J"      // friendly air joker = JTAC-ish
        //     overlayGroup?.addItem(selfMarker)
        //   } else {
        //     selfMarker?.point = GeoPoint(state.selfLat, state.selfLng)
        //   }
    }

    private fun renderFriendlyMarkers() {
        // TODO(SDK):
        //   val seen = mutableSetOf<String>()
        //   for (f in state.friendlies) {
        //     seen += f.id
        //     val existing = friendlyMarkers[f.id]
        //     if (existing == null) {
        //       val m = Marker(GeoPoint(f.lat, f.lng), f.id)
        //       m.title = f.id; m.type = "a-f-G"
        //       overlayGroup?.addItem(m); friendlyMarkers[f.id] = m
        //     } else { existing.point = GeoPoint(f.lat, f.lng) }
        //   }
        //   // remove stale
        //   friendlyMarkers.entries.removeAll { (id, m) ->
        //     if (id !in seen) { overlayGroup?.removeItem(m); true } else false
        //   }
    }

    private fun renderHostileMarkers() {
        // TODO(SDK):
        //   val seen = mutableSetOf<String>()
        //   for (h in state.hostiles) {
        //     seen += h.id
        //     val existing = hostileMarkers[h.id]
        //     if (existing == null) {
        //       val m = Marker(GeoPoint(h.lat, h.lng), h.id)
        //       m.title = h.id; m.type = "a-h-G"
        //       m.metaData["primary"] = (h.id == state.primaryTargetId)
        //       m.setOnClickListener { onHostileTapped?.invoke(h.id) }
        //       overlayGroup?.addItem(m); hostileMarkers[h.id] = m
        //     } else {
        //       existing.point = GeoPoint(h.lat, h.lng)
        //       existing.metaData["primary"] = (h.id == state.primaryTargetId)
        //     }
        //   }
        //   hostileMarkers.entries.removeAll { (id, m) ->
        //     if (id !in seen) { overlayGroup?.removeItem(m); true } else false
        //   }
    }

    private fun renderThreatRing(primary: Hostile) {
        // TODO(SDK):
        //   if (threatRing == null) {
        //     threatRing = DrawingCircle(mapView)
        //     threatRing.center = GeoPoint(primary.lat, primary.lng)
        //     threatRing.radius = THREAT_RING_M.toDouble()
        //     threatRing.strokeColor = 0xFFEF4444.toInt()
        //     threatRing.strokeWeight = 1.5
        //     threatRing.strokeStyle = STYLE_DASHED
        //     threatRing.fillColor = 0x33EF4444.toInt()
        //     overlayGroup?.addItem(threatRing)
        //   } else {
        //     threatRing.center = GeoPoint(primary.lat, primary.lng)
        //   }
    }

    private fun renderAttackVector(primary: Hostile, heading: Int) {
        val (fromLat, fromLng) = projectDeg(primary.lat, primary.lng, (heading + 180) % 360, ATTACK_VECTOR_DEG_OFFSET)
        // TODO(SDK):
        //   val pts = arrayOf(GeoPoint(fromLat, fromLng), GeoPoint(primary.lat, primary.lng))
        //   if (attackLine == null) {
        //     attackLine = Polyline(java.util.UUID.randomUUID().toString())
        //     attackLine.points = pts
        //     attackLine.strokeColor = 0xFFF59E0B.toInt()
        //     attackLine.strokeWeight = 2.0
        //     attackLine.strokeStyle = STYLE_DASHED
        //     overlayGroup?.addItem(attackLine)
        //   } else attackLine.points = pts
        // For demo purposes log the geometry so it's verifiable end-to-end.
        log("attack-line", primary, fromLat, fromLng, heading)
    }

    private fun renderFahCone(primary: Hostile, heading: Int) {
        val reverse = (heading + 180) % 360
        val (lLat, lLng) = projectDeg(primary.lat, primary.lng,
            ((reverse - FAH_HALF_DEG) + 360) % 360, FAH_CONE_DEG_OFFSET)
        val (rLat, rLng) = projectDeg(primary.lat, primary.lng,
            (reverse + FAH_HALF_DEG) % 360, FAH_CONE_DEG_OFFSET)
        // TODO(SDK):
        //   val pts = arrayOf(
        //     GeoPoint(primary.lat, primary.lng),
        //     GeoPoint(lLat, lLng), GeoPoint(rLat, rLng)
        //   )
        //   if (fahCone == null) {
        //     fahCone = Polygon(java.util.UUID.randomUUID().toString())
        //     fahCone.points = pts
        //     fahCone.strokeColor = 0xFFF59E0B.toInt()
        //     fahCone.fillColor = 0x1AF59E0B.toInt()
        //     overlayGroup?.addItem(fahCone)
        //   } else fahCone.points = pts
        log("fah-cone", primary, lLat, lLng, heading)
    }

    private fun renderBlastRing(primary: Hostile, redM: Int) {
        // TODO(SDK):
        //   if (blastRing == null) {
        //     blastRing = DrawingCircle(mapView)
        //     blastRing.center = GeoPoint(primary.lat, primary.lng)
        //     blastRing.radius = redM.toDouble()
        //     blastRing.strokeColor = 0xFFEF4444.toInt()
        //     blastRing.fillColor = 0x33EF4444.toInt()
        //     overlayGroup?.addItem(blastRing)
        //   } else { blastRing.center = GeoPoint(primary.lat, primary.lng); blastRing.radius = redM.toDouble() }
    }

    private fun renderHeadingHandle(primary: Hostile, heading: Int) {
        val reverse = (heading + 180) % 360
        val (hLat, hLng) = projectDeg(primary.lat, primary.lng, reverse, ATTACK_VECTOR_DEG_OFFSET)
        // TODO(SDK):
        //   if (headingHandle == null) {
        //     headingHandle = Marker(GeoPoint(hLat, hLng), "heading.handle")
        //     headingHandle.movable = true
        //     headingHandle.iconUri = "asset:///icons/handle.png"   // amber dot
        //     headingHandle.metaData["editable"] = true
        //     headingHandle.addOnPointChangedListener { ev ->
        //       val ll = ev.point
        //       val tgt = state.hostiles.firstOrNull { it.id == state.primaryTargetId } ?: return
        //       val brg = Geo.bearingDeg(tgt.lat, tgt.lng, ll.latitude, ll.longitude)
        //       val newHeading = (Math.round(((brg + 180) % 360) / 5.0) * 5).toInt()
        //       onHeadingChanged?.invoke((newHeading + 360) % 360)
        //     }
        //     overlayGroup?.addItem(headingHandle)
        //   } else if (!draggingHandle) {
        //     headingHandle.point = GeoPoint(hLat, hLng)
        //   }
        log("heading-handle", primary, hLat, hLng, heading)
    }

    private fun renderEgressArrow(primary: Hostile, egressDir: String) {
        val deg = cardinalToDeg(egressDir)
        val (eLat, eLng) = projectDeg(primary.lat, primary.lng, deg, EGRESS_LINE_DEG_OFFSET)
        // TODO(SDK):
        //   val pts = arrayOf(GeoPoint(primary.lat, primary.lng), GeoPoint(eLat, eLng))
        //   if (egressLine == null) {
        //     egressLine = Polyline(java.util.UUID.randomUUID().toString())
        //     egressLine.points = pts
        //     egressLine.strokeColor = 0xFFD8941E.toInt()
        //     egressLine.strokeWeight = 2.0
        //     egressLine.strokeStyle = STYLE_DASHED
        //     overlayGroup?.addItem(egressLine)
        //   } else egressLine.points = pts
        log("egress-arrow", primary, eLat, eLng, deg)
    }

    private fun clearScenarioLayers() {
        // TODO(SDK):
        //   listOf(fahCone, blastRing, headingHandle, egressLine, attackLine).forEach {
        //     it?.let { overlayGroup?.removeItem(it) }
        //   }
        //   fahCone = null; blastRing = null; headingHandle = null; egressLine = null; attackLine = null
    }

    /**
     * Notify the screen-state listener that a hostile was tapped. ATAK marker
     * click handlers route through here.
     */
    fun handleHostileTap(id: String) {
        onHostileTapped?.invoke(id)
        state.setPrimaryTarget(id)
        state.setScreen(Screen.NINE_LINE)
    }

    // ── Pure geometry helpers (Leaflet-equivalent) ────────────────────
    /**
     * Project a point `dist` (degrees) from origin along compass bearing `brng`.
     * 1:1 with project() in MapView.jsx — same flat-earth approximation, fine
     * for ≤5 km work and matches the React render exactly.
     */
    private fun projectDeg(lat: Double, lng: Double, brng: Int, dist: Double): Pair<Double, Double> {
        val rad = Math.toRadians(brng.toDouble())
        val newLat = lat + dist * Math.cos(rad)
        val newLng = lng + (dist * Math.sin(rad)) / Math.cos(Math.toRadians(lat))
        return Pair(newLat, newLng)
    }

    private fun cardinalToDeg(c: String): Int = when (c) {
        "N" -> 0; "NE" -> 45; "E" -> 90; "SE" -> 135
        "S" -> 180; "SW" -> 225; "W" -> 270; "NW" -> 315
        else -> 0
    }

    private fun log(tag: String, primary: Hostile, lat: Double, lng: Double, deg: Int) {
        // android.util.Log.v("MapOverlay", "$tag from ${primary.id} → ($lat,$lng) deg=$deg")
    }
}
