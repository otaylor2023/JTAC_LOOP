package com.jtacsim.plugin.ui

import android.content.Context
import android.util.AttributeSet
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

// Custom Stepper view. 1:1 with /UI/jtac-sim-react/src/components/Controls.jsx <Stepper>.
//
//   [ − ]  [ value · label ]  [ + ]
//
// Values are clamped to [min..max], step granularity configurable. Caller
// subscribes via setOnValueChange. Used for strikeCount and egress altitude.

class StepperView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyle: Int = 0,
) : LinearLayout(context, attrs, defStyle) {

    private var minValue = 0
    private var maxValue = 9999
    private var stepValue = 1
    private var current = 0
    private var formatter: (Int) -> String = { it.toString() }
    private var suffixText: String = ""
    private var labelText: String = ""

    private val decBtn: Button
    private val incBtn: Button
    private val valueText: TextView
    private val labelView: TextView

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(4, 4, 4, 4)

        decBtn = Button(context).apply {
            text = "−"
            textSize = 20f
            setOnClickListener { decrement() }
        }
        addView(decBtn, LayoutParams(120, 96))

        val center = LinearLayout(context).apply {
            orientation = VERTICAL
            gravity = Gravity.CENTER
        }
        valueText = TextView(context).apply {
            textSize = 18f
            setPadding(12, 0, 12, 0)
            gravity = Gravity.CENTER
        }
        labelView = TextView(context).apply {
            textSize = 11f
            gravity = Gravity.CENTER
        }
        center.addView(valueText)
        center.addView(labelView)
        val centerLp = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
        addView(center, centerLp)

        incBtn = Button(context).apply {
            text = "+"
            textSize = 20f
            setOnClickListener { increment() }
        }
        addView(incBtn, LayoutParams(120, 96))

        renderValue()
    }

    fun configure(
        min: Int = 0, max: Int = 9999, step: Int = 1, value: Int = min,
        formatter: (Int) -> String = { it.toString() },
        suffix: String = "",
        label: String = "",
    ) {
        this.minValue = min
        this.maxValue = max
        this.stepValue = step
        this.formatter = formatter
        this.suffixText = suffix
        this.labelText = label
        this.current = value.coerceIn(min, max)
        renderValue()
    }

    fun setValue(v: Int) {
        val clamped = v.coerceIn(minValue, maxValue)
        if (clamped != current) {
            current = clamped
            renderValue()
            listener?.invoke(current)
        }
    }
    fun getValue(): Int = current

    private var listener: ((Int) -> Unit)? = null
    fun setOnValueChange(l: (Int) -> Unit) { listener = l }

    private fun decrement() = setValue(current - stepValue)
    private fun increment() = setValue(current + stepValue)

    private fun renderValue() {
        valueText.text = formatter(current) + suffixText
        labelView.text = labelText
        labelView.visibility = if (labelText.isEmpty()) View.GONE else View.VISIBLE
        decBtn.isEnabled = current > minValue
        incBtn.isEnabled = current < maxValue
    }
}
