package com.jtacsim.plugin

import android.content.Context
import com.jtacsim.plugin.JtacMapComponent

// Plugin entry point. ATAK looks for a class implementing IPlugin (or, in the
// civilian SDK, AbstractPlugin) declared in xml/atak_plugin.xml. The lifecycle
// hooks on this class fire when ATAK loads the APK at startup and when the
// JTAC opens / closes the side panel.
//
// The actual SDK type names depend on which ATAK version you're targeting.
// As of ATAK-CIV 4.10:
//   - gov.tak.api.plugin.IPlugin
//   - gov.tak.api.plugin.IServiceController
//
// TODO(SDK): once the SDK AAR is on the classpath, uncomment the imports below
// and have this class implement IPlugin.

// import gov.tak.api.plugin.IPlugin
// import gov.tak.api.plugin.IServiceController
// import com.atakmap.android.maps.MapView

class JtacPluginLifecycle /* : IPlugin */ {

    private var mapComponent: JtacMapComponent? = null

    // fun onStart(serviceController: IServiceController) {
    //     val ctx = serviceController.getService(android.content.Context::class.java)
    //         ?: return
    //     val mapView = MapView.getMapView() ?: return
    //     mapComponent = JtacMapComponent().apply {
    //         onCreate(ctx, /* intent */ null, mapView)
    //     }
    // }

    // fun onStop() {
    //     val mapView = MapView.getMapView() ?: return
    //     mapComponent?.onDestroy(mapView.context, mapView)
    //     mapComponent = null
    // }
}
