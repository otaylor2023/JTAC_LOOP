package com.jtacsim.plugin

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.widget.TextView
import com.jtacsim.plugin.engine.*
import com.jtacsim.plugin.ui.NineLineView

// Sidebar receiver. When the JTAC taps the "9-Line" toolbar button, ATAK
// fires SHOW_PLUGIN, this receiver inflates sidebar_panel.xml, and the
// recommendation engine starts running on the live CoT feed.
//
// TODO(SDK): once SDK AAR is on the classpath:
//   - Replace stub base with com.atakmap.android.dropdown.DropDownReceiver
//   - Uncomment MapView field + DropDown lifecycle calls
//   - Hook listeners onto the MapEventDispatcher for incoming hostiles/friendlies

// import com.atakmap.android.dropdown.DropDownReceiver
// import com.atakmap.android.maps.MapView
// import android.content.Intent

class JtacDropDownReceiver /* : DropDownReceiver(view) */ (
    /* private val view: MapView, */
    private val pluginContext: Context,
) {

    companion object {
        const val SHOW_PLUGIN = "com.jtacsim.plugin.SHOW_PLUGIN"
        const val WIDTH_LANDSCAPE = 0.40   // 40% of screen width when in landscape
        const val WIDTH_PORTRAIT  = 1.00   // full width in portrait
        const val HEIGHT_LANDSCAPE = 1.00
        const val HEIGHT_PORTRAIT = 0.55
    }

    private var nineLineView: NineLineView? = null
    private var rootView: View? = null

    /** Demo state — replace with live CoT subscriptions once SDK is wired. */
    private val demoState: TacticalState = buildDemoState()

    /**
     * Called by ATAK when the SHOW_PLUGIN intent fires. Inflate the sidebar.
     */
    fun onReceive(context: Context /*, intent: Intent */) {
        val inflater = LayoutInflater.from(pluginContext)
        // val layoutId = pluginContext.resources.getIdentifier("sidebar_panel", "layout", pluginContext.packageName)
        // rootView = inflater.inflate(layoutId, null)

        // showDropDown(rootView, WIDTH_LANDSCAPE, HEIGHT_LANDSCAPE,
        //              WIDTH_PORTRAIT, HEIGHT_PORTRAIT, false)

        // Wire the recommendation engine into the view.
        rootView?.let { v ->
            nineLineView = NineLineView(v).also { nlv ->
                val rec = DecisionTree.recommend(demoState)
                nlv.bind(rec)
            }
        }
    }

    fun onDropDownClose() {
        nineLineView = null
        rootView = null
    }

    /** Build a demo TacticalState for end-to-end testing without live CoT. */
    private fun buildDemoState(): TacticalState = TacticalState(
        hostiles = listOf(
            Hostile(
                id = "TGT.2.201451", lat = 31.4815, lng = 64.2720,
                description = "Light skinned vehicle (technical) with mounted weapon",
                targetClass = "vehicle_wheeled_soft",
                movementState = "stationary",
                cnnConfidence = 0.94,
                tleCategory = "CAT_III",
                elevationM = 380,
            ),
        ),
        friendlies = listOf(
            Friendly("F.2.202018", 31.4804, 64.2743, exposure = "dug-in", axisOrientationDeg = 45),
        ),
        primaryTargetId = "TGT.2.201451",
        aircraft = Aircraft(
            platform = "F-16",
            loadout = mapOf(
                "GBU-12" to 2, "GBU-38" to 4, "GBU-39" to 8, "gun_20mm" to 510,
            ),
        ),
        weather = Weather(cloudCeilingFt = 12000, visibilityM = 10000, windKts = 8),
        roe = ROE(
            approvedCategories = setOf(
                "vehicle_wheeled_soft", "vehicle_wheeled_soft_moving",
                "vehicle_tracked_light", "vehicle_tracked_armor",
                "personnel_open", "personnel_concentrated", "personnel_dug_in",
                "structure_soft", "structure_hardened",
            ),
        ),
    )
}
