package com.jtacsim.plugin.ui

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.jtacsim.plugin.cot.CotEmitter
import com.jtacsim.plugin.data.NAMED_IPS
import com.jtacsim.plugin.data.RATIONALE
import com.jtacsim.plugin.engine.Recommendation
import com.jtacsim.plugin.state.JtacState
import com.jtacsim.plugin.state.Screen

// Single-strike side-panel binding. 1:1 with NineLineForm.jsx.
//
// Wires:
//   • Header: title + status badge (BLOCKED / ENGAGEABLE / SELF DEFENSE).
//   • Flag bar (each flag chip).
//   • OPT A / OPT B radio cards — primary engine pick vs first alternative.
//     OPT A retains its naturalPrimary so it stays labeled even after the
//     JTAC switches to OPT B.
//   • Game-plan section: target chip-picker (primary target swap), Control/MOA
//     editable readout, weapon detail line with rationale "i" button.
//   • CAS 9-line: every numbered line is editable via TacInput overrides.
//     Line 1 has IP chips (clicking sets userHeading via Geo.bearingDeg).
//     Line 2 heading auto-updates from map drag handle.
//     Line 7 mark; if laser, exposes PRF stepper (1111..8888 step 1).
//     Line 9 Egress: cardinal rose + altitude stepper.
//   • Engine remarks + restrictions blocks (read-only lines).
//   • Free-form additional remarks textarea.
//   • Reasoning trace expandable (TextView toggled).
//   • Footer: Send 9-line + GFC summary (when not blocked).

