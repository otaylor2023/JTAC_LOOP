
package com.atakmap.android.jtac_plugin;

import android.content.Context;

import androidx.test.espresso.matcher.ViewMatchers;
import androidx.test.platform.app.InstrumentationRegistry;

import com.atakmap.android.jtac_plugin.plugin.R;
import com.atakmap.android.maps.Marker;
import com.atakmap.android.test.helpers.helper_versions.HelperFactory;
import com.atakmap.android.test.helpers.helper_versions.HelperFunctions;

import java.util.concurrent.Callable;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.action.ViewActions.scrollTo;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.withId;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class JtacPluginRobot {
    private static final HelperFunctions HELPER = HelperFactory.getHelper();
    private final Context appContext = InstrumentationRegistry
            .getInstrumentation()
            .getTargetContext();

    public static void installPlugin() {

        try {
            Thread.sleep(3000);
        } catch (Exception ignored) {
        }
        HELPER.installPlugin("JTAC Plugin");
        // TODO: Replace line above with line below once HelperFunctions has been updated to
        //  include the loadPackage function. installPlugin works as long as JTAC Plugin
        //  appears in the plugin list without needing to scroll down. loadPackage works even
        //  if JTAC Plugin is initially off screen
        // HELPER.loadPackage("com.atakmap.android.jtac_plugin.plugin");
    }

    public JtacPluginRobot openToolFromOverflow() {
        HELPER.pressButtonInOverflow("JTAC Plugin");
        return this;
    }

    public JtacPluginRobot pressISSButton() {
        onView(ViewMatchers.withText("ISS Location")).perform(scrollTo(), click());
        return this;
    }

    public JtacPluginRobot pressEmergencyButton() {
        onView(ViewMatchers.withText("Emergency")).perform(scrollTo(), click());
        sleep(5000);
        return this;
    }

    public static void sleep(int millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }

    public JtacPluginRobot pressNoEmergencyButton() {
        onView(ViewMatchers.withText("No Emergency")).perform(scrollTo(), click());
        return this;
    }

    public JtacPluginRobot pressAddAnAircraftButton() {
        onView(withText("Add an Aircraft")).perform(scrollTo(), click());
        return this;
    }

    public JtacPluginRobot verifyEmergencyMarkerExists() {
        assertNotNull("Could not find emergency marker",
                HELPER.getMarkerOfType("b-a-o-tbl"));
        return this;
    }

    public JtacPluginRobot verifyNoEmergencyMarkerExists() {
        assertNull("Found an emergency marker",
                HELPER.getMarkerOfType("b-a-o-tbl"));
        return this;
    }

    public JtacPluginRobot verifyAircraftMarkerWithNameExists(String name) {
        Marker marker = HELPER.getMarkerOfType("a-f-A");
        assertNotNull("Could not find aircraft marker", marker);
        assertEquals("Marker name does not match", marker.getTitle(), name);
        return this;
    }

    public JtacPluginRobot verifyISSExists() {
        HELPER.nullWait(new Callable<Marker>() {
            @Override
            public Marker call() {
                return HELPER.getMarkerOfUid("iss-unique-identifier");
            }
        }, 3000);
        return this;
    }

    public JtacPluginRobot pressAircraftDetailsRadialMenuButton() {
        HELPER.pressRadialButton(HELPER.getMarkerOfType("a-f-A"),
                "asset://icons/details.png");
        sleep(3000);
        return this;
    }

    public JtacPluginRobot verifyMarkerDetailsName(String name) {
        onView(withId(com.atakmap.app.R.id.cotInfoNameEdit))
                .check(matches(withText(name)));
        return this;
    }
}
