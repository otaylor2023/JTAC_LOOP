import socket
import time
from datetime import datetime, timezone, timedelta

def send_cot_multicast(lat, lon, uid, callsign, remarks):
    now = datetime.now(timezone.utc)
    stale = now + timedelta(seconds=600)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    
    cot = f"""<?xml version="1.0"?>
<event version="2.0" uid="{uid}" type="a-h-G-U-C"
       time="{now.strftime(fmt)}"
       start="{now.strftime(fmt)}"
       stale="{stale.strftime(fmt)}"
       how="m-g">
  <point lat="{lat}" lon="{lon}" hae="0" ce="9999999" le="9999999"/>
  <detail>
    <contact callsign="{callsign}"/>
    <remarks>{remarks}</remarks>
  </detail>
</event>"""

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 32)
    sock.sendto(cot.encode(), ("239.2.3.1", 6969))
    print(f"Sent: {callsign}")

# test
send_cot_multicast(36.1715, -115.1391, "hostile-vegas", "OPFOR-VEGAS", "test hostile")
send_cot_multicast(37.4419, -122.143, "jtac-local", "JTAC-LOCAL", "test friendly")