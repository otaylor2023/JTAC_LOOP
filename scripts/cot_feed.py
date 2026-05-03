#!/usr/bin/env python3
"""Publish Cursor on Target (CoT) points from a JSON file using PyTAK.

Defaults target FreeTAKServer on the same machine as Docker:
  tcp://127.0.0.1:8087

Phones/tablets use your Mac LAN IP (e.g. 10.1.61.69:8087) in ATAK — only this script's
--host/--port choose where Python connects.

Configuration is via command-line flags only (no environment variables).

Plain TCP (default) does not use PyTAK's full client: FreeTAKServer's TCP stream is incompatible with
PyTAK's RXWorker (readuntil '</event>'), which leads to ~45s BrokenPipe disconnects. We send CoT and
discard inbound bytes on a background drain. Newline after each event is optional (--cot-newline).
By default we append a unique suffix to each event's uid so FTS does not hit duplicate DB identity
errors on repeat publishes; use --stable-uid to keep JSON uids as-is.

Examples:
  python scripts/cot_feed.py
  python scripts/cot_feed.py --host 127.0.0.1 --port 8087
  python scripts/cot_feed.py --host 192.168.1.50 --port 8087   # script on another PC
  python scripts/cot_feed.py --tls --tls-ca deploy/fts-certs/ca.pem \\
      --tls-client-cert deploy/fts-certs/Client.p12 --tls-password supersecret
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import pathlib
import random
import sys
import xml.etree.ElementTree as ET
from configparser import ConfigParser
from typing import Any, List, Optional

import pytak

LOGGER = logging.getLogger("cot_feed")


def _repo_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent.parent


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Send CoT points from JSON into FreeTAKServer via PyTAK.",
    )
    p.add_argument(
        "--host",
        default="127.0.0.1",
        help="CoT server host. Use 127.0.0.1 when Docker runs on this Mac (default).",
    )
    p.add_argument(
        "--port",
        type=int,
        default=None,
        metavar="N",
        help="CoT port (default: 8087 for TCP, 8089 if --tls).",
    )
    p.add_argument(
        "--tls",
        action="store_true",
        help="Use TLS (ssl://) instead of tcp://; useful with --tls-ca / --tls-client-cert.",
    )
    p.add_argument(
        "--data",
        type=pathlib.Path,
        default=None,
        help=f"JSON feed file (default: {_repo_root() / 'data' / 'sample_feed.json'}).",
    )
    p.add_argument(
        "--interval",
        type=float,
        default=10.0,
        metavar="SEC",
        help="Seconds between full broadcast cycles (default 10).",
    )
    p.add_argument(
        "--no-reload",
        action="store_true",
        help="Load JSON once; do not reload from disk each cycle.",
    )
    p.add_argument(
        "--no-fts-compat",
        action="store_true",
        help="Disable FTS rate-limit friendly delays between CoT sends.",
    )
    p.add_argument(
        "--reconnect-sec",
        type=float,
        default=15.0,
        metavar="SEC",
        help="Backoff after disconnect before retry (default 15).",
    )
    p.add_argument(
        "--host-id",
        default="pytak-feed",
        metavar="ID",
        help="PyTAK COT_HOST_ID (used with --hello).",
    )
    p.add_argument(
        "--hello",
        action="store_true",
        help="Send PyTAK hello/takPing on connect. Off by default; enabling can confuse FreeTAKServer (bad fd / jtac spam in logs).",
    )
    p.add_argument("-v", "--verbose", action="store_true", help="Debug logging.")

    # TLS client options (only used when --tls)
    p.add_argument("--tls-ca", default=None, metavar="PATH", help="CA bundle (PEM).")
    p.add_argument(
        "--tls-client-cert",
        default=None,
        metavar="PATH",
        help="Client cert (PEM or PKCS12 .p12).",
    )
    p.add_argument("--tls-client-key", default=None, metavar="PATH", help="Client key (PEM).")
    p.add_argument("--tls-password", default=None, metavar="PASS", help="Password for P12.")
    p.add_argument(
        "--tls-insecure",
        action="store_true",
        help="Set PYTAK_TLS_DONT_VERIFY (lab only).",
    )
    p.add_argument(
        "--cot-newline",
        action="store_true",
        help="Append newline after each CoT XML (off by default; some stacks prefer raw concatenation).",
    )
    p.add_argument(
        "--stable-uid",
        action="store_true",
        help="Do not add a per-emit suffix to uid (default: add suffix to avoid FTS duplicate Event rows).",
    )

    ns = p.parse_args(argv)

    if ns.port is None:
        ns.port = 8089 if ns.tls else 8087
    if ns.data is None:
        ns.data = _repo_root() / "data" / "sample_feed.json"
    ns.data = ns.data.expanduser().resolve()

    return ns


def build_config(args: argparse.Namespace) -> Any:
    """Build PyTAK ConfigParser section from parsed flags."""
    cp = ConfigParser()
    cp.add_section("pytak")
    sec = cp["pytak"]

    scheme = "tls" if args.tls else "tcp"
    sec["COT_URL"] = f"{scheme}://{args.host}:{args.port}"
    sec["COT_HOST_ID"] = args.host_id
    # PyTAK treats any non-empty FTS_COMPAT as truthy; omit entirely to disable.
    if not args.no_fts_compat:
        sec["FTS_COMPAT"] = "1"

    # Default: no hello — FTS treats hello as a separate routable client and often breaks relay (Errno 9).
    if not args.hello:
        sec["PYTAK_NO_HELLO"] = "1"

    if args.tls_ca:
        sec["PYTAK_TLS_CLIENT_CAFILE"] = args.tls_ca
    if args.tls_client_cert:
        sec["PYTAK_TLS_CLIENT_CERT"] = args.tls_client_cert
    if args.tls_client_key:
        sec["PYTAK_TLS_CLIENT_KEY"] = args.tls_client_key
    if args.tls_password:
        sec["PYTAK_TLS_CLIENT_PASSWORD"] = args.tls_password
    if args.tls_insecure:
        sec["PYTAK_TLS_DONT_VERIFY"] = "1"

    return sec


def load_points(path: pathlib.Path) -> List[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict) and "points" in raw:
        pts = raw["points"]
        if not isinstance(pts, list):
            raise ValueError('"points" must be a JSON array')
        return pts
    raise ValueError("JSON must be a list or an object with a 'points' array")


def build_cot_bytes(pt: dict[str, Any]) -> Optional[bytes]:
    """Build CoT XML; optional JSON field \"remark\" adds <remarks> for ATAK search."""
    root = pytak.gen_cot_xml(
        lat=pt.get("lat"),
        lon=pt.get("lon"),
        uid=pt.get("uid") or "jtac-point",
        stale=float(pt.get("stale", 300)),
        cot_type=pt.get("cot_type") or "a-f-G-U-C",
        callsign=pt.get("callsign"),
    )
    if root is None:
        return None
    remark = pt.get("remark")
    if remark:
        detail = root.find("detail")
        if detail is not None:
            rm = ET.Element("remarks")
            rm.text = str(remark)
            detail.append(rm)
    return pytak.DEFAULT_XML_DECLARATION + b"\n" + ET.tostring(root)


