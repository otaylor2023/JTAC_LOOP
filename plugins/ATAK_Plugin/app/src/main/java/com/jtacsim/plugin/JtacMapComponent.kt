package com.jtacsim.plugin

// Requires ATAK-CIV SDK on classpath via app/libs/main.aar
//
// MapComponent owns the canonical JtacState, the dropdown receiver, the
// toolbar tool, the CoT listener, and the map-overlay manager. All view
// updates flow through here:
//
//     state mutates  ───►  computeRecommendation()  ───►  StateListener fan-out
//                                                    ├──► NineLineView.bind()
//                                                    ├──► MultiStrikeView.render()
//                                                    └──► MapOverlayManager.render()
//
// 1:1 with the React App.jsx top-level state and the useAIRecommendation hook.

import android.content.Context
import android.content.Intent
import com.jtacsim.plugin.cot.CotListener
import com.jtacsim.plugin.engine.Recommendation
import com.jtacsim.plugin.state.JtacState
import com.jtacsim.plugin.state.Screen
import com.jtacsim.plugin.state.StateListener
import com.jtacsim.plugin.ui.MapOverlayManager

// import com.atakmap.android.maps.AbstractMapComponent
// import com.atakmap.android.maps.MapView
// import com.atakmap.android.ipc.AtakBroadcast

class JtacMapComponent /* : AbstractMapComponent() */ : StateListener {

    val state: JtacState = JtacState()
    val cotListener: CotListener = CotListener(state)
    val mapOverlayManager: MapOverlayManager = MapOverlayManager(/* mapView, */ state)

    private var dropDown: JtacDropDownReceiver? = null
    private var tool: JtacTool? = null

    /**
     * Called once when ATAK loads the plugin.
     */
    fun onCreate(context: Context, intent: Intent? /*, view: MapView */) {
        // Listen to state mutations (re-render map + push to view bindings).
        state.addListener(this)

        // Wire the map overlay layer.
        mapOverlayManager.attach()
        mapOverlayManager.onHostileTapped = { id ->
            // Tapping a hostile marker promotes it to primary AND opens the
            // 9-line panel — same as React's onSelectHostile in App.jsx.
            state.setPrimaryTarget(id)
            state.setScreen(Screen.NINE_LINE)
        }
        mapOverlayManager.onHeadingChanged = { deg ->
            state.setUserHeading(deg)
        }

        // Build the dropdown receiver and toolbar tool.
        dropDown = JtacDropDownReceiver(/* view, */ context, this)
        tool = JtacTool(context /*, view */)

        // TODO(SDK):
        //   val filter = android.content.IntentFilter(JtacDropDownReceiver.SHOW_PLUGIN)
        //   registerDropDownReceiver(dropDown, filter)
        //   tool?.let { /* register with ATAK toolbar */ }
        //   // Listen to incoming CoT events:
        //   //   MapEventDispatcher will fire MapEvent.ITEM_ADDED for each
        //   //   incoming CoT marker. Forward to cotListener.onCotReceived.

        // Compute an initial recommendation so the first render is non-empty.
        val rec = state.computeRecommendation()
        mapOverlayManager.render(rec)
    }

    fun onDestroy(context: Context /*, view: MapView */) {
        state.removeListener(this)
        mapOverlayManager.detach()
        dropDown = null
        tool = null
        // TODO(SDK): unregisterDropDownReceiver(dropDown), unregister CoT listener.
    }

    // ── StateListener: pushes recompute results to map + active panel ────
    override fun onStateChanged(state: JtacState, recommendation: Recommendation) {
        runOnUi {
            mapOverlayManager.render(recommendation)
            dropDown?.onStateChanged(recommendation)
        }
    }

    override fun onScreenChanged(screen: Screen) {
        runOnUi {
            dropDown?.onScreenChanged(screen)
        }
    }

    private fun runOnUi(block: () -> Unit) {
        // TODO(SDK):
        //   MapView.getMapView()?.post(block) ?: block()
        block()
    }
}
