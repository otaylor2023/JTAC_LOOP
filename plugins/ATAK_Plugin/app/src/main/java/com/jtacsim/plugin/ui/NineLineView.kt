package com.jtacsim.plugin.ui

import android.view.View
import android.widget.TextView
import com.jtacsim.plugin.engine.Recommendation

// Binds a Recommendation to the sidebar layout. The layout XML is in
// res/layout/sidebar_panel.xml. View IDs are looked up by name to keep this
// class compilable without R.java being present until the SDK + Android
// resources are in place.

class NineLineView(private val root: View) {

    fun bind(rec: Recommendation) {
        val ctx = root.context
        fun id(name: String) = ctx.resources.getIdentifier(name, "id", ctx.packageName)
        fun setText(viewName: String, text: String) {
            val v = root.findViewById<TextView>(id(viewName)) ?: return
            v.text = text
        }

        setText("status_badge", rec.engageability.replace('_', ' '))
        setText("target_id", rec.targetId)

        if (rec.engageability == "NOT_ENGAGEABLE") {
            setText("block_reasons", rec.blockReasons.joinToString("\n• ", prefix = "• "))
            return
        }

        val m = rec.munition ?: return
        setText("munition_id", m.id)
        setText("munition_detail",
            "${m.name} · RED ${m.redStandingM}m · TLE ≤ ${m.tleRequiredM}m · ${m.guidance.uppercase()} · ${m.fuze} · ${m.count} on station · ${m.effectivenessRating}")

        setText("control_type", rec.controlType.replace('_', ' '))
        setText("method_of_attack", rec.methodOfAttack)
        setText("clearance_call", rec.clearanceCall)

        rec.nineLine?.let { nl ->
            setText("line_4", "${nl.targetElevationFt} ft MSL")
            setText("line_5", nl.targetDescription)
            setText("line_6", "${nl.targetMgrs} (WGS-84 · ${nl.targetTleCategory})")
            setText("line_7", nl.markValue + (nl.prfCode?.let { " · code $it" } ?: ""))
            setText("line_8", "${nl.friendliesDirection} ${nl.friendliesDistanceM} m")
            setText("line_9", nl.egressValue)
        }

        setText("flags", rec.flags.joinToString(" "))
        setText("remarks_block", rec.remarks.joinToString("\n• ", prefix = "• "))
        setText("restrictions_block", rec.restrictions.joinToString("\n• ", prefix = "• "))

        // Reasoning trace
        setText("trace_block", rec.reasoningTrace.joinToString("\n\n") {
            "[${it.status.uppercase()}] ${it.tree}\n${it.text}"
        })
    }
}
