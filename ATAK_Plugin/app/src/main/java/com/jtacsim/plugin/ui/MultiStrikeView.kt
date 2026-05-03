package com.jtacsim.plugin.ui

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.jtacsim.plugin.cot.CotEmitter
import com.jtacsim.plugin.data.AIRCRAFT_ON_STATION
import com.jtacsim.plugin.engine.DecisionTree
import com.jtacsim.plugin.engine.Geo
import com.jtacsim.plugin.state.JtacState
import com.jtacsim.plugin.state.Screen
import kotlin.math.min

// Multi-strike wizard. 1:1 with StrikeSequence.jsx.
//
// Flow:
//   1. Stepper picks total strike count (1..hostiles.size).
//   2. EngagementSummary card shows aircraft + coordination + target spread +
//      munition tally + a color-coded coordination hint.
//   3. Per-strike StrikeDetail block walks the JTAC through each step's
//      9-line. Each step has a status (pending / reviewed / denied).
//   4. Footer has prev / next / deny while any step is pending; once every
//      step is acted on, footer collapses to a single "SEND N 9-LINES" button.
//
// Engine work is delegated to DecisionTree.recommendSequence + autoPrioritize.

class MultiStrikeView(
    private val root: View,
    private val state: JtacState,
) {
    enum class Status { PENDING, REVIEWED, DENIED }

    private val ctx: Context = root.context

    // Wizard local state
    private var strikeCount: Int = min(state.hostiles.size, 2).coerceAtLeast(1)
    private var currentIdx: Int = 0
    private var statuses: MutableList<Status> = mutableListOf()
    private var sequence: DecisionTree.StrikeSequenceResult? = null

    init {
        ensureStatusesLength()
        recompute()
    }

    private fun id(name: String): Int = ctx.resources.getIdentifier(name, "id", ctx.packageName)
    private fun <T : View> findByName(name: String): T? = root.findViewById(id(name))

    fun render() {
        val maxStrikes = state.hostiles.size.coerceAtLeast(1)
        if (strikeCount > maxStrikes) strikeCount = maxStrikes
        ensureStatusesLength()
        recompute()
        bindHeader()
        bindStrikeCountStepper(maxStrikes)
        bindEngagementSummary()
        bindProgressDots()
        bindCurrentStep()
        bindFooter()
    }

    private fun ensureStatusesLength() {
        while (statuses.size < strikeCount) statuses += Status.PENDING
        while (statuses.size > strikeCount) statuses.removeAt(statuses.size - 1)
        if (currentIdx >= strikeCount) currentIdx = strikeCount - 1
        if (currentIdx < 0) currentIdx = 0
    }

    private fun recompute() {
        if (state.hostiles.isEmpty()) { sequence = null; return }
        val order = DecisionTree.autoPrioritize(state.hostiles)
        val targetIds = order.take(strikeCount)
        val ts = state.toTacticalState()
        sequence = DecisionTree.recommendSequence(ts, targetIds)
    }

    // ── Header ────────────────────────────────────────────────────────
    private fun bindHeader() {
        findByName<TextView>("ms_title")?.text = "MULTI-STRIKE"
        findByName<Button>("ms_back")?.setOnClickListener {
            state.setScreen(Screen.MAP)
        }
    }

    // ── Strike-count stepper ──────────────────────────────────────────
    private fun bindStrikeCountStepper(maxStrikes: Int) {
        findByName<StepperView>("ms_strike_count_stepper")?.apply {
            configure(
                min = 1, max = maxStrikes, step = 1,
                value = strikeCount,
                formatter = { v -> "$v strike${if (v == 1) "" else "s"}" },
                label = "of $maxStrikes hostile${if (maxStrikes == 1) "" else "s"} on feed",
            )
            setOnValueChange { v ->
                strikeCount = v
                statuses = MutableList(v) { Status.PENDING }
                currentIdx = currentIdx.coerceAtMost(v - 1).coerceAtLeast(0)
                render()
            }
        }
    }

    // ── Engagement summary card ───────────────────────────────────────
    private fun bindEngagementSummary() {
        val seq = sequence ?: return
        findByName<TextView>("eng_aircraft")?.text = AIRCRAFT_ON_STATION.platform
        val isSingle = strikeCount <= 1
        findByName<TextView>("eng_coordination")?.text = if (isSingle)
            "Single 9-line"
        else
            "$strikeCount passes · separate 9-lines"

        // Target spread
        val coord = computeCoord(strikeCount)
        findByName<TextView>("eng_spread")?.apply {
            visibility = if (isSingle) View.GONE else View.VISIBLE
            text = "${coord.spreadM} m"
        }
        findByName<View>("eng_spread_row")?.visibility = if (isSingle) View.GONE else View.VISIBLE

        // Munitions tally
        val tally = seq.munitionsExpended.entries.joinToString(" · ") { "${it.key}×${it.value}" }
            .ifEmpty { "—" }
        findByName<TextView>("eng_munitions")?.text = tally

        // Coordination hint
        val hint = findByName<TextView>("eng_coord_hint") ?: return
        if (isSingle) { hint.visibility = View.GONE; return }
        hint.visibility = View.VISIBLE
        hint.text = "${coord.label} — ${coord.detail}"
        val bg = GradientDrawable().apply {
            cornerRadius = 8f
            setColor(if (coord.recommended == "type_3") Color.parseColor("#1E3A5F")
                    else Color.parseColor("#1F2937"))
            setStroke(1, Color.parseColor("#475569"))
        }
        hint.background = bg
        hint.setTextColor(if (coord.recommended == "type_3")
            Color.parseColor("#A7F3D0") else Color.parseColor("#FCD34D"))
    }

    private data class Coord(val spreadM: Int, val recommended: String, val label: String, val detail: String)

    private fun computeCoord(count: Int): Coord {
        if (count < 2) return Coord(0, "type_2", "Single", "Single 9-line")
        val order = DecisionTree.autoPrioritize(state.hostiles).take(count)
        val targets = order.mapNotNull { id -> state.hostiles.firstOrNull { it.id == id } }
        var maxSpread = 0.0
        for (i in targets.indices) for (j in i + 1 until targets.size) {
            val d = Geo.distanceM(targets[i].lat, targets[i].lng, targets[j].lat, targets[j].lng)
            if (d > maxSpread) maxSpread = d
        }
        val spreadM = maxSpread.toInt()
        return when {
            spreadM <= 500 -> Coord(spreadM, "type_3", "Type 3 viable",
                "Tight cluster — one CLEARED TO ENGAGE could cover all strikes")
            spreadM <= 1500 -> Coord(spreadM, "type_2", "Sequential preferred",
                "Borderline spread — separate 9-lines safer than Type 3")
            else -> Coord(spreadM, "type_2", "Sequential Type 2",
                "Targets dispersed — separate 9-lines per strike")
        }
    }

    // ── Progress dots ─────────────────────────────────────────────────
    private fun bindProgressDots() {
        val container = findByName<LinearLayout>("ms_progress_dots") ?: return
        container.removeAllViews()
        for (i in 0 until strikeCount) {
            val dot = View(ctx).apply {
                val color = when {
                    i == currentIdx -> Color.parseColor("#FBBF24")
                    statuses[i] == Status.REVIEWED -> Color.parseColor("#34D399")
                    statuses[i] == Status.DENIED -> Color.parseColor("#F87171")
                    else -> Color.parseColor("#475569")
                }
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL; setColor(color)
                }
            }
            val lp = LinearLayout.LayoutParams(20, 20).apply { setMargins(6, 0, 6, 0) }
            container.addView(dot, lp)
        }
        findByName<TextView>("ms_progress_text")?.text = "${currentIdx + 1} of $strikeCount"
    }

    // ── Current step's StrikeDetail ───────────────────────────────────
    private fun bindCurrentStep() {
        val seq = sequence ?: return
        val step = seq.steps.getOrNull(currentIdx) ?: return
        findByName<TextView>("strike_step_label")?.text = "Strike ${currentIdx + 1} of $strikeCount"

        // Status pill
        val pill = findByName<TextView>("strike_status_pill")
        val s = statuses[currentIdx]
        if (s == Status.PENDING) pill?.visibility = View.GONE
        else {
            pill?.visibility = View.VISIBLE
            pill?.text = if (s == Status.REVIEWED) "✓ REVIEWED" else "✗ DENIED"
            val bg = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(if (s == Status.REVIEWED) Color.parseColor("#064E3B") else Color.parseColor("#7F1D1D"))
            }
            pill?.background = bg
            pill?.setTextColor(Color.parseColor("#FEF3C7"))
        }

        if (step.skipped) {
            findByName<TextView>("strike_detail_block")?.text =
                "SKIPPED · ${step.targetId}\n${step.skipReason ?: ""}"
            return
        }
        val rec = step.recommendation ?: return
        if (rec.engageability == "NOT_ENGAGEABLE") {
            findByName<TextView>("strike_detail_block")?.text = buildString {
                append("⚠ BLOCKED · ${rec.targetId}\n")
                rec.blockReasons.forEach { append("• $it\n") }
                append("\nFlags: ${rec.flags.joinToString(", ").ifEmpty { "none" }}")
            }
            return
        }
        val m = rec.munition!!
        val nl = rec.nineLine!!
        findByName<TextView>("strike_detail_block")?.text = buildString {
            // Header
            append("${rec.targetId} · ${state.hostiles.firstOrNull { it.id == rec.targetId }?.targetClass?.replace('_',' ') ?: ""} · ")
            append("${((state.hostiles.firstOrNull { it.id == rec.targetId }?.cnnConfidence ?: 0.0) * 100).toInt()}% conf\n\n")

            append("GAME PLAN\n")
            append("  Munition: ${m.id} · RED ${m.redStandingM}m · ${m.guidance.uppercase()}\n")
            append("  Type:     ${rec.controlType.replace('_',' ')} · ${rec.methodOfAttack}\n")
            append("  Call:     ${rec.clearanceCall}\n")
            append("  Effect:   ${m.effectivenessRating} vs ${rec.targetId}\n\n")

            if (rec.flags.isNotEmpty())
                append("Flags: ${rec.flags.joinToString(" ") { it.replace('_',' ') }}\n\n")

            append("9-LINE\n")
            append("  L1 IP/BP    ${nl.ipBp}\n")
            append("  L2 Heading  %03d°M\n".format(nl.headingDeg))
            append("  L3 Distance ${nl.distanceNm} NM\n")
            append("  L4 Elev     ${nl.targetElevationFt} ft MSL  (READBACK)\n")
            append("  L5 Tgt      ${nl.targetDescription}\n")
            append("  L6 Loc      ${nl.targetMgrs}  (READBACK)\n")
            append("  L7 Mark     ${nl.markValue}${nl.prfCode?.let { " (PRF $it)" } ?: ""}\n")
            append("  L8 Frnd     ${nl.friendliesDirection} ${nl.friendliesDistanceM}m\n")
            append("  L9 Egress   ${nl.egressValue}\n")

            if (rec.restrictions.isNotEmpty()) {
                append("\nRESTRICTIONS · MANDATORY READBACK\n")
                rec.restrictions.forEach { append("  • $it\n") }
            }

            append("\nAt this step: ${step.remainingHostiles} hostile${if (step.remainingHostiles == 1) "" else "s"} remaining · ")
            append(step.loadoutSnapshot.entries.joinToString(" · ") { "${it.key}:${it.value}" })
        }
    }

    // ── Footer (prev / next / deny → send) ────────────────────────────
    private fun bindFooter() {
        val allActed = statuses.all { it != Status.PENDING }
        val prevBtn = findByName<Button>("wf_prev")
        val nextBtn = findByName<Button>("wf_next")
        val denyBtn = findByName<Button>("wf_deny")
        val sendBtn = findByName<Button>("wf_send")

        if (!allActed) {
            prevBtn?.visibility = View.VISIBLE
            nextBtn?.visibility = View.VISIBLE
            denyBtn?.visibility = View.VISIBLE
            sendBtn?.visibility = View.GONE

            prevBtn?.isEnabled = currentIdx > 0
            prevBtn?.setOnClickListener { if (currentIdx > 0) { currentIdx--; render() } }

            nextBtn?.text = if (currentIdx == strikeCount - 1) "CONFIRM ✓" else "NEXT →"
            nextBtn?.setOnClickListener {
                statuses[currentIdx] = Status.REVIEWED
                if (currentIdx < strikeCount - 1) currentIdx++
                render()
            }

            val cur = statuses[currentIdx]
            denyBtn?.text = if (cur == Status.DENIED) "↶ undo" else "✗ deny"
            denyBtn?.setOnClickListener {
                statuses[currentIdx] = if (cur == Status.DENIED) Status.PENDING else Status.DENIED
                render()
            }
        } else {
            prevBtn?.visibility = View.GONE
            nextBtn?.visibility = View.GONE
            denyBtn?.visibility = View.GONE
            val reviewedCount = statuses.count { it == Status.REVIEWED }
            sendBtn?.visibility = View.VISIBLE
            sendBtn?.text = "📡 SEND $reviewedCount 9-LINE${if (reviewedCount == 1) "" else "S"}"
            sendBtn?.isEnabled = reviewedCount > 0
            sendBtn?.setOnClickListener { onSend() }
        }
    }

    private fun onSend() {
        val seq = sequence ?: return
        val approvedSteps = seq.steps.filterIndexed { i, _ -> i < statuses.size && statuses[i] == Status.REVIEWED }
        val now = java.time.Instant.now().toString()
        val xmls = approvedSteps.mapNotNull { st ->
            val rec = st.recommendation ?: return@mapNotNull null
            CotEmitter.buildNineLineCot(
                rec, state.selfId, now, state.prfCode, state.egressAltFt, state.additionalRemarks
            )
        }
        xmls.forEach { CotEmitter.emit(it) }

        val msg = buildString {
            append("${approvedSteps.size} 9-LINE${if (approvedSteps.size == 1) "" else "S"} QUEUED\n\n")
            if (seq.chainBroken) append("CHAIN BROKEN — review before transmission\n\n")
            approvedSteps.forEachIndexed { i, s ->
                append("9-Line ${i + 1}: ${s.targetId} → ${s.recommendation?.munition?.id ?: "—"}\n")
            }
        }
        try {
            android.app.AlertDialog.Builder(ctx).setTitle("MULTI-STRIKE SENT")
                .setMessage(msg).setPositiveButton("OK") { d, _ ->
                    d.dismiss(); state.setScreen(Screen.MAP)
                }.show()
        } catch (_: Throwable) {
            android.util.Log.i("JtacPlugin", msg)
            state.setScreen(Screen.MAP)
        }
    }
}
