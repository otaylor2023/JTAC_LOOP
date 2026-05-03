# JTAC 9-Line Engine — ATAK-CIV Plugin

A sidebar plugin for ATAK that runs the deterministic 9-line decision tree
on incoming drone CoT events and produces a populated 9-line CAS brief for
the JTAC to review before transmitting to the GFC.

This is a **scaffold** — a working starting point that needs the official
ATAK-CIV SDK pointed at it before it can build into a real APK. The Kotlin
recommendation engine is fully ported and immediately useful as a library.

---

## What's here

```
ATAK_Plugin/
├── README.md                                    ← this file
├── build.gradle                                 ← root project config
├── settings.gradle
├── gradle.properties
├── app/
│   ├── build.gradle                             ← plugin module config
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml                  ← ATAK plugin entry points
│       ├── res/
│       │   ├── layout/sidebar_panel.xml         ← the sidebar UI
│       │   ├── values/{strings,colors,styles}.xml
│       │   └── xml/atak_plugin.xml              ← plugin metadata
│       └── java/com/jtacsim/plugin/
│           ├── JtacPluginLifecycle.kt           ← MapComponent — plugin lifecycle
│           ├── JtacDropDownReceiver.kt          ← the sidebar panel handler
│           ├── JtacTool.kt                      ← toolbar button registration
│           ├── engine/
│           │   ├── DecisionTree.kt              ← Kotlin port of the JS engine
│           │   ├── Munitions.kt                 ← munition database (ported from YAML)
│           │   ├── TargetEffectiveness.kt       ← effectiveness matrix
│           │   └── Geo.kt                       ← bearing / distance / MGRS helpers
│           └── ui/
│               └── NineLineView.kt              ← sidebar view binding
```

## Prerequisites

Once your teammate has the SDK downloaded, you'll need:

1. **JDK 17** (or 11 for older SDKs)
   ```bash
   brew install openjdk@17
   ```

2. **Android command-line tools** + SDK
   ```bash
   brew install --cask android-commandlinetools
   sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2"
   ```
   Set `ANDROID_HOME` to point at the SDK install location.

3. **ATAK-CIV SDK** — the bundle your teammate downloaded from tak.gov. It
   contains:
   - `main.aar` (or `atak-civ-x.y.z.aar`) — the runtime ATAK exposes to plugins
   - A reference `helloworld` plugin
   - Debug signing keys

## Wiring the SDK in

Once you have the SDK files locally, run:

```bash
# Replace /path/to/sdk with the actual SDK location.
export ATAK_SDK=/path/to/atak-civ-sdk

# Symlink the AAR into the plugin's libs dir
mkdir -p app/libs
ln -sf $ATAK_SDK/main.aar app/libs/main.aar

# Edit gradle.properties to set takversion (open the SDK README to find the exact version number)
echo "takversion=4.10.0" >> gradle.properties
```

The `app/build.gradle` already references `libs/main.aar` and the
`atak-gradle-takdev` plugin. Once the AAR and version are in place:

```bash
./gradlew assemblePluginCivDebug
```

The signed APK lands at `app/build/outputs/apk/civ/debug/`. Push it to a
device running ATAK-CIV with:

```bash
adb install -r app/build/outputs/apk/civ/debug/jtac-9line-plugin.apk
```

Open ATAK on the device. Look for the **"9-Line"** button in the toolbar.
Tap it — the sidebar panel opens.

## How it talks to the rest of ATAK

| Input | Source |
|---|---|
| Hostile detections | CoT events with type `a-h-G-*` (atoms-hostile-ground) |
| Friendly positions | CoT events with type `a-f-G-*` (PLI broadcasts) |
| Self position | `MapView.getSelfMarker().getPoint()` |
| Aircraft loadout | Hardcoded for demo (ATAK has no native aircraft loadout — would come from PASS-IT or local JSON config) |
| Weather / ROE | Hardcoded for demo (would be read from preplaced markers or config file) |

| Output | Destination |
|---|---|
| Recommended 9-line | Rendered in sidebar panel |
| `SEND` button | Builds a CoT message and broadcasts it to the network |
| GFC summary | Same — separate CoT event type |

## What works without the SDK

The `engine/` package — `DecisionTree.kt`, `Munitions.kt`,
`TargetEffectiveness.kt`, `Geo.kt` — is pure Kotlin with no Android or ATAK
dependencies. You can compile and unit-test it standalone:

```bash
# From the repo root, this directory works as a plain Kotlin library.
./gradlew :app:test
```

## Dev notes

- This scaffold uses ATAK Plugin API conventions current as of ATAK 4.10.
  Newer SDKs may have shifted some package names — check the SDK's
  `helloworld` example if anything fails to resolve.
- For the hackathon demo, hardcoding aircraft loadout + weather is fine.
  Real deployment would read these from CoT or a sidecar config.
- The Kotlin engine is a 1:1 port of `/UI/jtac-sim-react/src/engine/decisionTree.js`.
  When you tune the JS engine in the React app, port the same change here.

## Status

**Scaffolded — not yet building.** Files compile as Kotlin, but
`JtacPluginLifecycle` references SDK types that aren't on the classpath
until the SDK AAR is wired in. Marked `// TODO(SDK)` everywhere those types
are used. Drop in the SDK and those resolve.
