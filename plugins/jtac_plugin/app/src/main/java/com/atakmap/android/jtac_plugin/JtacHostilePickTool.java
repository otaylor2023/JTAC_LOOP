package com.atakmap.android.jtac_plugin;

import com.atakmap.android.maps.MapItem;
import com.atakmap.android.maps.MapView;
import com.atakmap.android.util.AbstractMapItemSelectionTool;

/**
 * Map tool: tap a hostile ({@code a-h-*} CoT type) or any marker with
 * {@code jtac_target_id} meta to isolate that target's merged JTAC JSON.
 */
public final class JtacHostilePickTool extends AbstractMapItemSelectionTool {

    public static final String TOOL_ID = "com.atakmap.android.jtac_plugin.JtacHostilePickTool";
    public static final String FINISHED_ACTION = TOOL_ID + ".Finished";

    public JtacHostilePickTool(MapView mapView) {
        super(mapView, TOOL_ID, FINISHED_ACTION,
                "Tap a hostile track (JTAC)",
                "Not a hostile — use hostile type or jtac_target_id meta");
    }

    @Override
    protected boolean isItem(MapItem mi) {
        if (mi == null) {
            return false;
        }
        String type = mi.getType();
        if (type != null && type.startsWith("a-h-")) {
            return true;
        }
        return mi.hasMetaValue("jtac_target_id");
    }
}
