package com.jtacsim.plugin.cot

// Requires ATAK-CIV SDK on classpath via app/libs/main.aar
//
// Builds a CoT event payload representing an approved 9-line and (TODO)
// broadcasts it to the network. Mirrors the React app's onSend()/onGFC()
// behaviors — those use alert() for the demo; real plugin transmits CoT.
//
// CoT shape: type "b-r-f-h-c" (request - fires - hostile - call) is one
// reasonable starting point. Different units use different conventions —
// confirm with the receiving system (e.g. ATC, FireDirector, AFATDS bridge).

import com.jtacsim.plugin.engine.Recommendation

// import com.atakmap.coremap.cot.event.CotEvent
// import com.atakmap.coremap.cot.event.CotPoint
// import com.atakmap.coremap.cot.event.CotDetail
// import com.atakmap.android.cot.CotMapComponent

object CotEmitter {

    /**
     * Build the CoT XML for an approved 9-line. Returns the raw XML so callers
     * can preview it (e.g. on the Sent overlay) before transmit.
     */
    fun buildNineLineCot(
        rec: Recommendation,
        senderUid: String,
        approvalTimeIsoZ: String,
        prfCode: Int,
        egressAltFt: Int,
        additionalRemarks: String,
    ): String {
        val nl = rec.nineLine ?: return ""
        val target = nl.targetMgrs
        val munId = rec.munition?.id ?: "—"
        val flags = rec.flags.joinToString(",")
        val remarks = (rec.remarks + additionalRemarks.takeIf { it.isNotBlank() })
            .filterNotNull()
            .joinToString(" | ")
        val restrictions = rec.restrictions.joinToString(" | ")
        val heading = "%03d".format(nl.headingDeg)
        return """
            <event version="2.0" uid="$senderUid-9L-${approvalTimeIsoZ.replace(":","").take(15)}"
                   type="b-r-f-h-c" how="h-g-i-g-o"
                   start="$approvalTimeIsoZ" time="$approvalTimeIsoZ" stale="$approvalTimeIsoZ">
              <point lat="0" lon="0" hae="0" ce="9999999" le="9999999"/>
              <detail>
                <NineLineCAS targetId="${rec.targetId}" controlType="${rec.controlType}" methodOfAttack="${rec.methodOfAttack}" clearanceCall="${rec.clearanceCall}">
                  <Line1 ip="${nl.ipBp}"/>
                  <Line2 heading="${heading}M"/>
                  <Line3 distance_nm="${nl.distanceNm}"/>
                  <Line4 elevation_ft_msl="${nl.targetElevationFt}"/>
                  <Line5 description="${escape(nl.targetDescription)}"/>
                  <Line6 mgrs="${target}" tle="${nl.targetTleCategory}"/>
                  <Line7 mark="${nl.markType}" value="${escape(nl.markValue)}" prf="${nl.prfCode ?: prfCode}"/>
                  <Line8 dir="${nl.friendliesDirection}" dist_m="${nl.friendliesDistanceM}"/>
                  <Line9 dir="${nl.egressDirection}" alt_ft="${egressAltFt}"/>
                </NineLineCAS>
                <Munition id="$munId" red_m="${rec.munition?.redStandingM ?: 0}" rating="${rec.munition?.effectivenessRating ?: ""}"/>
                <Flags value="$flags"/>
                <Remarks value="${escape(remarks)}"/>
                <Restrictions value="${escape(restrictions)}"/>
                <Approval sender="$senderUid" time="$approvalTimeIsoZ" gfc_initials="${rec.requiresGfcInitials}"/>
              </detail>
            </event>
        """.trimIndent()
    }

    /**
     * Build a single-line GFC summary string (used for Type 2 Talk-On).
     * Same template the React app's onGFC alert uses.
     */
    fun buildGfcSummary(
        rec: Recommendation,
        nearestFriendlyId: String?,
        senderId: String,
        timeLocalHHmm: String,
    ): String {
        if (rec.nineLine == null || rec.munition == null) return "INSUFFICIENT DATA"
        val heading = "%03d".format(rec.nineLine.headingDeg)
        val danger = "DANGER_CLOSE" in rec.flags
        return "Engaging ${rec.targetId} at grid ${rec.nineLine.targetMgrs} with ${rec.munition.name} " +
            "on attack heading ${heading}°M. Nearest friendly ${nearestFriendlyId ?: "—"} is " +
            "${rec.nineLine.friendliesDistanceM}m ${rec.nineLine.friendliesDirection} — " +
            "${if (danger) "DANGER CLOSE, GFC initials required" else "standoff verified"}. " +
            "${rec.restrictions.size} restrictions applied. Approved by $senderId ${timeLocalHHmm}L."
    }

    /**
     * Broadcast the CoT event. TODO(SDK): wire to AtakBroadcast / CotMapComponent
     * once the SDK AAR is on classpath.
     */
    fun emit(/* cotEvent: CotEvent */ cotXml: String) {
        // TODO(SDK):
        //   val event = CotEvent.parse(cotXml) ?: return
        //   CotMapComponent.getInstance()?.dispatchCotExternal(event)
    }

    private fun escape(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("\"", "&quot;").replace("'", "&apos;")
}
