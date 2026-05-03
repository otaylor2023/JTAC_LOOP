package com.jtacsim.plugin

// Requires ATAK-CIV SDK on classpath via app/libs/main.aar
//
// Sidebar receiver. When the JTAC taps the "9-Line" toolbar button, ATAK fires
// the SHOW_PLUGIN intent and this receiver inflates one of two layouts:
//   • sidebar_panel.xml          — single-strike 9-line review (Screen.NINE_LINE)
//   • multi_strike_wizard.xml    — multi-strike wizard (Screen.SEQUENCE)
//
// Screen swaps fire from the ai-pill / multi-strike pill in the React app.
// The plugin's equivalent is a state.setScreen() call from anywhere in the UI;
// onScreenChanged() observes the change and re-inflates the correct layout.

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import com.jtacsim.plugin.engine.Recommendation
import com.jtacsim.plugin.state.Screen
import com.jtacsim.plugin.ui.MultiStrikeView
import com.jtacsim.plugin.ui.NineLineView

// import com.atakmap.android.dropdown.DropDownReceiver
// import com.atakmap.android.maps.MapView
// import android.content.Intent

class JtacDropDownReceiver /* : DropDownReceiver(view) */ (
    /* private val view: MapView, */
    private val pluginContext: Context,
    private val mapComponent: JtacMapComponent,
) {

    companion object {
        const val SHOW_PLUGIN = "com.jtacsim.plugin.SHOW_PLUGIN"
        const val WIDTH_LANDSCAPE = 0.40
        const val WIDTH_PORTRAIT  = 1.00
        const val HEIGHT_LANDSCAPE = 1.00
        const val HEIGHT_PORTRAIT = 0.55
    }

    private var nineLineView: NineLineView? = null
    private var multiStrikeView: MultiStrikeView? = null
    private var currentRoot: View? = null

    /**
     * Called by ATAK when the SHOW_PLUGIN intent fires.
     */
    fun onReceive(context: Context /*, intent: Intent */) {
        // Choose the right layout for the current screen state.
        renderForScreen(mapComponent.state.screen)
    }

    /**
     * Re-inflate when state.screen changes.
     */
    fun onScreenChanged(screen: Screen) {
        renderForScreen(screen)
    }

    /**
     * State changed (engine recomputed) — push to the active view.
     */
    fun onStateChanged(rec: Recommendation) {
        nineLineView?.bind(rec)
        multiStrikeView?.render()
    }

    private fun renderForScreen(screen: Screen) {
        when (screen) {
            Screen.NINE_LINE, Screen.MAP -> showSinglePanel()
            Screen.SEQUENCE -> showMultiStrikePanel()
        }
    }

    private fun showSinglePanel() {
        val inflater = LayoutInflater.from(pluginContext)
        val layoutId = pluginContext.resources.getIdentifier("sidebar_panel", "layout", pluginContext.packageName)
        val v = if (layoutId != 0) inflater.inflate(layoutId, null) else null
        currentRoot = v
        if (v != null) {
            nineLineView = NineLineView(v, mapComponent.state).apply {
                bind(mapComponent.state.computeRecommendation())
            }
        }
        multiStrikeView = null
        // TODO(SDK):
        //   showDropDown(v, WIDTH_LANDSCAPE, HEIGHT_LANDSCAPE,
        //                   WIDTH_PORTRAIT, HEIGHT_PORTRAIT, false)
    }

    private fun showMultiStrikePanel() {
        val inflater = LayoutInflater.from(pluginContext)
        val layoutId = pluginContext.resources.getIdentifier("multi_strike_wizard", "layout", pluginContext.packageName)
        val v = if (layoutId != 0) inflater.inflate(layoutId, null) else null
        currentRoot = v
        if (v != null) {
            multiStrikeView = MultiStrikeView(v, mapComponent.state).apply { render() }
        }
        nineLineView = null
        // TODO(SDK):
        //   showDropDown(v, WIDTH_LANDSCAPE, HEIGHT_LANDSCAPE,
        //                   WIDTH_PORTRAIT, HEIGHT_PORTRAIT, false)
    }

    fun onDropDownClose() {
        nineLineView = null
        multiStrikeView = null
        currentRoot = null
    }
}
