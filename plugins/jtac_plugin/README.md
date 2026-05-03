# JTAC Plugin

This project is a copy of the **Hello World** ATAK plugin sample, renamed for **JTAC** development.

## Changes from Hello World

- **Package:** `com.atakmap.android.jtac_plugin` (Gradle `namespace` `com.atakmap.android.jtac_plugin.plugin`)
- **Entry classes:** `JtacPluginLifecycle`, `JtacPluginTool`, `JtacPluginMapComponent`, `JtacPluginDropDownReceiver`
- **Display name:** JTAC Plugin (`strings.xml`)
- **ATAK version string:** `5.5.1` in `app/build.gradle` (`ext.ATAK_VERSION`) — must match the **host ATAK** version (e.g. device shows `5.5.1.civ` → use `5.5.1`, not `5.5.1.8`).

## Open in Android Studio

Open the **`plugins/jtac_plugin`** folder in this repo (this directory when opened in Android Studio), not the whole SDK root.

## Build

Use the **civ** variant (CIV ATAK only loads plugins whose `plugin-api` matches `…CIV`):

```bash
./gradlew assembleCivDebug
```

In Android Studio: **Build → Select Build Variant** → **civDebug** for the `app` module. If you build **aeronet** / **aus** / etc., the APK will require that same ATAK flavor and CIV will refuse to load it.

This project’s `build.gradle` only defines **civ** and **mil** flavors so Studio cannot pick **aeronet** by mistake. Copy more flavors from `samples/helloworld` if you need them.

Install the built plugin APK on the same device as the ATAK build you matched in `ATAK_VERSION`.

## Docs

See the SDK root **`ATAK_Plugin_Development_Guide.pdf`** and the original Hello World sample for feature explanations.
