
package com.atakmap.android.jtac_plugin.plugin;

import com.atak.plugins.impl.AbstractPlugin;
import com.atak.plugins.impl.PluginContextProvider;
import gov.tak.api.plugin.IServiceController;
import com.atakmap.android.jtac_plugin.JtacPluginMapComponent;

public class JtacPluginLifecycle extends AbstractPlugin {

    public JtacPluginLifecycle(IServiceController serviceController) {
        super(serviceController, new JtacPluginTool(serviceController.getService(PluginContextProvider.class).getPluginContext()), new JtacPluginMapComponent());
    }
}
