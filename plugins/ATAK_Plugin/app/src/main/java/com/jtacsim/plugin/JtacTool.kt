package com.jtacsim.plugin

// Requires ATAK-CIV SDK on classpath via app/libs/main.aar
//
// Toolbar button. ATAK shows this in its toolbar — when tapped, this fires
// the SHOW_PLUGIN intent which the DropDownReceiver listens for.

import android.content.Context

// import gov.tak.api.plugin.IPluginTool
// import com.atakmap.android.ipc.AtakBroadcast

class JtacTool /* : IPluginTool */ (
    private val context: Context /*, private val view: MapView */
) {
    fun getId(): String = "jtac.nineline"
    fun getName(): String = "9-Line"
    fun getDescription(): String = "Generates draft 9-line CAS briefs from drone CV detections"

    /**
     * Tap handler — fire intent so DropDownReceiver opens the side panel.
     */
    fun onPress() {
        // TODO(SDK):
        //   val intent = android.content.Intent(JtacDropDownReceiver.SHOW_PLUGIN)
        //   AtakBroadcast.getInstance().sendBroadcast(intent)
    }
}
