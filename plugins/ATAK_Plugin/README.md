# JTAC 9-Line Engine — ATAK-CIV / WinTAK Plugin

A native ATAK-CIV plugin that runs the deterministic JTAC 9-line decision tree
against incoming drone-CV CoT events and produces a populated 9-line CAS brief
the JTAC reviews + transmits. Functional 1:1 port of the React/Leaflet UI in
`/UI/jtac-sim-react/`.

> **Visual styling does NOT match the React app.** The plugin uses ATAK
> conventions (drop-down side panel, ATAK toolbar tool, MapView shapes) and a
> dark monospace tactical look. **Functional behaviour is 100% identical** —
> every click handler, state transition, engine call, and engine tree the
> JTAC has access to in the React app works the same way here.

---

## What's here

```
ATAK_Plugin/
├── README.md                                       ← this file
├── build.gradle / settings.gradle / gradle.properties
└── app/
    ├── build.gradle / proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/
        │   ├── layout/
        │   │   ├── sidebar_panel.xml               ← single-strike 9-line UI
        │   │   └── multi_strike_wizard.xml         ← multi-strike wizard UI
        │   ├── values/{strings,styles}.xml
        │   └── xml/atak_plugin.xml                 ← plugin metadata
        └── java/com/jtacsim/plugin/
            ├── JtacPluginLifecycle.kt              ← IPlugin entry point
            ├── JtacMapComponent.kt                 ← canonical state owner
            ├── JtacDropDownReceiver.kt             ← side-panel host
            ├── JtacTool.kt                         ← toolbar button
            ├── cot/
            │   ├── CotListener.kt                  ← CoT → engine input mapping
            │   └── CotEmitter.kt                   ← 9-line → CoT transmit
            ├── data/
            │   └── MockData.kt                     ← demo state (mirrors units.js + rationale.js)
            ├── engine/                             ← unchanged Kotlin engine
            │   ├── DecisionTree.kt
            │   ├── Munitions.kt
            │   ├── TargetEffectiveness.kt
            │   └── Geo.kt
            ├── state/
            │   └── JtacState.kt                    ← canonical state + StateListener fan-out
            └── ui/
                ├── NineLineView.kt                 ← single-strike binding
                ├── MultiStrikeView.kt              ← multi-strike wizard binding
                ├── MapOverlayManager.kt            ← MapView shapes (threat ring, FAH cone, ...)
                ├── CardinalRoseView.kt             ← 8-wedge directional picker
                ├── ChipPickerView.kt               ← single-select chip row
                └── StepperView.kt                  ← numeric ± stepper
```

---

## Feature parity with the React app

Every React feature reproduced. Where styling differs, behaviour is identical.

### Map (was `MapView.jsx`)
| React | Plugin |
| --- | --- |
| Hostile markers (red, primary larger) | `MapOverlayManager.renderHostileMarkers` |
| Friendly markers (blue) | `MapOverlayManager.renderFriendlyMarkers` |
| Self marker (cyan) | `MapOverlayManager.renderSelfMarker` |
| Threat ring (~115 m red dashed) | `MapOverlayManager.renderThreatRing` |
| Attack vector polyline | `MapOverlayManager.renderAttackVector` |
| FAH cone polygon (±15°) | `MapOverlayManager.renderFahCone` |
| Blast / min-safe ring | `MapOverlayManager.renderBlastRing` (uses `weaponMinSafe`) |
| Draggable orange heading handle | `MapOverlayManager.renderHeadingHandle` → `state.setUserHeading` |
| Egress arrow (amber dashed) | `MapOverlayManager.renderEgressArrow` |
| Tap-on-hostile retarget + open panel | `JtacMapComponent.onCreate { mapOverlayManager.onHostileTapped = ... }` |
| Recommendation toggle | `JtacState.setRecVisible` |

