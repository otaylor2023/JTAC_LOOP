#!/usr/bin/env python3
"""
jtac_scenario_runner.py — replay scenario JSON to ATAK/WinTAK (CoT) with optional per-frame plugin recommendations.

Reads a scenario JSON file (default: data/old_scenarios/bay_scenario.json) and replays frames in order, sending CoT
to WinTAK/ATAK via UDP (multicast by default). Handles adds, updates, and removes
automatically via TAKBridge.sync_detections().

Multicast only reaches another PC if the LAN routes it and WinTAK listens on
that group/port. For a viewer on a server, push unicast to its IP and inbound
UDP CoT port (WinTAK: Preferences → Network — often 4242).

Usage:
    python jtac_edge/jtac_scenario_runner.py                # default: data/old_scenarios/bay_scenario.json (relative to jtac_edge/)
    python jtac_edge/jtac_scenario_runner.py --scenario my_data.json
    python jtac_edge/jtac_scenario_runner.py --speed 2.0
    python jtac_edge/jtac_scenario_runner.py --loop
    python jtac_edge/jtac_scenario_runner.py --host 239.2.3.1
    python jtac_edge/jtac_scenario_runner.py --unicast 10.0.0.5:4242
    python jtac_edge/jtac_scenario_runner.py --no-multicast --unicast 192.168.1.50:4242
    python jtac_edge/jtac_scenario_runner.py --mcast-iface 192.168.1.2
    python jtac_edge/jtac_scenario_runner.py --scenario jtac_edge/data/old_scenarios/las_vegas_scenario.json --phone
    python jtac_edge/jtac_scenario_runner.py --scenario x.json --tablet --plugin-host 10.0.0.5
    python jtac_edge/jtac_scenario_runner.py --scenario x.json --phone --once
    python jtac_edge/jtac_scenario_runner.py --frame-sec 3 --lat-offset-deg 0.0002
    python jtac_edge/jtac_scenario_runner.py --hold
    python jtac_edge/jtac_scenario_runner.py --hold-only --hold-frame first

Node for recommendations: install ``node``/``nodejs``, or set ``JTAC_NODE`` / ``NODE_BINARY`` to the binary path.

Scenario JSON (optional keys):
    frame_interval_sec — used only when ``--frame-sec 0``: minimum seconds between frames vs ``t_sec`` deltas.
    single_run — if true, ignore --loop and exit after one play-through (linger still runs after).
    post_clear_sleep_sec — seconds to wait before CoT deletes (default 3).
    sync_stale_seconds — CoT stale time on every sync during playback (default 30; use ≥120 for slow frames).
    linger_forever — after last frame, keep refreshing friendlies with wiggle until Ctrl+C (no auto clear).
    linger_interval_sec — seconds between linger refreshes (default 2).
    linger_stale_seconds — CoT stale horizon on each linger ping (default 6 hours).
    wiggle_all_tracks — if true, jiggle every detection each frame (not only friendlies); linger uses last frame plus any hostile/unknown dropped only in that frame (carry-forward) so OPFOR stays on the map.
    reset_before_play — if true, clear_all + pause at start of each scenario run (clean TAK before first frame).
    reset_ui_before_linger — if true, clear_all + pause before live linger loop (default: same as reset_before_play).
    reset_ui_pause_sec — seconds to pause after clear so the UI can settle (default 0.45).
    wiggle_circle_radius_m_play — optional override for per-frame circular patrol radius (meters).
    wiggle_circle_radius_m_linger — optional override for linger circular radius (meters).
    wiggle_omega_scale — multiply angular speed on circles (default 1; use 0.2–0.5 for slower arcs).
"""

import argparse
import json
import math
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

_REPO = pathlib.Path(__file__).resolve().parent
_BUNDLE_MJS = _REPO / "scenario-frame-to-plugin-bundle.mjs"
_SEND_PLUGIN_PY = _REPO / "send_plugin_json_udp.py"

# ─── TAKBridge (inline so this file is self-contained) ───────────────────────


def parse_unicast_targets(specs: list[str], default_port: int) -> list[tuple[str, int]]:
    """Parse --unicast values like '10.0.0.5' or '10.0.0.5:4242' into (host, port)."""
    out: list[tuple[str, int]] = []
    for raw in specs:
        s = raw.strip()
        if not s:
            continue
        if ":" in s:
            host, _, port_s = s.rpartition(":")
            out.append((host.strip(), int(port_s)))
        else:
            out.append((s, int(default_port)))
    return out


