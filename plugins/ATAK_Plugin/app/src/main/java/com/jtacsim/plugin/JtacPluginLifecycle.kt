package com.jtacsim.plugin

// Requires ATAK-CIV SDK on classpath via app/libs/main.aar
//
// Plugin entry point. ATAK looks for a class implementing IPlugin (ATAK ≥4.7,
// civilian SDK 4.10) declared in xml/atak_plugin.xml. This class drives the
// onStart/onStop lifecycle for the entire 9-line plugin:
//   onStart  → instantiate JtacMapComponent, register the toolbar tool.
//   onStop   → tear it all down so the JTAC can re-load without leaks.

// import gov.tak.api.plugin.IPlugin
// import gov.tak.api.plugin.IServiceController
// import com.atakmap.android.maps.MapView

class JtacPluginLifecycle /* : IPlugin */ {

    private var mapComponent: JtacMapComponent? = null

    /**
     * Called by ATAK when the plugin is loaded.
     */
    fun onStart(/* serviceController: IServiceController */) {
        // TODO(SDK):
        //   val ctx = serviceController.getService(android.content.Context::class.java) ?: return
        //   val mapView = MapView.getMapView() ?: return
        //   mapComponent = JtacMapComponent().apply {
        //     onCreate(ctx, /* intent */ null, mapView)
        //   }
    }

    /**
     * Called by ATAK when the plugin is unloaded (user disable, app exit).
     */
    fun onStop() {
        // TODO(SDK):
        //   val mapView = MapView.getMapView() ?: return
        //   mapComponent?.onDestroy(mapView.context, mapView)
        //   mapComponent = null
    }
}
