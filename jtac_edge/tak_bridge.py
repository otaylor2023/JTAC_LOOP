# tak_bridge.py
import socket
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
import json

class TAKBridge:
    
    MULTICAST_GROUP = "239.2.3.1"
    MULTICAST_PORT = 6969
    
    # CoT type mappings
    TYPES = {
        "hostile":   "a-h-G-U-C",
        "friendly":  "a-f-G-U-C",
        "unknown":   "a-u-G-U-C",
        "neutral":   "a-n-G-U-C",
    }
    
    def __init__(self, multicast_group=MULTICAST_GROUP, 
                 port=MULTICAST_PORT, ttl=64):
        self.multicast_group = multicast_group
        self.port = port
        self.ttl = ttl
        self.active_markers = {}  # uid → detection dict
        
        self._sock = socket.socket(
            socket.AF_INET, 
            socket.SOCK_DGRAM, 
            socket.IPPROTO_UDP
        )
        self._sock.setsockopt(
            socket.IPPROTO_IP, 
            socket.IP_MULTICAST_TTL, 
            ttl
        )
    
    def send_target(self,
                    uid: str,
                    lat: float,
                    lon: float,
                    callsign: str,
                    classification: str = "unknown",
                    confidence: float = 0.0,
                    stale_seconds: int = 30,
                    nine_line: Optional[dict] = None,
                    extra: Optional[dict] = None):
        """Send or update a target marker. Same UID = update in place."""
        
        now = datetime.now(timezone.utc)
        stale = now + timedelta(seconds=stale_seconds)
        fmt = "%Y-%m-%dT%H:%M:%SZ"
        cot_type = self.TYPES.get(classification, self.TYPES["unknown"])
        
        # build remarks — structured so plugin can parse it
        payload = {
            "confidence": round(confidence, 2),
            "classification": classification,
        }
        if nine_line:
            payload["nine_line"] = nine_line
        if extra:
            payload.update(extra)
            
        remarks = f"AUTOJTAC::{json.dumps(payload)}"
        
        cot = f"""<?xml version="1.0"?>
<event version="2.0" uid="{uid}" type="{cot_type}"
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
        
        self._send(cot)
        self.active_markers[uid] = {
            "lat": lat, "lon": lon,
            "callsign": callsign,
            "classification": classification,
            "confidence": confidence,
            "last_seen": now.isoformat()
        }
    
    def delete_target(self, uid: str):
        """Remove a marker from the map."""
        now = datetime.now(timezone.utc)
        fmt = "%Y-%m-%dT%H:%M:%SZ"
        
        cot = f"""<?xml version="1.0"?>
<event version="2.0" uid="{uid}" type="t-x-d-d"
       time="{now.strftime(fmt)}"
       start="{now.strftime(fmt)}"
       stale="{now.strftime(fmt)}"
       how="m-g">
  <point lat="0" lon="0" hae="0" ce="9999999" le="9999999"/>
  <detail/>
</event>"""
        
        self._send(cot)
        self.active_markers.pop(uid, None)
    
    def update_target(self, uid: str, **kwargs):
        """Update fields on an existing marker."""
        if uid not in self.active_markers:
            return
        current = self.active_markers[uid]
        current.update(kwargs)
        self.send_target(uid, **current)
    
    def clear_all(self):
        """Delete every active marker."""
        for uid in list(self.active_markers.keys()):
            self.delete_target(uid)
    
    def sync_detections(self, detections: list[dict]):
        """
        Main method for your detection loop.
        Pass in current frame's detections, library handles
        adding new ones, updating existing, removing stale ones.
        
        Each detection dict needs:
          uid, lat, lon, callsign, classification, confidence
        """
        current_uids = {d["uid"] for d in detections}
        
        # remove markers no longer detected
        for uid in list(self.active_markers.keys()):
            if uid not in current_uids:
                self.delete_target(uid)
        
        # add or update current detections
        for det in detections:
            self.send_target(
                uid=det["uid"],
                lat=det["lat"],
                lon=det["lon"],
                callsign=det.get("callsign", det["uid"]),
                classification=det.get("classification", "unknown"),
                confidence=det.get("confidence", 0.0),
                stale_seconds=det.get("stale_seconds", 30),
                nine_line=det.get("nine_line"),
            )
            time.sleep(0.05)  # small delay between sends
    
    def _send(self, cot: str):
        self._sock.sendto(
            cot.encode(), 
            (self.multicast_group, self.port)
        )
    
    def __del__(self):
        self._sock.close()