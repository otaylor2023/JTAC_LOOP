# JTAC_LOOP — FreeTAKServer + Python CoT feed

Run **FreeTAKServer** in Docker, connect **CivTAK** over TLS (or plain TCP for lab), and publish mock or live points from **Python** (`scripts/cot_feed.py`) using [PyTAK](https://github.com/snstac/pytak).

## Prerequisites

- Docker Desktop (or Docker Engine) with Compose v2
- Python 3.10+ recommended (venv strongly recommended on macOS Homebrew Python)

## 1. Start FreeTAKServer

```bash
cd deploy
cp .env.example .env
# Edit .env: set FTS_IP to your Mac's LAN IPv4 (same network as Android phones).
docker compose -f docker-compose.yml up -d
```

- Web UI: `http://127.0.0.1:5000` (default FTS UI port).
- Plain CoT (testing): TCP **8087** on the host.
- SSL CoT (typical CivTAK): TLS **8089** on the host.
- API (internal tools): **19023**.

Official Docker overview: [FreeTAKServer User Docs — Docker](https://freetakteam.github.io/FreeTAKServer-User-Docs/Installation/mechanism/Docker/overview/).

### Lab mode: no Certificate Authority, no client `.p12`, no passwords

Stock FreeTAKServer **cannot** disable client certificates on **8089** (SSL streaming). That port is **mutual TLS** by design—there is no supported “turn off certs” switch for it.

For a **home/lab** setup without importing CA/client certs or typing P12 passwords, use **plain TCP CoT on 8087** instead:

| Setting | Value |
| --- | --- |
| Protocol | **TCP** / plain streaming (**not** SSL)—exact label depends on WinTAK/CivTAK version |
| Host | Your Mac’s LAN IP (lab default **`10.1.61.69`**, same as `FTS_IP` in `deploy/.env`) |
| Port | **8087** |
| Certificate Authority | Skip / do not install |
| Client certificate | Skip / do not install |
| Use Authentication | **Off** / unchecked |

Traffic is **not encrypted** on the wire—only use this on a **trusted LAN**.

**WinTAK:** Manage Server Connections → add connection → **TCP** (not SSL) → host → **8087** → leave cert buttons unused → OK. Then add/enable the stream if your build requires that separately.

## 2. Connect CivTAK (Android)

1. Install CivTAK on the device.
2. Server address must be reachable from the phone: use your Mac’s **Wi‑Fi IP** and port **8089** for SSL streaming.
3. Certificates: after first start, FTS generates material under `/opt/fts/certs` inside the server container. Copy a client package or PEM material for import into CivTAK (same workflow as your FTS version expects).

   Example (adjust container name if yours differs):

   ```bash
   docker exec fts-freetakserver ls -la /opt/fts/certs
   ```

   Use `docker cp` to pull `ca.pem`, client `.p12`, or a generated `clientPackages/*.zip` into the phone / ATAK import flow. Client cert password defaults align with `FTS_CLIENT_CERT_PASSWORD` in `deploy/.env` (default `supersecret` if unchanged).

4. In CivTAK, add a **TAK Server** connection: host = your Mac’s LAN IP, port **8089**, SSL enabled, with matching trust/client certs.

If you only need a quick lab check from the Mac itself, you can use **plain TCP 8087** for Python first; CivTAK in the field normally uses **8089 + TLS**.

## 3. Python CoT feed

Create a virtual environment and install dependencies:

```bash
cd /path/to/JTAC_LOOP
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Run the feed on **the same Mac as Docker** — defaults are **`--host 127.0.0.1 --port 8087`** (no environment variables). ATAK still connects with your LAN IP (**e.g. `10.1.61.69:8087`**).

```bash
source .venv/bin/activate
python scripts/cot_feed.py
python scripts/cot_feed.py --help
```

If `cot_feed.py` runs on **another** PC on the Wi‑Fi, point it at the Mac:  
`python scripts/cot_feed.py --host 10.1.61.69 --port 8087`

SSL injection (uncommon):  
`python scripts/cot_feed.py --tls --tls-ca deploy/fts-certs/ca.pem --tls-client-cert deploy/fts-certs/Client.p12 --tls-password supersecret`  
(add `--tls-insecure` only if needed for lab PKI).

### `cot_feed.py` flags (see `--help`)

| Flag | Description |
| --- | --- |
| `--host` | CoT server (default **`127.0.0.1`**) |
| `--port` | CoT port (default **`8087`**, or **`8089`** when `--tls`) |
| `--tls` | Use TLS (`ssl://`) instead of TCP |
| `--data` | JSON feed path (default `data/sample_feed.json`) |
| `--interval` | Seconds between broadcast cycles (default `10`) |
| `--reconnect-sec` | Backoff after disconnect (default `15`) |
| `--cot-newline` | Append a newline after each event (off by default) |
| `--stable-uid` | Do not add a per-emit uid suffix (default adds one to avoid FTS DB conflicts) |
| `--tls-ca`, `--tls-client-cert`, `--tls-password`, … | TLS client options |

### JSON format

See `data/sample_feed.json`. Each point supports `lat`, `lon`, `uid`, `callsign`, `cot_type`, `stale` (seconds).

## 4. Stop the stack

```bash
cd deploy
docker compose -f docker-compose.yml down
```

## Notes

- Use this stack only for **unclassified / civilian** exercises unless your organization authorizes otherwise.
- Apple Silicon: use container images that publish **arm64** if pulls fail; check FTS release notes.
- If the Web UI fails to start, confirm `deploy/.env` exists and `FTS_IP` is set; the compose file uses a known-good SQLite path for the UI database.