class TAKBridge:
    MULTICAST_GROUP = "239.2.3.1"
    MULTICAST_PORT  = 6969

    COT_TYPES = {
        "friendly": "a-f-G-U-C",
        "hostile":  "a-h-G-U-C",
        "neutral":  "a-n-G-U-C",
        "unknown":  "a-u-G-U-C",
    }

    def __init__(
        self,
        host: str = MULTICAST_GROUP,
        port: int = MULTICAST_PORT,
        ttl: int = 64,
        *,
        unicast_targets: Optional[list[tuple[str, int]]] = None,
        multicast: bool = True,
        mcast_out_ip: Optional[str] = None,
    ):
        # `host` / `port` remain the multicast group + port (backward compatible).
        self._mcast_group = host
        self._mcast_port = port
        self._multicast = bool(multicast)
        self._unicast_targets = list(unicast_targets or [])
        self.active: dict[str, dict] = {}

        self._sock = socket.socket(
            socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP
        )
        if self._multicast:
            self._sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, ttl)
        if mcast_out_ip:
            try:
                self._sock.setsockopt(
                    socket.IPPROTO_IP,
                    socket.IP_MULTICAST_IF,
                    socket.inet_aton(mcast_out_ip),
                )
            except OSError as exc:
                print(f"WARNING: IP_MULTICAST_IF {mcast_out_ip!r} failed: {exc}")

    # ── public API ────────────────────────────────────────────────────────────

    def send_target(self, uid: str, lat: float, lon: float,
                    callsign: str, classification: str = "unknown",
                    confidence: float = 0.0, stale_seconds: int = 30,
                    nine_line: Optional[dict] = None):
        now   = datetime.now(timezone.utc)
        stale = now + timedelta(seconds=stale_seconds)
        fmt   = "%Y-%m-%dT%H:%M:%SZ"
        cot_type = self.COT_TYPES.get(classification, self.COT_TYPES["unknown"])

        import json as _json
        payload = {"confidence": round(confidence, 2),
                   "classification": classification}
        if nine_line:
            payload["nine_line"] = nine_line
        remarks = f"AUTOJTAC::{_json.dumps(payload)}"

        cot = (
            f'<?xml version="1.0"?>'
            f'<event version="2.0" uid="{uid}" type="{cot_type}"'
            f' time="{now.strftime(fmt)}"'
            f' start="{now.strftime(fmt)}"'
            f' stale="{stale.strftime(fmt)}"'
            f' how="m-g">'
            f'<point lat="{lat}" lon="{lon}"'
            f' hae="0" ce="9999999" le="9999999"/>'
            f'<detail>'
            f'<contact callsign="{callsign}"/>'
            f'<remarks>{remarks}</remarks>'
            f'</detail>'
            f'</event>'
        )
        self._send(cot)
        self.active[uid] = dict(lat=lat, lon=lon, callsign=callsign,
                                classification=classification,
                                confidence=confidence)

    def delete_target(self, uid: str):
        now = datetime.now(timezone.utc)
        fmt = "%Y-%m-%dT%H:%M:%SZ"
        ts  = now.strftime(fmt)
        cot = (
            f'<?xml version="1.0"?>'
            f'<event version="2.0" uid="{uid}" type="t-x-d-d"'
            f' time="{ts}" start="{ts}" stale="{ts}" how="m-g">'
            f'<point lat="0" lon="0" hae="0" ce="9999999" le="9999999"/>'
            f'<detail/></event>'
        )
        self._send(cot)
        self.active.pop(uid, None)

    def sync_detections(
        self,
        detections: list[dict],
        stale_seconds: int = 30,
        *,
        verbose: bool = True,
    ):
        """Diff current detections against active markers — add, update, remove."""
        incoming_uids = {d["uid"] for d in detections}

        # remove anything no longer detected
        for uid in list(self.active.keys()):
            if uid not in incoming_uids:
                self.delete_target(uid)
                if verbose:
                    print(f"  [-] REMOVED  {uid}")

        # add or update
        for det in detections:
            uid    = det["uid"]
            action = "UPDATE" if uid in self.active else "ADD   "
            self.send_target(
                uid            = uid,
                lat            = det["lat"],
                lon            = det["lon"],
                callsign       = det.get("callsign", uid),
                classification = det.get("classification", "unknown"),
                confidence     = det.get("confidence", 0.0),
                stale_seconds  = det.get("stale_seconds", stale_seconds),
            )
            if verbose:
                icon = {"friendly": "🟦", "hostile": "🔴",
                        "unknown":  "🟡", "neutral": "⬜"}.get(
                            det.get("classification", "unknown"), "⬜")
                print(f"  [{action}] {icon} {det['callsign']:12s} "
                      f"({det['classification']:8s} {det['confidence']:.0%})  "
                      f"{det['lat']:.4f}, {det['lon']:.4f}"
                      + (f"  — {det['note']}" if det.get("note") else ""))
            time.sleep(0.05)

    def hold_active(
        self,
        detections: list[dict],
        *,
        interval_sec: float = 12.0,
        stale_seconds: int = 120,
        verbose_refresh: bool = False,
    ) -> None:
        """
        Re-send the same detections on a fixed interval with updated stale times
        so ATAK keeps stationary tracks on the map. Runs until KeyboardInterrupt.

        CoT only — does not run the recommendation / plugin UDP pipeline.
        """
        n = len(detections)
        print(
            f"\n📌 Hold: {n} track(s), refresh every {interval_sec:g}s, "
            f"stale={stale_seconds}s (Ctrl+C to stop)"
        )
        tick = 0
        silent_announced = False
        while True:
            tick += 1
            vr = verbose_refresh or tick == 1
            self.sync_detections(
                detections,
                stale_seconds=stale_seconds,
                verbose=vr,
            )
            if not vr and not verbose_refresh and not silent_announced:
                print("  (further hold refreshes are silent — Ctrl+C to quit)")
                silent_announced = True
            time.sleep(interval_sec)

    def clear_all(self):
        for uid in list(self.active.keys()):
            self.delete_target(uid)

    def _send(self, cot: str):
        data = cot.encode()
        if self._multicast:
            self._sock.sendto(data, (self._mcast_group, self._mcast_port))
        for uh, up in self._unicast_targets:
            self._sock.sendto(data, (uh, up))

    def __del__(self):
        try:
            self._sock.close()
        except Exception:
            pass