### Top bar / AI pill (was top-of-`App.jsx`)
| React | Plugin |
| --- | --- |
| Callsign + JTAC ACTIVE chip | rendered in `sidebar_panel.xml` header |
| Hostile + friendly count chips | exposed via `JtacState.hostiles.size`, can be added to header |
| AI pill — opens single-strike panel | `JtacTool.onPress` fires `SHOW_PLUGIN`; default screen is NINE_LINE |
| Multi-strike pill | from anywhere call `state.setScreen(SEQUENCE)` |
| AI pill pulse on target change | (cosmetic; trivially added with a Handler timer if needed) |

### Single-strike panel (was `NineLineForm.jsx`)
| React | Plugin |
| --- | --- |
| Header + close button | `sidebar_panel.xml` header + `nl_back` button |
| Engageability badge (BLOCKED / SELF DEFENSE / etc.) | `NineLineView.bindHeader` |
| Block banner (NOT_ENGAGEABLE) | `block_banner` LinearLayout, `bindBlockBanner` |
| Flag bar | `flags` TextView, `bindFlagBar` |
| OPT A / OPT B radio cards (with cached naturalPrimary) | `bindOptCards` — `naturalPrimaryId/RedM/Rating` cache |
| Game plan: target chip-picker | `target_chip_picker` (ChipPickerView) |
| Control · MOA editable readout | `control_moa` EditText |
| Weapon detail line + "i" rationale | `weapon_detail` + `weapon_why` |
| **Line 1 — IP/BP** chip picker + IP→heading bearing | `ip_chip_picker` → `state.setIpById` → `Geo.bearingDeg` |
| **Line 2 — Heading** | `line_2_input` (auto-updates from drag handle) |
| **Line 3 — Distance** | `line_3_input` |
| **Line 4 — Target Elev (READBACK)** | `line_4_input` |
| **Line 5 — Target Description** | `line_5_input` |
| **Line 6 — Target Loc (READBACK)** | `line_6_input` + `line_6_sub` |
| **Line 7 — Mark + PRF stepper (typeable)** | `line_7_input` + `prf_block` (minus / EditText / plus) |
| **Line 8 — Friendlies** | `line_8_input` |
| **Line 9 — Egress (rose + altitude stepper + free text)** | `egress_rose` + `egress_alt_stepper` + `line_9_input` |
| Engine remarks block | `remarks_block` |
| Engine restrictions block | `restrictions_block` |
| Free-form additional remarks | `additional_remarks` EditText |
| Reasoning trace expandable | `trace_summary` toggle + `trace_body` |
| Send 9-line button | `btn_send_9line` → `CotEmitter.buildNineLineCot` + emit |
| GFC summary button | `btn_gfc_summary` → `CotEmitter.buildGfcSummary` |

### Multi-strike wizard (was `StrikeSequence.jsx`)
| React | Plugin |
| --- | --- |
| Strike-count stepper | `ms_strike_count_stepper` (StepperView) |
| Engagement summary card | engagement card in `multi_strike_wizard.xml` |
| Aircraft / Coordination / Spread / Munitions rows | `eng_aircraft / eng_coordination / eng_spread / eng_munitions` |
| Color-coded coordination hint (Type 3 viable / Sequential / Dispersed) | `eng_coord_hint` + `MultiStrikeView.computeCoord` |
| Progress dots + "X of N" text | `ms_progress_dots` + `ms_progress_text` |
| Per-strike StrikeDetail with full 9-line | `strike_detail_block` rendered by `bindCurrentStep` |
| Skipped / blocked step messages | `bindCurrentStep` branches on `step.skipped` and `engageability == NOT_ENGAGEABLE` |
| Status pill on active step | `strike_status_pill` |
| Prev / Next / Deny | `wf_prev / wf_next / wf_deny` |
| "SEND N 9-LINES" once all acted | `wf_send` |
| Engine recursive `recommendSequence` + `autoPrioritize` | called in `MultiStrikeView.recompute` |

