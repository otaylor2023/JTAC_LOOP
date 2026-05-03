#!/usr/bin/env python3
"""
toy_jetson_las_vegas.py — same detection replay + TAK multicast as toy_jetson.py,
default scenario over open desert northeast of Las Vegas (Nellis / Sunrise Mtn margin).

Uses las_vegas_scenario.json. Override with --scenario if needed.

Usage:
    python toy_jetson_las_vegas.py
    python toy_jetson_las_vegas.py --speed 2.0 --loop
"""

import argparse
import pathlib
import sys

_ROOT = pathlib.Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from toy_jetson import TAKBridge, load_scenario, parse_unicast_targets, play


def parse_args():
    p = argparse.ArgumentParser(
        description="Toy Jetson — Las Vegas outskirts ISR demo"
    )
    p.add_argument(
        "--scenario",
        type=pathlib.Path,
        default=_ROOT / "las_vegas_scenario.json",
        help="Path to scenario JSON (default: las_vegas_scenario.json)",
    )
    p.add_argument("--host", default="239.2.3.1", help="Multicast group")
    p.add_argument("--port", type=int, default=6969, help="Multicast / default unicast port")
    p.add_argument(
        "--unicast",
        action="append",
        default=None,
        metavar="HOST[:PORT]",
        help="UDP unicast CoT to WinTAK (repeatable); port defaults to --port",
    )
    p.add_argument("--no-multicast", action="store_true", help="Unicast only")
    p.add_argument("--mcast-iface", default=None, metavar="LOCAL_IP",
                   help="Multicast egress interface IPv4")
    p.add_argument("--speed", type=float, default=1.0, help="Playback speed multiplier")
    p.add_argument("--loop", action="store_true", help="Loop scenario forever")
    p.add_argument("--linger", action="store_true",
                   help="After scenario, wiggle friendlies forever until Ctrl+C (or set linger_forever in JSON)")
    return p.parse_args()


def main():
    args = parse_args()

    ucast = parse_unicast_targets(args.unicast or [], args.port)
    if args.no_multicast and not ucast:
        print("ERROR: --no-multicast requires at least one --unicast")
        return

    print(f"autoJTAC toy Jetson (Las Vegas)  |  {args.speed}x speed")
    if not args.no_multicast:
        print(f"  Multicast: {args.host}:{args.port}")
    for h, p in ucast:
        print(f"  Unicast:   {h}:{p}")
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
        play(scenario, bridge, speed=args.speed, loop=args.loop, linger=args.linger)
    except KeyboardInterrupt:
        print("\n\nInterrupted — clearing all markers...")
        bridge.clear_all()
        print("Done.")


if __name__ == "__main__":
    main()