# ─── Scenario loader ──────────────────────────────────────────────────────────

def load_scenario(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _find_node_executable() -> Optional[str]:
    """
    Resolve Node for recommendation bundle script.
    Order: JTAC_NODE, NODE_BINARY, NODE env; then ``node`` / ``nodejs`` on PATH;
    then common install paths (Debian often ships ``nodejs`` only).
    """
    for key in ("JTAC_NODE", "NODE_BINARY", "NODE"):
        raw = os.environ.get(key)
        if raw:
            cand = raw.strip().strip('"').strip("'")
            if cand and os.path.isfile(cand) and os.access(cand, os.X_OK):
                return cand
    for name in ("node", "nodejs"):
        w = shutil.which(name)
        if w and os.access(w, os.X_OK):
            return w
    for fixed in (
        "/usr/bin/node",
        "/usr/bin/nodejs",
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
    ):
        if os.path.isfile(fixed) and os.access(fixed, os.X_OK):
            return fixed
    return None


def _run_plugin_recommendation_udp(
    scenario_path: pathlib.Path,
    frame_list_index: int,
    plugin_dest: Optional[str],
    plugin_host: Optional[str],
    type3_window: bool,
    lat_offset_deg: float,
    lon_offset_deg: float,
) -> None:
    """
    Generate jtac_plugin_targets with Node (decision tree only), then send UDP via Python.
    """
    node = _find_node_executable()
    if not node:
        print(
            "  [plugin UDP] skipped: no Node.js binary found. Install ``node`` or ``nodejs``, "
            "or set JTAC_NODE to the full path (e.g. export JTAC_NODE=/usr/bin/nodejs)."
        )
        return
    cmd = [
        node,
        str(_BUNDLE_MJS),
        str(scenario_path.resolve()),
        "--frame",
        str(frame_list_index),
        "--json-only",
    ]
    if type3_window:
        cmd.append("--type3-window")
    if lat_offset_deg != 0.0 or lon_offset_deg != 0.0:
        cmd.extend(
            [
                "--lat-offset-deg",
                str(lat_offset_deg),
                "--lon-offset-deg",
                str(lon_offset_deg),
            ]
        )
    r = subprocess.run(
        cmd,
        cwd=str(_REPO),
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").strip()
        print(f"  [plugin UDP] bundle failed ({r.returncode}): {err[:500]}")
        return
    bundle_text = r.stdout
    if not bundle_text.strip():
        print("  [plugin UDP] empty bundle from recommendation script")
        return
    fd, tmp = tempfile.mkstemp(suffix=".json", prefix="jtac_plugin_")
    try:
        os.write(fd, bundle_text.encode("utf-8"))
        os.close(fd)
        send_cmd = [sys.executable, str(_SEND_PLUGIN_PY), tmp]
        if plugin_host:
            send_cmd.extend(["--host", plugin_host])
        elif plugin_dest == "phone":
            send_cmd.append("--phone")
        elif plugin_dest == "tablet":
            send_cmd.append("--tablet")
        s = subprocess.run(
            send_cmd,
            cwd=str(_REPO),
            capture_output=True,
            text=True,
        )
        if s.returncode != 0:
            err = (s.stderr or s.stdout or "").strip()
            print(f"  [plugin UDP] send failed ({s.returncode}): {err[:400]}")
        else:
            line = (s.stdout or "").strip().splitlines()
            if line:
                print(f"  [plugin UDP] {line[-1]}")
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


_EARTH_M_PER_DEG_LAT = 111_320.0


def _circle_offset_deg(lat0_deg: float, radius_m: float, theta_rad: float) -> tuple[float, float]:
    """Local tangent plane: each θ step is a point on a circle; lon scale uses cos(lat)."""
    cos_lat = max(math.cos(math.radians(lat0_deg)), 0.2)
    dlat = (radius_m / _EARTH_M_PER_DEG_LAT) * math.cos(theta_rad)
    dlon = (radius_m / (_EARTH_M_PER_DEG_LAT * cos_lat)) * math.sin(theta_rad)
    return dlat, dlon


def _circle_kinematics(
    uid: str, r_play: float, r_linger: float, omega_scale: float = 1.0
):
    """Per-uid phase, angular rate, and radius so every track traces its own circle."""
    h = hash(str(uid)) % (2**31)
    phi0 = (h % 1000) / 1000.0 * 2.0 * math.pi
    omega_play = (0.16 + (h % 500) / 500.0 * 0.42) * omega_scale
    omega_linger = (0.12 + (h % 400) / 400.0 * 0.35) * omega_scale
    r_p = r_play * (0.82 + (h % 13) / 40.0)
    r_l = r_linger * (0.82 + ((h >> 3) % 13) / 40.0)
    return phi0, omega_play, omega_linger, r_p, r_l


def _apply_geo_offset_to_detections(
    detections: list[dict],
    lat_offset_deg: float,
    lon_offset_deg: float,
) -> list[dict]:
    """Shift all track lat/lon (degrees). Positive lat = north, positive lon = east."""
    if lat_offset_deg == 0.0 and lon_offset_deg == 0.0:
        return detections
    out: list[dict] = []
    for d in detections:
        out.append(
            {
                **d,
                "lat": float(d["lat"]) + lat_offset_deg,
                "lon": float(d["lon"]) + lon_offset_deg,
            }
        )
    return out


def _wiggle_track_positions(
    detections: list[dict],
    phase: float,
    jiggle_all: bool,
    radius_m_play: float,
    omega_scale: float,
) -> list[dict]:
    """Each track patrols a small ground circle; friendlies only unless jiggle_all."""
    out = []
    for d in detections:
        if not jiggle_all and d.get("classification") != "friendly":
            out.append(d)
            continue
        uid = str(d.get("uid", ""))
        blat = float(d["lat"])
        blo = float(d["lon"])
        phi0, om_p, _, r_m, _ = _circle_kinematics(
            uid, radius_m_play, radius_m_play, omega_scale
        )
        theta = phi0 + float(phase) * om_p
        dlat, dlon = _circle_offset_deg(blat, r_m, theta)
        out.append({**d, "lat": blat + dlat, "lon": blo + dlon})
    return out


def _linger_track_templates(frames: list[dict], wiggle_all: bool) -> list[dict]:
    """
    Detections to refresh during linger_forever.

    With wiggle_all, if the final frame omits hostile/unknown UIDs that still
    existed earlier, merge their last-known copies so WinTAK/ATAK keeps red/gray
    tracks (BDA / training plot) instead of only friendlies after a narrative
    'all cleared' frame.
    """
    if not frames:
        return []
    final = list(frames[-1].get("detections", []))
    if not wiggle_all:
        friend = [d for d in final if d.get("classification") == "friendly"]
        return friend if friend else final

    final_uids = {d["uid"] for d in final}
    carried: dict[str, dict] = {}
    for fr in reversed(frames[:-1]):
        for d in fr.get("detections", []):
            uid = d.get("uid")
            if not uid or uid in final_uids or uid in carried:
                continue
            cls = d.get("classification", "")
            if cls in ("hostile", "unknown"):
                carried[uid] = dict(d)
    return final + list(carried.values())


def _hold_frame_detections(scenario: dict, which: str) -> list[dict]:
    """Copy detections from the first or last frame (stationary hold; no wiggle)."""
    frames = scenario["frames"]
    if not frames:
        raise ValueError("scenario has no frames")
    key = which.strip().lower()
    idx = 0 if key == "first" else -1
    return [dict(d) for d in frames[idx]["detections"]]


def _linger_forever(
    bridge: TAKBridge,
    templates: list[dict],
    bases: dict,
    interval: float,
    stale_sec: int,
    radius_m_linger: float,
    omega_scale: float,
    quiet_every: int = 15,
):
    """Refresh CoT on an interval; each uid traces its own circle until Ctrl+C."""
    n = 0
    while True:
        for d in templates:
            uid = d["uid"]
            bla, blo = bases[uid]
            phi0, _, om_l, _, r_l = _circle_kinematics(
                uid, radius_m_linger, radius_m_linger, omega_scale
            )
            theta = phi0 + n * om_l
            dlat, dlon = _circle_offset_deg(bla, r_l, theta)
            lat = bla + dlat
            lon = blo + dlon
            bridge.send_target(
                uid=uid,
                lat=lat,
                lon=lon,
                callsign=d.get("callsign", uid),
                classification=d.get("classification", "friendly"),
                confidence=float(d.get("confidence", 0.0)),
                stale_seconds=stale_sec,
            )
        n += 1
        if n % quiet_every == 0:
            print(f"  … linger tick {n}  ({len(templates)} tracks, stale={stale_sec}s)")
        time.sleep(interval)


# ─── Main playback loop ───────────────────────────────────────────────────────

def play(
    scenario: dict,
    bridge: TAKBridge,
    speed: float = 1.0,
    loop: bool = False,
    linger: bool = False,
    *,
    scenario_path: Optional[pathlib.Path] = None,
    send_plugin_udp: bool = False,
    plugin_dest: Optional[str] = None,
    plugin_host: Optional[str] = None,
    plugin_type3_window: bool = False,
    plugin_udp_once: bool = False,
    frame_step_sec: float = 3.0,
    lat_offset_deg: float = 0.0,
    lon_offset_deg: float = 0.0,
    hold: bool = False,
    hold_only: bool = False,
    hold_interval: float = 12.0,
    hold_stale_seconds: int = 120,
    hold_frame: str = "last",
    hold_verbose_refresh: bool = False,
) -> None:

    frames = scenario["frames"]
    name   = scenario.get("scenario", "Unknown Scenario")
    # Scenario can force one shot (ignores CLI --loop) for canned training files.
    if scenario.get("single_run"):
        loop = False

    if hold or hold_only:
        loop = False

    hf = hold_frame.strip().lower()
    if hf not in ("first", "last"):
        hf = "last"

    if hold_only:
        raw = _hold_frame_detections(scenario, hf)
        dets = _apply_geo_offset_to_detections(raw, lat_offset_deg, lon_offset_deg)
        print(f"\n{'='*60}\n  {name}  (hold-only, {hf} frame)\n{'='*60}")
        bridge.hold_active(
            dets,
            interval_sec=hold_interval,
            stale_seconds=hold_stale_seconds,
            verbose_refresh=hold_verbose_refresh,
        )
        return

    linger = bool(linger or scenario.get("linger_forever"))
    min_gap = scenario.get("frame_interval_sec")
    post_clear_sleep = float(scenario.get("post_clear_sleep_sec", 3))
    sync_stale = int(scenario.get("sync_stale_seconds", 30))
    linger_iv = float(scenario.get("linger_interval_sec", 2.0))
    linger_stale = int(scenario.get("linger_stale_seconds", 6 * 3600))
    wiggle_all = bool(scenario.get("wiggle_all_tracks"))
    reset_play = bool(scenario.get("reset_before_play"))
    reset_b4_linger = bool(
        scenario.get("reset_ui_before_linger", reset_play)
    )
    reset_pause = float(scenario.get("reset_ui_pause_sec", 0.45))
    r_play = float(scenario.get("wiggle_circle_radius_m_play", 235.0))
    r_linger = float(scenario.get("wiggle_circle_radius_m_linger", 310.0))
    omega_scale = float(scenario.get("wiggle_omega_scale", 1.0))

    run = 0
    while True:
        run += 1
        print(f"\n{'='*60}")
        print(f"  {name}  (run #{run})")
        print(f"{'='*60}")

        if reset_play:
            bridge.clear_all()
            print(f"  [reset] cleared prior markers · pause {reset_pause:.2f}s …")
            time.sleep(reset_pause)

        for i, frame in enumerate(frames):
            t_sec    = frame["t_sec"]
            frame_no = frame["frame"]
            dets = _wiggle_track_positions(
                frame["detections"],
                phase=float(frame_no),
                jiggle_all=wiggle_all,
                radius_m_play=r_play,
                omega_scale=omega_scale,
            )
            dets = _apply_geo_offset_to_detections(dets, lat_offset_deg, lon_offset_deg)

            print(f"\n── Frame {frame_no:02d}  t={t_sec:>4}s  "
                  f"({len(dets)} detections) ──")

            bridge.sync_detections(dets, stale_seconds=sync_stale)

            if send_plugin_udp and (not plugin_udp_once or i == 0):
                if scenario_path is None:
                    print("  [plugin UDP] skipped: no scenario path (internal error)")
                else:
                    _run_plugin_recommendation_udp(
                        scenario_path,
                        i,
                        plugin_dest,
                        plugin_host,
                        plugin_type3_window,
                        lat_offset_deg,
                        lon_offset_deg,
                    )

            # sleep until next frame (or end)
            if i < len(frames) - 1:
                if frame_step_sec > 0:
                    dt = float(frame_step_sec) / max(speed, 1e-6)
                else:
                    next_t = frames[i + 1]["t_sec"]
                    dt = (next_t - t_sec) / max(speed, 1e-6)
                    if min_gap is not None:
                        dt = max(dt, float(min_gap) / max(speed, 1e-6))
                print(f"  ⏱  next frame in {dt:.1f}s ...")
                time.sleep(dt)

        if linger:
            linger_dets = _linger_track_templates(frames, wiggle_all)
            linger_dets = _apply_geo_offset_to_detections(
                linger_dets, lat_offset_deg, lon_offset_deg
            )
            if reset_b4_linger:
                bridge.clear_all()
                print(
                    f"  [reset] cleared before live jiggle · pause {reset_pause:.2f}s …"
                )
                time.sleep(reset_pause)
            bases = {d["uid"]: (float(d["lat"]), float(d["lon"])) for d in linger_dets}
            print(
                f"\n🔆 Linger: refreshing {len(linger_dets)} track(s) every {linger_iv}s "
                f"(stale={linger_stale}s). Ctrl+C to stop and clear."
            )
            _linger_forever(
                bridge,
                linger_dets,
                bases,
                linger_iv,
                linger_stale,
                r_linger,
                omega_scale,
            )
            return

        if hold:
            raw = _hold_frame_detections(scenario, hf)
            dets = _apply_geo_offset_to_detections(raw, lat_offset_deg, lon_offset_deg)
            print(
                f"\n✅ Scenario complete — holding {len(dets)} track(s) "
                f"({hf} frame), no auto-clear."
            )
            bridge.hold_active(
                dets,
                interval_sec=hold_interval,
                stale_seconds=hold_stale_seconds,
                verbose_refresh=hold_verbose_refresh,
            )
            return

        print(f"\n✅ Scenario complete. Clearing all markers in {post_clear_sleep:.0f}s...")
        time.sleep(post_clear_sleep)
        bridge.clear_all()
        print("  All markers removed.")
        print("  End of scenario (exiting).")

        if not loop:
            return

        print(f"\n🔁 Looping... (Ctrl+C to stop)")
        time.sleep(2)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="JTAC_LOOP scenario runner — CoT playback + optional plugin UDP")
    p.add_argument("--scenario", type=pathlib.Path,
                   default=pathlib.Path(__file__).parent / "data/old_scenarios/bay_scenario.json",
                   help="Path to scenario JSON (default: data/old_scenarios/bay_scenario.json)")
    p.add_argument("--host", default="239.2.3.1",
                   help="Multicast group (default: 239.2.3.1)")
    p.add_argument("--port", type=int, default=6969,
                   help="Multicast port; also default UDP port for --unicast if omitted (default: 6969)")
    p.add_argument(
        "--unicast",
        action="append",
        default=None,
        metavar="HOST[:PORT]",
        help="Also send each CoT as UDP unicast (repeatable). Use WinTAK machine IP "
        "and its inbound CoT UDP port (check Preferences → Network; often 4242).",
    )
    p.add_argument(
        "--no-multicast",
        action="store_true",
        help="Disable multicast; send only to --unicast destinations (needs ≥1 --unicast).",
    )
    p.add_argument(
        "--mcast-iface",
        default=None,
        metavar="LOCAL_IP",
        help="IPv4 of local interface for multicast egress (use on multi-NIC devices).",
    )
    p.add_argument("--speed", type=float, default=1.0,
                   help="Playback speed multiplier (default: 1.0, try 3.0 for fast demo)")
    p.add_argument(
        "--frame-sec",
        type=float,
        default=3.0,
        metavar="SEC",
        help="Fixed wall-clock seconds between frames (default: 3). Use 0 for legacy pacing from scenario t_sec and frame_interval_sec.",
    )
    p.add_argument(
        "--lat-offset-deg",
        type=float,
        default=0.0002,
        metavar="DEG",
        help="Add to every track latitude before CoT / plugin (default ~0.0002° ≈ 22 m north). Use 0 for no shift.",
    )
    p.add_argument(
        "--lon-offset-deg",
        type=float,
        default=0.0,
        metavar="DEG",
        help="Add to every track longitude (default 0). Positive is east.",
    )
    p.add_argument("--loop", action="store_true",
                   help="Loop scenario forever")
    p.add_argument("--linger", action="store_true",
                   help="After last frame, wiggle / refresh tracks forever until Ctrl+C (see scenario linger_* keys)")
    p.add_argument(
        "--hold",
        action="store_true",
        help="After the last frame, refresh CoT only (stationary tracks) until Ctrl+C — no auto clear; "
        "does not re-send plugin recommendations (those only run during frame playback, per --once if set).",
    )
    p.add_argument(
        "--hold-only",
        action="store_true",
        help="Skip frame playback; CoT hold only until Ctrl+C — no plugin UDP (use normal playback for recs).",
    )
    p.add_argument(
        "--hold-interval",
        type=float,
        default=12.0,
        metavar="SEC",
        help="Seconds between CoT refreshes while holding (default: 12)",
    )
    p.add_argument(
        "--hold-stale-seconds",
        type=int,
        default=120,
        metavar="N",
        help="CoT stale horizon while holding — should exceed ~2× hold-interval (default: 120)",
    )
    p.add_argument(
        "--hold-frame",
        choices=("first", "last"),
        default="last",
        help="Which frame's detections to use for --hold / --hold-only (default: last)",
    )
    p.add_argument(
        "--hold-verbose-refresh",
        action="store_true",
        help="Print every hold refresh line-by-line (default: first refresh only)",
    )
    pg = p.add_mutually_exclusive_group()
    pg.add_argument(
        "--phone",
        action="store_true",
        help="Send plugin recommendations (UDP 6970) to ATAK_PHONE_IP from jtac_edge/data/static_ips.env (each frame, or first only with --once)",
    )
    pg.add_argument(
        "--tablet",
        action="store_true",
        help="Send plugin recommendations (UDP 6970) to ATAK_TABLET_IP from jtac_edge/data/static_ips.env (each frame, or first only with --once)",
    )
    p.add_argument(
        "--plugin-host",
        default=None,
        metavar="IP",
        help="Override plugin UDP destination (passed to send_plugin_json_udp.py --host)",
    )
    p.add_argument(
        "--plugin-type3-window",
        action="store_true",
        help="Enable Type-3 multi-target window when building recommendation bundles",
    )
    p.add_argument(
        "--once",
        action="store_true",
        help="Send plugin recommendations only for the first frame (still sends CoT every frame). Use with --phone, --tablet, or --plugin-host.",
    )
    return p.parse_args()


def main():
    args = parse_args()

    ucast = parse_unicast_targets(args.unicast or [], args.port)
    if args.no_multicast and not ucast:
        print("ERROR: --no-multicast requires at least one --unicast HOST[:PORT]")
        return

    print(
        f"JTAC_LOOP scenario runner  |  {args.speed}x speed  |  frame step {args.frame_sec:g}s  |  "
        f"Δlat {args.lat_offset_deg:g}° Δlon {args.lon_offset_deg:g}°"
    )
    if not args.no_multicast:
        print(f"  Multicast CoT: {args.host}:{args.port}")
    else:
        print("  Multicast: disabled")
    for h, prt in ucast:
        print(f"  Unicast CoT:   {h}:{prt}")
    if args.mcast_iface:
        print(f"  Multicast egress interface: {args.mcast_iface}")
    plugin_dest: Optional[str] = None
    if args.phone:
        plugin_dest = "phone"
        print("  Plugin UDP: --phone (ATAK_PHONE_IP from jtac_edge/data/static_ips.env)")
    elif args.tablet:
        plugin_dest = "tablet"
        print("  Plugin UDP: --tablet (ATAK_TABLET_IP from jtac_edge/data/static_ips.env)")
    if args.plugin_host:
        print(f"  Plugin UDP host override: {args.plugin_host}")
    send_plugin_udp = bool(plugin_dest or args.plugin_host)
    if args.once and not send_plugin_udp:
        print("ERROR: --once requires --phone, --tablet, or --plugin-host")
        return
    if args.once:
        print("  Plugin UDP: --once (first frame only)")
    if args.loop and (args.hold or args.hold_only):
        print(
            "NOTE: --loop is ignored with --hold / --hold-only "
            "(playback runs once, then hold until Ctrl+C)."
        )
    if (args.hold or args.hold_only) and args.hold_stale_seconds < args.hold_interval * 2:
        print(
            "WARN: --hold-stale-seconds should be at least ~2× --hold-interval "
            "or tracks may flicker stale in ATAK."
        )
    if args.hold:
        print("  Hold: after playback, refresh stationary tracks until Ctrl+C")
    if args.hold_only:
        print(f"  Hold-only: {args.hold_frame} frame, no playback")
    print(f"Scenario: {args.scenario}")

    if not args.scenario.exists():
        print(f"ERROR: scenario file not found: {args.scenario}")
        return

    scenario = load_scenario(args.scenario)
    bridge = TAKBridge(
        host=args.host,
        port=args.port,
        unicast_targets=ucast,
        multicast=not args.no_multicast,
        mcast_out_ip=args.mcast_iface,
    )

    try:
        play(
            scenario,
            bridge,
            speed=args.speed,
            loop=args.loop,
            linger=args.linger,
            scenario_path=args.scenario if send_plugin_udp else None,
            send_plugin_udp=send_plugin_udp,
            plugin_dest=plugin_dest,
            plugin_host=args.plugin_host,
            plugin_type3_window=args.plugin_type3_window,
            plugin_udp_once=args.once,
            frame_step_sec=args.frame_sec,
            lat_offset_deg=args.lat_offset_deg,
            lon_offset_deg=args.lon_offset_deg,
            hold=args.hold,
            hold_only=args.hold_only,
            hold_interval=args.hold_interval,
            hold_stale_seconds=args.hold_stale_seconds,
            hold_frame=args.hold_frame,
            hold_verbose_refresh=args.hold_verbose_refresh,
        )
    except KeyboardInterrupt:
        print("\n\nInterrupted — clearing all markers...")
        bridge.clear_all()
        print("Done.")


if __name__ == "__main__":
    main()
