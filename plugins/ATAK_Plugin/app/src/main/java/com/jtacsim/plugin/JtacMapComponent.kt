package com.jtacsim.plugin

import android.content.Context
import android.content.Intent

// MapComponent — owns the dropdown receiver and tool registration for the
// 9-Line plugin. ATAK calls onCreate when the plugin loads, onDestroyImpl
// when it unloads.
//
// TODO(SDK): once SDK AAR is on the classpath, replace the stub base class
// with com.atakmap.android.maps.AbstractMapComponent and uncomment the
// MapView arg.

// import com.atakmap.android.maps.AbstractMapComponent
// import com.atakmap.android.maps.MapView

class JtacMapComponent /* : AbstractMapComponent() */ {

    private var dropDown: JtacDropDownReceiver? = null
    private var tool: JtacTool? = null

    /**
     * Called once when ATAK loads the plugin.
     * Wires up the toolbar button and the sidebar receiver.
     */
    fun onCreate(context: Context, intent: Intent? /*, view: MapView */) {
        // dropDown = JtacDropDownReceiver(view, context).also {
        //     val filter = android.content.IntentFilter(JtacDropDownReceiver.SHOW_PLUGIN)
        //     registerDropDownReceiver(it, filter)
        // }
        // tool = JtacTool(context, view).also { /* register with ATAK toolbar */ }
    }

    fun onDestroy(context: Context /*, view: MapView */) {
        dropDown = null
        tool = null
    }
}
