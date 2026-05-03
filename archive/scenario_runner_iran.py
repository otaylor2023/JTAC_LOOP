#!/usr/bin/env python3
"""
scenario_runner_iran.py — thin entrypoint: Iran default scenario + same CoT/plugin options as jtac_scenario_runner.

Uses jtac_edge/data/old_scenarios/iran_scenario.json by default. Run from repo root: ``python archive/scenario_runner_iran.py``. Override with --scenario if needed.

Usage:
    python archive/scenario_runner_iran.py
    python scenario_runner_iran.py --speed 2.0 --loop
    python scenario_runner_iran.py --tablet
    python scenario_runner_iran.py --phone --once
"""

import argparse
import pathlib
import sys
from typing import Optional

_REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
_EDGE = _REPO_ROOT / "jtac_edge"
if str(_EDGE) not in sys.path:
    sys.path.insert(0, str(_EDGE))

from jtac_scenario_runner import TAKBridge, load_scenario, parse_unicast_targets, play


def parse_args():
    p = argparse.ArgumentParser(
        description="JTAC_LOOP scenario runner — Iran (Isfahan plateau) ISR demo (default scenario)"
    )
    p.add_argument(
        "--scenario",
        type=pathlib.Path,
        default=_EDGE / "data/old_scenarios/iran_scenario.json",
        help="Path to scenario JSON (default: jtac_edge/data/old_scenarios/iran_scenario.json)",
    )
    p.add_argument("--host", default="239.2.3.1", help="Multicast group")
    p.add_argument("--port", type=int, default=6969, help="Multicast / default unicast port")
    p.add_argument(
        "--unicast",
        action="append",
        default=None,
        metavar="HOST[:PORT]",
        help="UDP unicast CoT to WinTAK (repeatable)",
    )
    p.add_argument("--no-multicast", action="store_true", help="Unicast only")
    p.add_argument(
        "--mcast-iface",
        default=None,
        metavar="LOCAL_IP",
        help="Multicast egress interface IPv4",
    )
    p.add_argument("--speed", type=float, default=1.0, help="Playback speed multiplier")
    p.add_argument(
        "--frame-sec",
        type=float,
        default=3.0,
        metavar="SEC",
        help="Fixed seconds between frames (default: 3). Use 0 for legacy scenario timing.",
    )
    p.add_argument(
        "--lat-offset-deg",
        type=float,
        default=0.0002,
        metavar="DEG",
        help="North/south shift on all tracks (default ~22 m north). 0 disables.",
    )
    p.add_argument(
        "--lon-offset-deg",
        type=float,
        default=0.0,
        metavar="DEG",
        help="East/west shift on all tracks (default 0).",
    )
    p.add_argument("--loop", action="store_true", help="Loop scenario forever")
    p.add_argument(
        "--linger",
        action="store_true",
        help="After scenario, refresh wiggle forever until Ctrl+C",
    )
    pg = p.add_mutually_exclusive_group()
    pg.add_argument(
        "--phone",
        action="store_true",
        help="Send plugin recommendations (UDP 6970) to ATAK_PHONE_IP (each frame, or first only with --once)",
    )
    pg.add_argument(
        "--tablet",
        action="store_true",
        help="Send plugin recommendations (UDP 6970) to ATAK_TABLET_IP (each frame, or first only with --once)",
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
        help="Send plugin recommendations only for the first frame (use with --phone / --tablet / --plugin-host)",
    )
    p.add_argument(
        "--hold",
        action="store_true",
        help="After last frame, CoT refresh only until Ctrl+C (no plugin recommendation updates)",
    )
    p.add_argument(
        "--hold-only",
        action="store_true",
        help="Skip playback; CoT hold only until Ctrl+C (no plugin UDP)",
    )
    p.add_argument("--hold-interval", type=float, default=12.0, metavar="SEC", help="CoT refresh interval while holding")
    p.add_argument(
        "--hold-stale-seconds",
        type=int,
        default=120,
        metavar="N",
        help="Stale time while holding (default 120)",
    )
    p.add_argument("--hold-frame", choices=("first", "last"), default="last", help="Frame for hold / hold-only")
    p.add_argument("--hold-verbose-refresh", action="store_true", help="Verbose CoT lines on every hold tick")
    return p.parse_args()


def main():
    args = parse_args()

    ucast = parse_unicast_targets(args.unicast or [], args.port)
    if args.no_multicast and not ucast:
        print("ERROR: --no-multicast requires at least one --unicast")
        return

    print(
        f"JTAC_LOOP scenario runner (Iran)  |  {args.speed}x speed  |  frame step {args.frame_sec:g}s  |  "
        f"Δlat {args.lat_offset_deg:g}° Δlon {args.lon_offset_deg:g}°"
    )
    if not args.no_multicast:
        print(f"  Multicast: {args.host}:{args.port}")
    for h, prt in ucast:
        print(f"  Unicast:   {h}:{prt}")
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
        print("NOTE: --loop ignored with --hold / --hold-only.")
    if (args.hold or args.hold_only) and args.hold_stale_seconds < args.hold_interval * 2:
        print("WARN: --hold-stale-seconds should be at least ~2× --hold-interval.")
    if args.hold:
        print("  Hold: after playback, stationary refresh until Ctrl+C")
    if args.hold_only:
        print(f"  Hold-only: {args.hold_frame} frame")
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