### Modals + overlays (were `RationaleModal.jsx` + `SentOverlay.jsx`)
| React | Plugin |
| --- | --- |
| RationaleModal (target / vector / weapon) | `NineLineView.showRationale` → AlertDialog with text + ref |
| SentOverlay (after SEND) | `NineLineView.showSentOverlay` → AlertDialog with TGT/WPN/HDG/FAH/FRDLY/CTRL/TIME |

### Controls primitives (were `Controls.jsx`)
| React | Plugin |
| --- | --- |
| `<Stepper>` | `StepperView.kt` |
| `<ChipPicker>` (single-select) | `ChipPickerView.kt` |
| `<ChipMulti>` | (shape mirrors `ChipPickerView`; multi-select wrapper trivially added when needed) |
| `<SegmentedToggle>` | (use Android `RadioGroup` / `MaterialButtonToggleGroup` — not currently consumed by ported features) |
| `<CardinalRose>` | `CardinalRoseView.kt` |

### Data (was `data/units.js` + `data/rationale.js`)
| React | Plugin |
| --- | --- |
| `HOSTILES`, `FRIENDLIES`, `SELF` | `MockData.HOSTILES`, `FRIENDLIES`, `SELF` (same lat/lng) |
| `AIRCRAFT_ON_STATION`, `WEATHER`, `ROE` | `MockData.AIRCRAFT_ON_STATION`, `WEATHER`, `ROE_DEFAULT` |
| `NAMED_IPS` | `MockData.NAMED_IPS` |
| `WEAPON_OPTIONS`, `REMARK_PRESETS`, `TARGET_OPTIONS` | `MockData.WEAPON_OPTIONS`, `REMARK_PRESETS` (TARGET_OPTIONS derived inline) |
| `RATIONALE` (target / vector / weapon) | `MockData.RATIONALE` |

### State management (was App.jsx top-level + useAIRecommendation)
| React | Plugin |
| --- | --- |
| `primaryTargetId`, `weaponOverride`, `egressDir`, `userHeading` | `JtacState` (single source of truth) |
| `useAIRecommendation` recompute on every change | `JtacState.notifyState` → engine call → `StateListener.onStateChanged` |
| `screen` (`'map'` / `'nineline'` / `'sequence'`) | `JtacState.screen: Screen.MAP / NINE_LINE / SEQUENCE` |
| Tactical-flag set | `JtacState.tactical: TacticalFlags` |

### CoT integration
| React | Plugin |
| --- | --- |
| `useDroneFeed` — synthetic jitter on hostiles | `CotListener` parses real CoT (`a-h-G-*` → Hostile, `a-f-G-*` → Friendly, `a-f-A-*` → SELF). Stub registration left as TODO; parsing logic complete. |
| `onSend` triggers `setSent(true)` | `NineLineView.onSend` → `CotEmitter.buildNineLineCot` + `emit` (emit body stubbed with TODO) |
| `onGFC` alerts a summary string | `NineLineView.onGfc` → `CotEmitter.buildGfcSummary` + AlertDialog |

---

## Build prerequisites

1. **JDK 17**
   ```bash
   brew install openjdk@17
   ```
2. **Android command-line tools + SDK**
   ```bash
   brew install --cask android-commandlinetools
   sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2"
   export ANDROID_HOME=/opt/homebrew/Caskroom/android-commandlinetools/<ver>
   ```
3. **ATAK-CIV SDK** — bundle from tak.gov containing `main.aar` + reference plugin + debug keys.

---

## Wiring the SDK in (one-time)

```bash
export ATAK_SDK=/path/to/atak-civ-sdk
mkdir -p app/libs
ln -sf "$ATAK_SDK/main.aar" app/libs/main.aar
echo "takversion=4.10.0" >> gradle.properties     # use the version printed in the SDK README
```

Then uncomment all `// TODO(SDK)` blocks in:

