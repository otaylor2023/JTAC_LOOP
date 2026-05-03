package com.jtacsim.plugin

import android.content.Context

// Toolbar button. ATAK presents this in its toolbar — when tapped, fires the
// SHOW_PLUGIN intent which the DropDownReceiver listens for.
//
// TODO(SDK): once SDK AAR is on the classpath, extend AbstractPluginTool
// (gov.tak.api.plugin.AbstractPluginTool / gov.tak.api.plugin.IPluginTool).

// import gov.tak.api.plugin.IPluginTool

class JtacTool /* : IPluginTool */ (
    private val context: Context /*, private val view: MapView */
) {

    fun getId(): String = "9-Line Engine"

    fun getDescription(): String = "Generates draft 9-line CAS briefs from drone CV"

    // val icon: Drawable = ... — would resolve from R.drawable.ic_jtac_9line

    fun showSidebar() {
        // val intent = Intent(JtacDropDownReceiver.SHOW_PLUGIN)
        // AtakBroadcast.getInstance().sendBroadcast(intent)
    }
}
