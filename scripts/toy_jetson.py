#!/usr/bin/env python3
"""
toy_jetson.py — simulated Jetson detection loop for autoJTAC demo.

Reads bay_scenario.json and replays frames in order, sending CoT
to WinTAK/ATAK via UDP multicast. Handles adds, updates, and removes
automatically via TAKBridge.sync_detections().

Usage:
    python toy_jetson.py                          # default: reads bay_scenario.json
    python toy_jetson.py --scenario my_data.json  # custom scenario file
    python toy_jetson.py --speed 2.0              # 2x playback speed
    python toy_jetson.py --loop                   # loop forever
    python toy_jetson.py --host 239.2.3.1         # custom multicast group
"""

import argparse
import json
import socket
import time
import pathlib
from datetime import datetime, timezone, timedelta
from typing import Optional

# ─── TAKBridge (inline so this file is self-contained) ───────────────────────

class TAKBridge:
    MULTICAST_GROUP = "239.2.3.1"
    MULTICAST_PORT  = 6969

    COT_TYPES = {
        "friendly": "a-f-G-U-C",
        "hostile":  "a-h-G-U-C",
        "neutral":  "a-n-G-U-C",
        "unknown":  "a-u-G-U-C",
    }

    def __init__(self, host: str = MULTICAST_GROUP,
                 port: int = MULTICAST_PORT, ttl: int = 64):
        self.host = host
        self.port = port
        self.active: dict[str, dict] = {}

        self._sock = socket.socket(
            socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP
        )
        self._sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, ttl)

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

    def sync_detections(self, detections: list[dict]):
        """Diff current detections against active markers — add, update, remove."""
        incoming_uids = {d["uid"] for d in detections}

        # remove anything no longer detected
        for uid in list(self.active.keys()):
            if uid not in incoming_uids:
                self.delete_target(uid)
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
                stale_seconds  = 30,
            )
            icon = {"friendly": "🟦", "hostile": "🔴",
                    "unknown":  "🟡", "neutral": "⬜"}.get(
                        det.get("classification", "unknown"), "⬜")
            print(f"  [{action}] {icon} {det['callsign']:12s} "
                  f"({det['classification']:8s} {det['confidence']:.0%})  "
                  f"{det['lat']:.4f}, {det['lon']:.4f}"
                  + (f"  — {det['note']}" if det.get("note") else ""))
            time.sleep(0.05)

    def clear_all(self):
        for uid in list(self.active.keys()):
            self.delete_target(uid)

    def _send(self, cot: str):
        self._sock.sendto(cot.encode(), (self.host, self.port))

    def __del__(self):
        try:
            self._sock.close()
        except Exception:
            pass


# ─── Scenario loader ──────────────────────────────────────────────────────────

def load_scenario(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# ─── Main playback loop ───────────────────────────────────────────────────────

def play(scenario: dict, bridge: TAKBridge,
         speed: float = 1.0, loop: bool = False):

    frames = scenario["frames"]
    name   = scenario.get("scenario", "Unknown Scenario")

    run = 0
    while True:
        run += 1
        print(f"\n{'='*60}")
        print(f"  {name}  (run #{run})")
        print(f"{'='*60}")

        for i, frame in enumerate(frames):
            t_sec    = frame["t_sec"]
            frame_no = frame["frame"]
            dets     = frame["detections"]

            print(f"\n── Frame {frame_no:02d}  t={t_sec:>4}s  "
                  f"({len(dets)} detections) ──")

            bridge.sync_detections(dets)

            # sleep until next frame (or end)
            if i < len(frames) - 1:
                next_t   = frames[i + 1]["t_sec"]
                interval = (next_t - t_sec) / speed
                print(f"  ⏱  next frame in {interval:.1f}s ...")
                time.sleep(interval)

        print(f"\n✅ Scenario complete. Clearing all markers in 3s...")
        time.sleep(3)
        bridge.clear_all()
        print("  All markers removed.")

        if not loop:
            break

        print(f"\n🔁 Looping... (Ctrl+C to stop)")
        time.sleep(2)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Toy Jetson detection loop — autoJTAC demo")
    p.add_argument("--scenario", type=pathlib.Path,
                   default=pathlib.Path(__file__).parent / "bay_scenario.json",
                   help="Path to scenario JSON (default: bay_scenario.json)")
    p.add_argument("--host", default="239.2.3.1",
                   help="Multicast group (default: 239.2.3.1)")
    p.add_argument("--port", type=int, default=6969,
                   help="Multicast port (default: 6969)")
    p.add_argument("--speed", type=float, default=1.0,
                   help="Playback speed multiplier (default: 1.0, try 3.0 for fast demo)")
    p.add_argument("--loop", action="store_true",
                   help="Loop scenario forever")
    return p.parse_args()


def main():
    args = parse_args()

    print(f"autoJTAC toy Jetson  |  {args.host}:{args.port}  |  {args.speed}x speed")
    print(f"Scenario: {args.scenario}")

    if not args.scenario.exists():
        print(f"ERROR: scenario file not found: {args.scenario}")
        return

    scenario = load_scenario(args.scenario)
    bridge   = TAKBridge(host=args.host, port=args.port)

    try:
        play(scenario, bridge, speed=args.speed, loop=args.loop)
    except KeyboardInterrupt:
        print("\n\nInterrupted — clearing all markers...")
        bridge.clear_all()
        print("Done.")


if __name__ == "__main__":
    main()
