package com.jtacsim.plugin.ui

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout

// Single-select chip picker. 1:1 with React's <ChipPicker>. Used for IP/BP
// list, target list, weapon-alternative list. Multi-select variant below.

class ChipPickerView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyle: Int = 0,
) : HorizontalScrollView(context, attrs, defStyle) {

    data class Chip(val id: String, val label: String)

    private val row: LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(4, 4, 4, 4)
    }

    private var current: String? = null
    private var listener: ((String) -> Unit)? = null
    private val buttonsById = mutableMapOf<String, Button>()

    init {
        isHorizontalScrollBarEnabled = false
        addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    }

    fun setChips(chips: List<Chip>, value: String?) {
        row.removeAllViews()
        buttonsById.clear()
        current = value
        for (c in chips) {
            val btn = Button(context).apply {
                text = c.label
                textSize = 11f
                isAllCaps = false
                setPadding(20, 4, 20, 4)
                setOnClickListener { selectChip(c.id) }
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { setMargins(4, 4, 4, 4) }
            row.addView(btn, lp)
            buttonsById[c.id] = btn
        }
        applyVisualState()
    }

    fun setOnChipSelected(l: (String) -> Unit) { listener = l }

    fun setCurrent(id: String?) {
        if (current != id) {
            current = id
            applyVisualState()
        }
    }

    private fun selectChip(id: String) {
        if (current == id) return
        current = id
        applyVisualState()
        listener?.invoke(id)
    }

    private fun applyVisualState() {
        for ((id, btn) in buttonsById) {
            val on = id == current
            val bg = GradientDrawable().apply {
                cornerRadius = 14f
                setColor(if (on) Color.parseColor("#92400E") else Color.parseColor("#1E293B"))
                setStroke(1, if (on) Color.parseColor("#FBBF24") else Color.parseColor("#334155"))
            }
            btn.background = bg
            btn.setTextColor(if (on) Color.parseColor("#FEF3C7") else Color.parseColor("#CBD5E1"))
        }
    }
}
