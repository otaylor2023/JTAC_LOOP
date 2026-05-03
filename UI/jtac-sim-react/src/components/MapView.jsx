import { useEffect, useRef } from 'react';
import L from 'leaflet';

const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Esri World Imagery';
const RAD = Math.PI / 180;
const FAH_HALF = 15; // ±15° corridor around heading

export function mkHostileIcon(primary) {
  const sz = primary ? 24 : 20;
  return L.divIcon({
    className: '',
    html: `<div class="m-hostile-inner${primary ? ' lg' : ''}"></div>`,
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  });
}

export const friendlyIcon = L.divIcon({
  className: '',
  html: '<div class="m-friendly"></div>',
  iconSize: [22, 15],
  iconAnchor: [11, 7],
});

export const selfIcon = L.divIcon({
  className: '',
  html: '<div class="m-self"></div>',
  iconSize: [18, 20],
  iconAnchor: [9, 20],
});

const handleIcon = L.divIcon({
  className: '',
  html: '<div class="m-attack-handle"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Bearing (compass deg) from point A to point B.
function bearing(latA, lngA, latB, lngB) {
  const φ1 = latA * RAD;
  const φ2 = latB * RAD;
  const Δλ = (lngB - lngA) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Project a point `dist` (deg) from origin along compass bearing `brng`.
function project(lat, lng, brng, dist) {
  const θ = brng * RAD;
  return [
    lat + dist * Math.cos(θ),
    lng + (dist * Math.sin(θ)) / Math.cos(lat * RAD),
  ];
}

export default function MapView({
  hostiles,
  friendlies,
  self,
  primaryTargetId,
  heading,
  showAttack = true,
  scenarioActive = false,
  weaponMinSafe = null,
  onChangeHeading,
  resizeKey,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hostileMarkersRef = useRef(new Map());
  const friendlyMarkersRef = useRef(new Map());
  const selfMarkerRef = useRef(null);
  const threatCircleRef = useRef(null);
  const attackLineRef = useRef(null);
  const fahConeRef = useRef(null);
  const blastRingRef = useRef(null);
  const handleMarkerRef = useRef(null);
  const draggingRef = useRef(false);
  const onChangeHeadingRef = useRef(onChangeHeading);

  useEffect(() => {
    onChangeHeadingRef.current = onChangeHeading;
  }, [onChangeHeading]);

  // init once
  useEffect(() => {
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([self.lat, self.lng], 15);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
    map.zoomControl.setPosition('bottomright');
    mapRef.current = map;

    selfMarkerRef.current = L.marker([self.lat, self.lng], { icon: selfIcon })
      .addTo(map)
      .bindPopup(
        `<div class="popup-lbl">JTAC</div><div class="popup-id" style="color:#22d3ee">${self.id}</div>`
      );

    friendlies.forEach(f => {
      const m = L.marker([f.lat, f.lng], { icon: friendlyIcon })
        .addTo(map)
        .bindPopup(
          `<div class="popup-lbl">FRIENDLY</div><div class="popup-id" style="color:#3b82f6">${f.id}</div>`
        );
      friendlyMarkersRef.current.set(f.id, m);
    });

    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
      hostileMarkersRef.current.clear();
      friendlyMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync hostile markers + threat ring + attack visuals
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set();
    let primary = null;

    hostiles.forEach(h => {
      seen.add(h.id);
      const isPrimary = h.id === primaryTargetId;
      if (isPrimary) primary = h;

      let m = hostileMarkersRef.current.get(h.id);
      if (!m) {
        m = L.marker([h.lat, h.lng], { icon: mkHostileIcon(isPrimary) })
          .addTo(map)
          .bindPopup(
            `<div class="popup-lbl">HOSTILE</div><div class="popup-id" style="color:#ef4444">${h.id}</div><div class="popup-type">${h.type}</div>`
          );
        hostileMarkersRef.current.set(h.id, m);
      } else {
        m.setLatLng([h.lat, h.lng]);
        m.setIcon(mkHostileIcon(isPrimary));
      }
    });

    for (const [id, marker] of hostileMarkersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        hostileMarkersRef.current.delete(id);
      }
    }

    if (!primary) return;

    // Threat ring
    if (!threatCircleRef.current) {
      threatCircleRef.current = L.circle([primary.lat, primary.lng], {
        radius: 115,
        color: '#ef4444',
        weight: 1.5,
        dashArray: '5,4',
        fillColor: '#ef4444',
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(map);
    } else {
      threatCircleRef.current.setLatLng([primary.lat, primary.lng]);
    }

    // Attack vector line
    if (showAttack) {
      const dist = 0.015;
      const [fromLat, fromLng] = project(
        primary.lat,
        primary.lng,
        (heading + 180) % 360,
        dist
      );
      const pts = [
        [fromLat, fromLng],
        [primary.lat, primary.lng],
      ];
      if (!attackLineRef.current) {
        attackLineRef.current = L.polyline(pts, {
          color: '#f59e0b',
          weight: 2,
          opacity: 0.85,
          dashArray: '7,5',
          interactive: false,
        }).addTo(map);
      } else {
        attackLineRef.current.setLatLngs(pts);
      }
    } else if (attackLineRef.current) {
      attackLineRef.current.remove();
      attackLineRef.current = null;
    }
  }, [hostiles, primaryTargetId, heading, showAttack]);

  // Scenario-only visuals: FAH cone + blast ring + draggable handle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const primary = hostiles.find(h => h.id === primaryTargetId);

    // tear-down helper
    function clearScenarioLayers() {
      if (fahConeRef.current) {
        fahConeRef.current.remove();
        fahConeRef.current = null;
      }
      if (blastRingRef.current) {
        blastRingRef.current.remove();
        blastRingRef.current = null;
      }
      if (handleMarkerRef.current) {
        handleMarkerRef.current.remove();
        handleMarkerRef.current = null;
      }
    }

    if (!scenarioActive || !primary) {
      clearScenarioLayers();
      return;
    }

    // FAH cone — translucent wedge from target along ±FAH_HALF° of heading.
    const coneDist = 0.022;
    const apex = [primary.lat, primary.lng];
    const reverse = (heading + 180) % 360;
    const left = project(
      primary.lat,
      primary.lng,
      (reverse - FAH_HALF + 360) % 360,
      coneDist
    );
    const right = project(
      primary.lat,
      primary.lng,
      (reverse + FAH_HALF) % 360,
      coneDist
    );
    const conePts = [apex, left, right];
    if (!fahConeRef.current) {
      fahConeRef.current = L.polygon(conePts, {
        color: '#f59e0b',
        weight: 1,
        opacity: 0.6,
        dashArray: '4,3',
        fillColor: '#f59e0b',
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(map);
    } else {
      fahConeRef.current.setLatLngs(conePts);
    }

    // Blast / min-safe ring — red translucent circle of weapon's min-safe radius.
    if (weaponMinSafe) {
      if (!blastRingRef.current) {
        blastRingRef.current = L.circle(apex, {
          radius: weaponMinSafe,
          color: '#ef4444',
          weight: 1.5,
          fillColor: '#ef4444',
          fillOpacity: 0.18,
          interactive: false,
        }).addTo(map);
      } else {
        blastRingRef.current.setLatLng(apex);
        blastRingRef.current.setRadius(weaponMinSafe);
      }
    } else if (blastRingRef.current) {
      blastRingRef.current.remove();
      blastRingRef.current = null;
    }

    // Draggable heading handle at the tip of the attack vector.
    const handleDist = 0.015;
    const [hLat, hLng] = project(primary.lat, primary.lng, reverse, handleDist);

    if (!handleMarkerRef.current) {
      const marker = L.marker([hLat, hLng], {
        icon: handleIcon,
        draggable: true,
        autoPan: false,
      }).addTo(map);

      marker.on('dragstart', () => {
        draggingRef.current = true;
      });
      marker.on('drag', e => {
        const tgt = hostiles.find(h => h.id === primaryTargetId);
        if (!tgt) return;
        const ll = e.target.getLatLng();
        // bearing target -> handle = "direction from target", so heading = +180.
        const brng = bearing(tgt.lat, tgt.lng, ll.lat, ll.lng);
        const newHeading = Math.round((brng + 180) % 360 / 5) * 5;
        // live update line + cone for responsiveness
        if (attackLineRef.current) {
          attackLineRef.current.setLatLngs([[ll.lat, ll.lng], [tgt.lat, tgt.lng]]);
        }
      });
      marker.on('dragend', e => {
        draggingRef.current = false;
        const tgt = hostiles.find(h => h.id === primaryTargetId);
        if (!tgt) return;
        const ll = e.target.getLatLng();
        const brng = bearing(tgt.lat, tgt.lng, ll.lat, ll.lng);
        const newHeading = Math.round((brng + 180) % 360 / 5) * 5;
        onChangeHeadingRef.current?.((newHeading + 360) % 360);
      });

      handleMarkerRef.current = marker;
    } else if (!draggingRef.current) {
      handleMarkerRef.current.setLatLng([hLat, hLng]);
    }

    return () => {
      // Only tear down on prop change that disables scenarioActive — handled above.
    };
  }, [scenarioActive, hostiles, primaryTargetId, heading, weaponMinSafe]);

  // re-measure when parent layout/screen changes
  useEffect(() => {
    if (!mapRef.current) return;
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(id);
  }, [resizeKey]);

  return <div id="map" ref={containerRef} className="map-root" />;
}