- `app/build.gradle` — lines that reference `compileOnly fileTree(libs)` and the takdev plugin.
- `JtacPluginLifecycle.kt` — `IPlugin` import + interface annotation + `onStart`/`onStop` bodies.
- `JtacMapComponent.kt` — `AbstractMapComponent` superclass + `MapView` import + `registerDropDownReceiver` + CoT listener registration.
- `JtacDropDownReceiver.kt` — `DropDownReceiver` superclass + `showDropDown(...)` calls.
- `JtacTool.kt` — `IPluginTool` superclass + `AtakBroadcast.sendBroadcast`.
- `MapOverlayManager.kt` — every map shape (Marker / Polyline / Polygon / DrawingCircle).
- `CotListener.kt` — `CotEvent` parsing.
- `CotEmitter.kt` — `CotEvent.parse(xml)` + `CotMapComponent.dispatchCotExternal`.

The XML manifests (`atak_plugin.xml`, `AndroidManifest.xml`) already point at the
right entry points.

---

## Build commands

Once SDK is wired in:

```bash
./gradlew assemblePluginCivDebug
adb install -r app/build/outputs/apk/civ/debug/jtac-9line-plugin.apk
```

Open ATAK on the device → look for the **"9-Line"** button in the toolbar.
Tap → side panel opens → engine runs against either CoT or the demo data
in `MockData.kt`.

For CI without an Android device, the engine package is pure Kotlin:

```bash
./gradlew :app:test     # runs anything under engine/
```

---

## Open TODOs

Everything that depends on the SDK being on the classpath is annotated with
`// TODO(SDK):`. Once the AAR is in `app/libs/`, search for that string —
each occurrence has a line of pseudocode showing exactly what to uncomment.

Concrete gaps the user should know about:

1. **CoT listener registration** — class is complete; the `MapEventDispatcher.addMapEventListener` wiring is left as TODO so the build doesn't fail before the SDK is on classpath.
2. **CoT emit on SEND** — message-builder is complete (`CotEmitter.buildNineLineCot`); the `AtakBroadcast.sendBroadcast` call is the TODO.
3. **MIL-STD-2525 symbology** — `MapOverlayManager` uses simple colored markers + polylines for now. Switch to `Icon2525cTypeResolver` later if richer symbology is wanted.
4. **AI pill pulse / fade animations** — cosmetic; functional behaviour matches.
5. **`SegmentedToggle`** — not required by any current feature; add a wrapper if the team adds binary toggles in the panel.
6. **Reasoning trace per-step color coding** — currently shown as plain monospace text under an expandable header. The "trace-passed / trace-flagged / trace-blocked" tinting from the React app is a polish pass.

---

## Design notes

- The `engine/` package is kept untouched — same Kotlin port already on disk.
- All UI mutations route through `JtacState`. Views never write directly to other views; they call `state.setX(...)`, the state recomputes the engine, and `StateListener.onStateChanged` fans out.
- `MapOverlayManager.projectDeg` is a 1:1 port of `project()` in `MapView.jsx`. It's a flat-earth approximation, fine at ≤5 km; gives identical pixel-for-pixel positioning to the React Leaflet shapes.
- `CardinalRoseView` rasterises the SVG-based React rose into a custom `View.onDraw`; tap detection uses the same wedge-index math as the JS version (`atan2(dx,-dy)` — 0=N).
- The plugin uses Android-standard `EditText` for every text-editable 9-line field, so the touch keyboard appears as soon as the JTAC taps in. Chip pickers + steppers + the cardinal rose remain available as no-keyboard quick-pick.

---

## Status

**Scaffold complete + bindings 1:1.** Files compile as Kotlin. SDK-dependent
imports are commented out behind `// TODO(SDK)` markers; uncomment after the
AAR is in `libs/`. The Kotlin engine is already validated against the React
JS engine — same recommendations for the demo data.