def wrap_cot_payload(cot: bytes, args: argparse.Namespace) -> bytes:
    if args.cot_newline:
        return cot + b"\n"
    return cot


async def fts_compat_delay(args: argparse.Namespace) -> None:
    """Random short pause between CoT sends for FreeTAKServer rate limiting.""" 
    if args.no_fts_compat:
        return
    delay = float(pytak.DEFAULT_SLEEP) * random.random()
    await asyncio.sleep(delay)


async def feed_loop(body: Any, args: argparse.Namespace) -> None:
    """Emit points from JSON on each cycle (shared logic)."""
    reload_each_cycle = not args.no_reload
    points_cache: List[dict[str, Any]] = []
    emit_seq = 0
    while True:
        try:
            if reload_each_cycle or not points_cache:
                points_cache = load_points(args.data)
                LOGGER.info(
                    "Loaded %s point(s) from %s",
                    len(points_cache),
                    args.data,
                )
        except OSError as exc:
            LOGGER.error("Cannot read %s: %s", args.data, exc)
            await asyncio.sleep(min(args.interval, 10.0))
            continue
        except ValueError as exc:
            LOGGER.error("Invalid JSON in %s: %s", args.data, exc)
            await asyncio.sleep(min(args.interval, 10.0))
            continue

        for pt in points_cache:
            emit_seq += 1
            pt_use = dict(pt)
            if not args.stable_uid:
                base_uid = str(pt_use.get("uid") or "jtac-point")
                pt_use["uid"] = f"{base_uid}-{emit_seq}"
            cot = build_cot_bytes(pt_use)
            if cot:
                await body.send(wrap_cot_payload(cot, args))
            await fts_compat_delay(args)

        await asyncio.sleep(args.interval)


