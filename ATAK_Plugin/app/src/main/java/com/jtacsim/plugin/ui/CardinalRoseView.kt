package com.jtacsim.plugin.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.atan2
import kotlin.math.min

// Custom 8-wedge cardinal-rose view. 1:1 functional port of
// /UI/jtac-sim-react/src/components/Controls.jsx <CardinalRose>.
//
// Tap a wedge to pick a direction (N..NW). Caller subscribes via setOnDirectionChange.
// Looks ATAK-tactical: dark background, amber accent for the active wedge.

class CardinalRoseView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyle: Int = 0,
) : View(context, attrs, defStyle) {

    companion object {
        private val WEDGES = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    }

    private var current: String = "N"
    private var listener: ((String) -> Unit)? = null

    private val wedgeBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#1E293B")
        style = Paint.Style.FILL
    }
    private val wedgeBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#334155")
        style = Paint.Style.STROKE
        strokeWidth = 1.5f
    }
    private val wedgeOnPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#92400E") // amber 800
        style = Paint.Style.FILL
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#E2E8F0")
        textAlign = Paint.Align.CENTER
        textSize = 28f
        isFakeBoldText = true
    }
    private val labelOnPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FBBF24")
        textAlign = Paint.Align.CENTER
        textSize = 30f
        isFakeBoldText = true
    }
    private val centerDot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FBBF24"); style = Paint.Style.FILL
    }

    fun setDirection(dir: String) {
        if (current != dir) {
            current = dir
            invalidate()
        }
    }
    fun getDirection(): String = current

    fun setOnDirectionChange(l: (String) -> Unit) {
        listener = l
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val r = (min(width, height) / 2f) - 6f
        val rect = RectF(cx - r, cy - r, cx + r, cy + r)

        for ((i, w) in WEDGES.withIndex()) {
            // Each wedge centred on cardinal i*45°. SVG uses N=top so we offset −90°.
            val startAngle = (i * 45f) - 22.5f - 90f
            val sweep = 45f
            val on = (w == current)
            canvas.drawArc(rect, startAngle, sweep, true, if (on) wedgeOnPaint else wedgeBgPaint)
            canvas.drawArc(rect, startAngle, sweep, true, wedgeBorderPaint)
            // Place label at 70% of radius along wedge midpoint
            val midAngleRad = Math.toRadians(((i * 45f) - 90f).toDouble())
            val lx = (cx + r * 0.7f * Math.cos(midAngleRad)).toFloat()
            val ly = (cy + r * 0.7f * Math.sin(midAngleRad)).toFloat() + 10f
            canvas.drawText(w, lx, ly, if (on) labelOnPaint else labelPaint)
        }
        canvas.drawCircle(cx, cy, 4f, centerDot)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action != MotionEvent.ACTION_DOWN) return super.onTouchEvent(event)
        val cx = width / 2f
        val cy = height / 2f
        val dx = event.x - cx
        val dy = event.y - cy
        // SVG-coords-style: 0° at North. atan2(dx,-dy) gives 0=N, 90=E.
        var deg = Math.toDegrees(atan2(dx.toDouble(), -dy.toDouble()))
        if (deg < 0) deg += 360.0
        val idx = (((deg + 22.5) / 45.0).toInt()) % 8
        val picked = WEDGES[idx]
        if (picked != current) {
            current = picked
            listener?.invoke(picked)
            invalidate()
        }
        performClick()
        return true
    }

    override fun performClick(): Boolean = super.performClick()
}