class NineLineView(
    private val root: View,
    private val state: JtacState,
) {

    private val ctx: Context = root.context

    // Local override map mirrors React `overrides` — only fields the JTAC
    // typed take precedence over engine values for that field.
    private val overrides = mutableMapOf<String, String>()

    // Cached engine-natural primary so OPT A keeps showing the engine pick
    // even when the JTAC has selected OPT B.
    private var naturalPrimaryId: String? = null
    private var naturalPrimaryRedM: Int = 0
    private var naturalPrimaryRating: String = ""

    private fun id(name: String): Int =
        ctx.resources.getIdentifier(name, "id", ctx.packageName)

    private fun <T : View> findByName(name: String): T? = root.findViewById(id(name))

    fun bind(rec: Recommendation) {
        bindHeader(rec)
        bindOptCards(rec)
        bindBlockBanner(rec)
        bindFlagBar(rec)
        bindGamePlan(rec)
        bindNineLineFields(rec)
        bindRemarksRestrictions(rec)
        bindAdditionalRemarks()
        bindReasoningTrace(rec)
        bindFooter(rec)
    }

    // ── Header ────────────────────────────────────────────────────────
    private fun bindHeader(rec: Recommendation) {
        findByName<TextView>("status_badge")?.apply {
            text = if (rec.engageability == "NOT_ENGAGEABLE") "BLOCKED"
                   else rec.engageability.replace('_', ' ')
            val bg = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(
                    when {
                        rec.engageability == "NOT_ENGAGEABLE" -> Color.parseColor("#7F1D1D")
                        rec.engageability == "SELF_DEFENSE_OVERRIDE" -> Color.parseColor("#1E3A5F")
                        else -> Color.parseColor("#92400E")
                    }
                )
            }
            background = bg
            setTextColor(Color.parseColor("#FEF3C7"))
        }
        findByName<Button>("nl_back")?.setOnClickListener {
            state.setScreen(Screen.MAP)
        }
    }

    // ── OPT A / OPT B radio cards ────────────────────────────────────
    private fun bindOptCards(rec: Recommendation) {
        val cardA = findByName<LinearLayout>("opt_a_card") ?: return
        val cardB = findByName<LinearLayout>("opt_b_card") ?: return
        val blocked = rec.engageability == "NOT_ENGAGEABLE"
        if (blocked || rec.munition == null) {
            cardA.visibility = View.GONE
            cardB.visibility = View.GONE
            return
        }
        cardA.visibility = View.VISIBLE
        cardB.visibility = View.VISIBLE

        val m = rec.munition
        val altA_active = state.weaponOverride == null
        val altB = rec.alternatives.firstOrNull()
        val altB_active = state.weaponOverride != null && altB?.id == state.weaponOverride

        // Cache natural primary (for the case where the JTAC just switched to B).
        if (state.weaponOverride == null) {
            naturalPrimaryId = m.id
            naturalPrimaryRedM = m.redStandingM
            naturalPrimaryRating = m.effectivenessRating
        }

        findByName<TextView>("opt_a_label")?.text = "A · Primary"
        findByName<TextView>("opt_a_weapon")?.text = if (altA_active) m.id else (naturalPrimaryId ?: "—")
        findByName<TextView>("opt_a_meta")?.text = if (altA_active)
            "RED ${m.redStandingM}m · ${m.effectivenessRating}"
        else if (naturalPrimaryId != null)
            "RED ${naturalPrimaryRedM}m · $naturalPrimaryRating"
        else "engine pick"
        applyOptCardVisualState(cardA, altA_active)
        cardA.setOnClickListener { state.setWeaponOverride(null) }

        findByName<TextView>("opt_b_label")?.text = "B · Alternate"
        if (altB != null) {
            findByName<TextView>("opt_b_weapon")?.text = altB.id
            findByName<TextView>("opt_b_meta")?.text =
                if (altB_active) "${altB.rating} · RED ${m.redStandingM}m" else altB.rating
            cardB.isEnabled = true
            cardB.alpha = 1.0f
            cardB.setOnClickListener { state.setWeaponOverride(altB.id) }
        } else {
            findByName<TextView>("opt_b_weapon")?.text = "—"
            findByName<TextView>("opt_b_meta")?.text = "no alternative"
            cardB.isEnabled = false
            cardB.alpha = 0.5f
            cardB.setOnClickListener(null)
        }
        applyOptCardVisualState(cardB, altB_active)
    }

    private fun applyOptCardVisualState(card: LinearLayout, on: Boolean) {
        val bg = GradientDrawable().apply {
            cornerRadius = 8f
            setColor(if (on) Color.parseColor("#1E3A5F") else Color.parseColor("#1E293B"))
            setStroke(2, if (on) Color.parseColor("#FBBF24") else Color.parseColor("#334155"))
        }
        card.background = bg
    }

    // ── Block banner / flag bar ───────────────────────────────────────
    private fun bindBlockBanner(rec: Recommendation) {
        val banner = findByName<LinearLayout>("block_banner") ?: return
        if (rec.engageability != "NOT_ENGAGEABLE") {
            banner.visibility = View.GONE
            return
        }
        banner.visibility = View.VISIBLE
        findByName<TextView>("block_reasons")?.text =
            rec.blockReasons.joinToString("\n• ", prefix = "• ")
        findByName<TextView>("block_flags")?.text = rec.flags.joinToString("  ")
    }

    private fun bindFlagBar(rec: Recommendation) {
        findByName<TextView>("flags")?.apply {
            visibility = if (rec.flags.isNotEmpty() && rec.engageability != "NOT_ENGAGEABLE")
                View.VISIBLE else View.GONE
            text = rec.flags.joinToString("  ") { it.replace('_', ' ') }
        }
    }

    // ── Game-plan section ─────────────────────────────────────────────
    private fun bindGamePlan(rec: Recommendation) {
        // Target chip picker
        findByName<ChipPickerView>("target_chip_picker")?.apply {
            val chips = state.hostiles.map { ChipPickerView.Chip(it.id, it.id.removePrefix("TGT.")) }
            setChips(chips, rec.targetId)
            setOnChipSelected { state.setPrimaryTarget(it) }
        }
        findByName<TextView>("target_id")?.text = rec.targetId
        findByName<TextView>("target_sub")?.text = run {
            val tgt = state.hostiles.firstOrNull { it.id == rec.targetId }
            val cls = tgt?.targetClass?.replace('_', ' ') ?: ""
            val conf = tgt?.cnnConfidence?.let { "${(it * 100).toInt()}% conf" } ?: ""
            "$conf · $cls"
        }
        findByName<View>("target_why")?.setOnClickListener { showRationale("target") }

        // Control · MOA editable readout
        val controlMoaText = "${rec.controlType.replace('_', ' ')} · ${rec.methodOfAttack}"
        bindEditable("control_moa", "controlMOA", controlMoaText)
        findByName<TextView>("clearance_call")?.text = rec.clearanceCall

        // Weapon detail line
        val m = rec.munition
        val weaponDetail = if (m != null) {
            "${m.name} · ${m.guidance.uppercase()} · ${m.fuze} · ${m.count} on station · TLE ≤ ${m.tleRequiredM}m"
        } else "—"
        findByName<TextView>("weapon_detail")?.text = weaponDetail
        findByName<View>("weapon_why")?.setOnClickListener { showRationale("weapon") }
    }

    // ── 9-Line numbered fields ────────────────────────────────────────
    private fun bindNineLineFields(rec: Recommendation) {
        if (rec.engageability == "NOT_ENGAGEABLE" || rec.nineLine == null) {
            findByName<View>("nine_line_section")?.visibility = View.GONE
            return
        }
        findByName<View>("nine_line_section")?.visibility = View.VISIBLE
        val nl = rec.nineLine

        // Line 1 — IP/BP (chip picker + editable)
        findByName<ChipPickerView>("ip_chip_picker")?.apply {
            val chips = NAMED_IPS.map { ChipPickerView.Chip(it.id, it.label) }
            setChips(chips, state.ipId)
            setOnChipSelected { picked ->
                state.setIpById(picked)
                overrides["ip"] = picked
                findByName<EditText>("line_1_input")?.setText(picked)
            }
        }
        bindEditable("line_1_input", "ip", state.ipId)

        // Line 2 — Heading
        val headingStr = "%03d°M".format(nl.headingDeg)
        bindEditable("line_2_input", "heading", headingStr)
        findByName<View>("line_2_why")?.setOnClickListener { showRationale("vector") }

        // Line 3 — Distance
        bindEditable("line_3_input", "distance", "${nl.distanceNm} NM")

        // Line 4 — Target Elevation (READBACK)
        bindEditable("line_4_input", "elev", "${nl.targetElevationFt} ft MSL")

        // Line 5 — Target Description
        bindEditable("line_5_input", "desc", nl.targetDescription)

        // Line 6 — Target Location (READBACK)
        bindEditable("line_6_input", "loc", nl.targetMgrs)
        findByName<TextView>("line_6_sub")?.text = "MGRS · WGS-84 · ${nl.targetTleCategory}"

        // Line 7 — Mark
        bindEditable("line_7_input", "mark", nl.markValue)
        val isLaser = nl.markType == "laser"
        findByName<View>("prf_block")?.visibility = if (isLaser) View.VISIBLE else View.GONE
        if (isLaser) {
            findByName<EditText>("prf_input")?.apply {
                setText("%04d".format(state.prfCode))
                setOnFocusChangeListener { _, hasFocus ->
                    if (!hasFocus) {
                        val n = text.toString().toIntOrNull()
                        if (n != null) state.setPrfCode(n)
                    }
                }
            }
            findByName<Button>("prf_minus")?.setOnClickListener {
                val n = (state.prfCode - 1).coerceAtLeast(1111)
                state.setPrfCode(n)
                findByName<EditText>("prf_input")?.setText("%04d".format(n))
            }
            findByName<Button>("prf_plus")?.setOnClickListener {
                val n = (state.prfCode + 1).coerceAtMost(8888)
                state.setPrfCode(n)
                findByName<EditText>("prf_input")?.setText("%04d".format(n))
            }
        }

        // Line 8 — Friendlies
        bindEditable("line_8_input", "frnd", "${nl.friendliesDirection} ${nl.friendliesDistanceM} m")

        // Line 9 — Egress (cardinal rose + altitude stepper + free text)
        val effectiveEgress = state.egressDir ?: nl.egressDirection
        findByName<CardinalRoseView>("egress_rose")?.apply {
            setDirection(effectiveEgress)
            setOnDirectionChange { dir ->
                state.setEgressDir(dir)
                overrides["egressDir"] = dir
                findByName<EditText>("line_9_input")?.setText(
                    "Egress $dir, climb to ${"%,d".format(state.egressAltFt)} ft MSL")
            }
        }
        findByName<StepperView>("egress_alt_stepper")?.apply {
            configure(
                min = 500, max = 25000, step = 500,
                value = state.egressAltFt,
                formatter = { v -> "%,d".format(v) },
                suffix = " ft MSL",
                label = "Altitude",
            )
            setOnValueChange { v ->
                state.setEgressAlt(v)
                findByName<EditText>("line_9_input")?.setText(
                    "Egress $effectiveEgress, climb to ${"%,d".format(v)} ft MSL")
            }
        }
        bindEditable(
            "line_9_input", "egress",
            "Egress $effectiveEgress, climb to ${"%,d".format(state.egressAltFt)} ft MSL"
        )
    }

    // ── Engine-generated remarks + restrictions ──────────────────────
    private fun bindRemarksRestrictions(rec: Recommendation) {
        val rblock = findByName<TextView>("remarks_block") ?: return
        if (rec.remarks.isEmpty()) {
            findByName<View>("remarks_wrap")?.visibility = View.GONE
        } else {
            findByName<View>("remarks_wrap")?.visibility = View.VISIBLE
            rblock.text = rec.remarks.joinToString("\n• ", prefix = "• ")
        }
        val resblock = findByName<TextView>("restrictions_block") ?: return
        if (rec.restrictions.isEmpty()) {
            findByName<View>("restrictions_wrap")?.visibility = View.GONE
        } else {
            findByName<View>("restrictions_wrap")?.visibility = View.VISIBLE
            resblock.text = rec.restrictions.joinToString("\n• ", prefix = "• ")
        }
    }

    // ── Free-form additional remarks ─────────────────────────────────
    private fun bindAdditionalRemarks() {
        val et = findByName<EditText>("additional_remarks") ?: return
        if (et.text.toString() != state.additionalRemarks) {
            et.setText(state.additionalRemarks)
        }
        et.removeTextChangedListener(addRemarksWatcher)
        et.addTextChangedListener(addRemarksWatcher)
    }
    private val addRemarksWatcher = object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(s: Editable?) {
            state.setAdditionalRemarks(s?.toString().orEmpty())
        }
    }

    // ── Reasoning trace expandable ────────────────────────────────────
    private fun bindReasoningTrace(rec: Recommendation) {
        val toggle = findByName<TextView>("trace_summary") ?: return
        val body = findByName<TextView>("trace_body") ?: return
        toggle.text = "How the model decided (${rec.reasoningTrace.size} steps) ▾"
        body.text = rec.reasoningTrace.joinToString("\n\n") {
            "[${it.status.uppercase()}] ${it.tree}\n${it.text}"
        }
        toggle.setOnClickListener {
            val expanded = body.visibility == View.VISIBLE
            body.visibility = if (expanded) View.GONE else View.VISIBLE
            toggle.text = "How the model decided (${rec.reasoningTrace.size} steps) " +
                if (expanded) "▾" else "▴"
        }
    }

    // ── Footer (Send + GFC) ───────────────────────────────────────────
    private fun bindFooter(rec: Recommendation) {
        val sendBtn = findByName<Button>("btn_send_9line")
        val gfcBtn = findByName<Button>("btn_gfc_summary")
        val blocked = rec.engageability == "NOT_ENGAGEABLE"
        sendBtn?.visibility = if (blocked) View.GONE else View.VISIBLE
        gfcBtn?.visibility = if (blocked) View.GONE else View.VISIBLE
        sendBtn?.setOnClickListener { onSend(rec) }
        gfcBtn?.setOnClickListener { onGfc(rec) }
    }

    private fun onSend(rec: Recommendation) {
        val nowIsoZ = java.time.Instant.now().toString()
        val xml = CotEmitter.buildNineLineCot(
            rec = rec,
            senderUid = state.selfId,
            approvalTimeIsoZ = nowIsoZ,
            prfCode = state.prfCode,
            egressAltFt = state.egressAltFt,
            additionalRemarks = state.additionalRemarks,
        )
        // TODO(SDK): CotEmitter.emit broadcasts via AtakBroadcast once SDK is wired.
        CotEmitter.emit(xml)
        showSentOverlay(rec)
    }

    private fun onGfc(rec: Recommendation) {
        val nearestId = state.friendlies.firstOrNull()?.id
        val timeHHmm = java.time.LocalTime.now().toString().take(5)
        val summary = CotEmitter.buildGfcSummary(
            rec = rec, nearestFriendlyId = nearestId, senderId = state.selfId,
            timeLocalHHmm = timeHHmm,
        )
        showAlert("GFC SUMMARY TRANSMITTED", summary)
    }

    // ── Helpers ───────────────────────────────────────────────────────
    private fun bindEditable(viewName: String, key: String, defaultValue: String) {
        val et = findByName<EditText>(viewName) ?: return
        val current = overrides[key] ?: defaultValue
        if (et.text.toString() != current) et.setText(current)
        et.tag?.let { (it as? TextWatcher)?.let { w -> et.removeTextChangedListener(w) } }
        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                overrides[key] = s?.toString().orEmpty()
            }
        }
        et.addTextChangedListener(watcher)
        et.tag = watcher
    }

    private fun showRationale(type: String) {
        val r = RATIONALE[type] ?: return
        showAlert(r.title, "${r.text}\n\nRef: ${r.ref}")
    }

    private fun showSentOverlay(rec: Recommendation) {
        val nl = rec.nineLine ?: return
        val heading = nl.headingDeg
        val fahLo = ((heading - 15) + 360) % 360
        val fahHi = (heading + 15) % 360
        val msg = buildString {
            append("✅ 9-LINE SENT — Transmitted to GFC for approval.\n\n")
            append("TGT: ${rec.targetId}\n")
            append("WPN: ${rec.munition?.name ?: "—"}\n")
            append("HDG: %03d°M · FAH %03d°-%03d°\n".format(heading, fahLo, fahHi))
            append("FRDLY: ${nl.friendliesDirection} ${nl.friendliesDistanceM}m\n")
            append("CTRL: ${rec.controlType.replace('_', ' ')} · ${rec.methodOfAttack}\n")
        }
        showAlert("9-LINE SENT", msg) {
            state.setScreen(Screen.MAP)
        }
    }

    private fun showAlert(title: String, message: String, onClose: (() -> Unit)? = null) {
        try {
            val builder = android.app.AlertDialog.Builder(ctx)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("OK") { d, _ ->
                    d.dismiss()
                    onClose?.invoke()
                }
            builder.show()
        } catch (_: Throwable) {
            // ATAK plugin contexts can be a wrapped one — fall back gracefully.
            android.util.Log.i("JtacPlugin", "$title — $message")
            onClose?.invoke()
        }
    }
}

