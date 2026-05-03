package com.jtacsim.plugin.engine

import kotlin.math.*

// Geographic helpers — bearing/distance/MGRS. Compass deg, meters.

object Geo {
    private const val RAD = PI / 180
    private const val EARTH_R_M = 6_371_000.0

    fun bearingDeg(latA: Double, lngA: Double, latB: Double, lngB: Double): Double {
        val φ1 = latA * RAD
        val φ2 = latB * RAD
        val Δλ = (lngB - lngA) * RAD
        val y = sin(Δλ) * cos(φ2)
        val x = cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ)
        return ((atan2(y, x) * 180 / PI) + 360) % 360
    }

    fun distanceM(latA: Double, lngA: Double, latB: Double, lngB: Double): Double {
        val φ1 = latA * RAD
        val φ2 = latB * RAD
        val Δφ = (latB - latA) * RAD
        val Δλ = (lngB - lngA) * RAD
        val a = sin(Δφ / 2).pow(2) + cos(φ1) * cos(φ2) * sin(Δλ / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return EARTH_R_M * c
    }

    private val WEDGES = arrayOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")

    fun bearingToCardinal(deg: Double): String {
        val idx = ((deg % 360) / 45).roundToInt() % 8
        return WEDGES[(idx + 8) % 8]
    }

    // Approximate MGRS — sufficient for visual demo. Replace with the
    // mgrs library or ATAK's CoordinateFormatUtilities for ops use.
    fun approximateMGRS(lat: Double, lng: Double): String {
        val zone = floor((lng + 180) / 6).toInt() + 1
        val bandLetters = "CDEFGHJKLMNPQRSTUVWX"
        val band = bandLetters.getOrElse(((lat + 80) / 8).toInt().coerceIn(0, 19)) { 'M' }
        val sqLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
        val sqA = sqLetters[((lng + 180) * 1.5).toInt() % 24]
        val sqB = sqLetters[((lat + 90) * 2.0).toInt() % 24]
        val fracLng = ((lng + 180) % 6) / 6
        val fracLat = ((lat + 80) % 8) / 8
        val e = (fracLng * 100000).toInt()
        val n = (fracLat * 100000).toInt()
        return "${zone}${band} ${sqA}${sqB} ${"%05d".format(e)} ${"%05d".format(n)}"
    }

    data class ClosestFriendly(
        val friendly: Friendly,
        val distanceM: Double,
        val bearingCardinal: String,
        val bearingDeg: Int,
    )

    fun closestFriendly(target: Hostile, friendlies: List<Friendly>): ClosestFriendly? {
        var best: ClosestFriendly? = null
        for (f in friendlies) {
            val d = distanceM(target.lat, target.lng, f.lat, f.lng)
            if (best == null || d < best.distanceM) {
                val brg = bearingDeg(target.lat, target.lng, f.lat, f.lng)
                best = ClosestFriendly(f, d, bearingToCardinal(brg), brg.roundToInt())
            }
        }
        return best
    }
}