async def run_tcp_plain(args: argparse.Namespace) -> None:
    """Plain TCP CoT without PyTAK RXWorker.

    PyTAK's RXWorker uses readuntil('</event>'), which breaks with FreeTAKServer's
    opaque/incomplete TCP replies and idle patterns (~45s disconnect). We only send
    CoT and discard inbound data so the socket stays healthy.
    """
    reader: asyncio.StreamReader
    writer: asyncio.StreamWriter
    reader, writer = await asyncio.open_connection(args.host, args.port)
    LOGGER.info("TCP connected to %s:%s (plain sender + inbound drain)", args.host, args.port)

    async def drain_inbound() -> None:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break

    drain_task = asyncio.create_task(drain_inbound())
    try:

        async def write_cot(cot: bytes) -> None:
            writer.write(cot)
            await writer.drain()

        class WriterSink:
            async def send(self, cot: bytes) -> None:
                await write_cot(cot)

        await feed_loop(WriterSink(), args)
    finally:
        drain_task.cancel()
        try:
            await drain_task
        except asyncio.CancelledError:
            pass
        writer.close()
        try:
            await writer.wait_closed()
        except (ConnectionError, OSError):
            pass


class JsonFeedWorker(pytak.QueueWorker):
    """Reads JSON-defined points and enqueues CoT XML (PyTAK TLS path only)."""

    def __init__(
        self,
        queue: asyncio.Queue,
        config: Any,
        args: argparse.Namespace,
    ) -> None:
        super().__init__(queue, config)
        self.args = args

    async def handle_data(self, data: bytes) -> None:
        await self.put_queue(data)

    async def run(self, _=-1) -> None:
        self._logger.info("Running %s", self.__class__.__name__)

        class QSink:
            def __init__(self, q: asyncio.Queue) -> None:
                self.q = q

            async def send(self, cot: bytes) -> None:
                await self.q.put(cot)

        sink = QSink(self.queue)
        await feed_loop(sink, self.args)


async def run_session_tls_pytak(config: Any, args: argparse.Namespace) -> None:
    clitool = pytak.CLITool(config)
    await clitool.setup()
    clitool.add_tasks({JsonFeedWorker(clitool.tx_queue, config, args)})
    await clitool.run()


async def run_session(args: argparse.Namespace) -> None:
    if args.tls:
        config = build_config(args)
        LOGGER.info("Starting TLS session (COT_URL=%s)", config.get("COT_URL"))
        await run_session_tls_pytak(config, args)
    else:
        LOGGER.info(
            "Starting plain TCP session tcp://%s:%s (no PyTAK RX; FTS-compatible)",
            args.host,
            args.port,
        )
        await run_tcp_plain(args)


async def main_async(args: argparse.Namespace) -> None:
    backoff = args.reconnect_sec
    while True:
        try:
            await run_session(args)
            LOGGER.warning("Session ended; reconnecting in %ss", backoff)
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("Session failed; retrying in %ss", backoff)
        jitter = random.uniform(0, min(5.0, backoff))
        await asyncio.sleep(backoff + jitter)


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        LOGGER.info("Stopped.")


if __name__ == "__main__":
    main()
    sys.exit(0)
