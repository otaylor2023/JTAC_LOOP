# Project: JTAC LOOP

National-security hackathon project. Decision-tree engine that auto-generates JTAC 9-line CAS briefs from drone CV detections. Two prongs:

- **React UI prototype** — `UI/jtac-sim-react/` — typing-free, WinTAK-styled, full feature set. The reference for behavior.
- **ATAK plugin** — `~/AndroidStudioProjects/atak-civ/plugin-examples/JtacNineLine/` — native Kotlin port for ATAK 5.5.1.8 (CIV). Outside this repo on disk; do not move it in.
- **Olivia's plugin** — `jtac_plugin/` (in this repo) — separate ATAK plugin with UDP/JSON IPC, CV bundle ingestion, hostile picker, mission bundle store. Integrate but do not duplicate.

## Source of truth for the wire contract

**Olivia's JSON formats are the contract.** When parsing or producing 9-line / target bundles in any environment (Kotlin plugin, scripts, web UI), match these:

- `data/sample_recommendation.json` — single recommendation (fields: engageability, target_id, target_class, cnn_confidence, flags, routing, game_plan, munition, nine_line, remarks, restrictions, reasoning_trace)
- `data/sample_plugin_targets_bundle.json` — bundle of targets with track + options[] of recommendations, each with role: "primary" | "alternate"
- UDP wire: port 6970, magic `JTCH`, header packed as `>4sBBQHHH` — see `scripts/send_plugin_json_udp.py`
- Chunked reassembly handled by `JtacJsonChunkReassembler.java` (Olivia's plugin)

When in doubt, read Olivia's plugin source under `jtac_plugin/app/src/main/java/com/atakmap/android/jtac_plugin/` before inventing format.

## ATAK plugin deploy loop

When iterating on the JtacNineLine plugin, **after `./gradlew assembleCivDebug`, only run `adb install -r <apk>`. Do NOT** `am force-stop com.atakmap.app.civ` or `am start` — the user is actively running ATAK and a force-stop blows away their session. ATAK picks up the new plugin on next plugin-registry rescan or when the user manually relaunches.

```bash
APK=$(ls -t ~/AndroidStudioProjects/atak-civ/plugin-examples/JtacNineLine/app/build/outputs/apk/civ/debug/*.apk | head -1)
adb -s R95Y603G61R install -r "$APK"
# stop here. do not force-stop or start.
```

## Engine boundary (must stay pure)

`engine/DecisionTree.kt` and `engine/decisionTree.js` (React mirror) are **pure logic** — no Android, no ATAK, no React imports. Take `TacticalState` in, return `Recommendation` out. Same engine runs in tests, the React prototype, and the ATAK plugin. Don't import platform code into it.

## State flow (single bus pattern)

`JtacState` is the single source of truth. All mutations go through setters → engine recompute → fan out via `StateListener.onStateChanged` to:
- `MapOverlayManager.render(rec)` — markers, threat ring, attack vector, FAH cone, blast ring, egress, draggable handle
- `JtacDropDownReceiver.onStateChanged` → `NineLineView.bind(rec)` — side panel

Two-way binding:
- panel field edit → state mutation → recompute → both views update
- map drag/click → state mutation → recompute → both views update

## Target IDs

Hostile IDs must stay unique across the whole feed. `JtacState.upsertHostile` already handles collisions: same id + similar coords = update; same id + different coords = append `.N` suffix. Don't bypass.

## Coordinate convention

All lat/lng in WGS-84 decimal degrees. MGRS strings come from `Geo.approximateMGRS` for display only; never round-trip through them.
