#!/usr/bin/env python3
"""
Send UTF-8 JSON to the JTAC plugin UDP wire panel (port 6970).

Uses chunked wire format (magic JTCH) so large bundles work on Wi‑Fi MTU.

Strategy:
  - If JSON has a top-level "targets" array (plugin bundle): send **one logical
    message per target** (wrapped JSON). If that still exceeds the per-chunk
    byte budget, send **one message per option** (single recommendation at a time).
  - Otherwise: send the whole file as one logical message (byte-chunked if needed).

Legacy: tiny single-datagram UTF-8 without JTCH header still works on the plugin.

Usage:
  python3 jtac_edge/send_plugin_json_udp.py jtac_edge/data/sample_plugin_targets_bundle.json --host 10.1.63.83
  python3 jtac_edge/send_plugin_json_udp.py jtac_edge/data/scenarios/bay_scenario_jtac.json --phone
  python3 jtac_edge/send_plugin_json_udp.py bundle.json --tablet
  IPs for --phone / --tablet come from ATAK_PHONE_IP / ATAK_TABLET_IP in jtac_edge/data/static_ips.env
  (loaded automatically). --host IP overrides any destination.
  (``jtac_edge/data/scenarios/bay_scenario_jtac.json`` uses top-level ``jtac_plugin_targets`` — same per-target wire as ``targets``.)
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import socket
import struct
import sys
import time
from pathlib import Path
from typing import Any

MAGIC = b"JTCH"
WIRE_VERSION = 1
# Body bytes per UDP payload (stay under typical MTU after 20-byte header).
MAX_BODY = 1000
HEADER_LEN = 20


def _load_static_ips_env() -> None:
    here = Path(__file__).resolve().parent
    env_file = here / "data" / "static_ips.env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and val and key not in os.environ:
            os.environ[key] = val


def _pack_header(msg_id: int, chunk_idx: int, chunk_total: int, body_len: int) -> bytes:
    return struct.pack(
        ">4sBBQHHH",
        MAGIC,
        WIRE_VERSION,
        0,
        msg_id & 0xFFFFFFFFFFFFFFFF,
        chunk_idx & 0xFFFF,
        chunk_total & 0xFFFF,
        body_len & 0xFFFF,
    )


def _send_chunked(sock: socket.socket, host: str, port: int, body: bytes) -> int:
    """Send one logical UTF-8 message (possibly split across UDP datagrams). Returns datagram count."""
    n = max(1, (len(body) + MAX_BODY - 1) // MAX_BODY)
    msg_id = secrets.randbits(64)
    sent = 0
    for i in range(n):
        chunk = body[i * MAX_BODY : (i + 1) * MAX_BODY]
        pkt = _pack_header(msg_id, i, n, len(chunk)) + chunk
        sock.sendto(pkt, (host, port))
        sent += 1
        if n > 1 and i < n - 1:
            time.sleep(0.002)
    return sent


def _json_min(obj: Any) -> bytes:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _targets_from_root(obj: dict[str, Any]) -> list[dict[str, Any]] | None:
    """Bundle shape or bay_scenario_jtac-style `jtac_plugin_targets`."""
    t = obj.get("targets")
    if isinstance(t, list):
        return t
    t2 = obj.get("jtac_plugin_targets")
    if isinstance(t2, list):
        return t2
    return None


def _emit_target_or_split(
    sock: socket.socket,
    host: str,
    port: int,
    meta: dict[str, Any],
    target: dict[str, Any],
) -> int:
    """Try one wrapped message per target; if too large, one message per option."""
    tid = target.get("target_id", "")
    track = target.get("track")
    wrapped = {
        "schema_version": meta.get("schema_version", 1),
        "jtac_self_id": meta.get("jtac_self_id"),
        "generated_at_utc": meta.get("generated_at_utc"),
        "wire_kind": "single_target",
        "target": target,
    }
    b = _json_min(wrapped)
    if len(b) <= MAX_BODY:
        return _send_chunked(sock, host, port, b)

    total_sent = 0
    for opt in target.get("options") or []:
        piece = {
            "schema_version": meta.get("schema_version", 1),
            "jtac_self_id": meta.get("jtac_self_id"),
            "generated_at_utc": meta.get("generated_at_utc"),
            "wire_kind": "single_option",
            "target_id": tid,
            "track": track,
            "option": opt,
        }
        b2 = _json_min(piece)
        total_sent += _send_chunked(sock, host, port, b2)
        time.sleep(0.003)
    return total_sent


def main() -> int:
    _load_static_ips_env()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "json_file",
        type=Path,
        help="Path to JSON (e.g. data/sample_plugin_targets_bundle.json)",
    )
    dest = p.add_mutually_exclusive_group()
    dest.add_argument(
        "--phone",
        action="store_true",
        help="Send to ATAK_PHONE_IP from jtac_edge/data/static_ips.env (after load)",
    )
    dest.add_argument(
        "--tablet",
        action="store_true",
        help="Send to ATAK_TABLET_IP from jtac_edge/data/static_ips.env (after load)",
    )
    p.add_argument(
        "--host",
        "-H",
        default=None,
        metavar="IP",
        help="ATAK LAN IPv4 (overrides --phone / --tablet). If omitted with neither --phone nor --tablet, default is ATAK_PHONE_IP.",
    )
    p.add_argument("--port", type=int, default=6970, help="UDP port (default: 6970)")
    p.add_argument(
        "--legacy-one-datagram",
        action="store_true",
        help="Send whole file as one raw UTF-8 UDP (fails if too large)",
    )
    args = p.parse_args()

    if args.host:
        host = args.host
    elif args.phone:
        host = os.environ.get("ATAK_PHONE_IP")
    elif args.tablet:
        host = os.environ.get("ATAK_TABLET_IP")
    else:
        host = os.environ.get("ATAK_PHONE_IP")

    if not host:
        print(
            "error: no destination host — use --host IP, or --phone / --tablet with "
            "ATAK_PHONE_IP / ATAK_TABLET_IP in jtac_edge/data/static_ips.env",
            file=sys.stderr,
        )
        return 2

    raw = args.json_file.read_bytes()
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        print("error: file must be UTF-8 JSON", e, file=sys.stderr)
        return 1

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    dgrams = 0
    try:
        if args.legacy_one_datagram:
            if len(raw) > 65000:
                print("error: file too large for single datagram", file=sys.stderr)
                return 1
            sock.sendto(raw, (host, args.port))
            dgrams = 1
        elif isinstance(obj, dict) and _targets_from_root(obj) is not None:
            targets = _targets_from_root(obj)
            assert targets is not None
            meta = {
                "schema_version": obj.get("schema_version", 1),
                "jtac_self_id": obj.get("jtac_self_id")
                or obj.get("scenario", "JTAC"),
                "generated_at_utc": obj.get("generated_at_utc"),
            }
            for t in targets:
                tid = t.get("target_id", "?")
                n = _emit_target_or_split(sock, host, args.port, meta, t)
                dgrams += n
                print(f"  target {tid}: {n} datagram(s)", file=sys.stderr)
                time.sleep(0.005)
        else:
            b = _json_min(obj)
            dgrams = _send_chunked(sock, host, args.port, b)
    finally:
        sock.close()

    print(f"sent {dgrams} UDP datagram(s) to {host}:{args.port}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
