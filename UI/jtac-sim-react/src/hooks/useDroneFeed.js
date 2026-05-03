import { useEffect, useState, useRef } from 'react';
import { HOSTILES, FRIENDLIES, SELF } from '../data/units';

// Simulated CoT/UDP feed: hostile positions jitter as if streaming
// from drone CV. Friendly + self positions stay static (for now).
// Swap this hook for a real CoT websocket later — same shape:
//   { hostiles, friendlies, self, lastUpdate }
export function useDroneFeed({ intervalMs = 500, jitter = 0.000045 } = {}) {
  const baseRef = useRef(HOSTILES.map(h => ({ lat: h.lat, lng: h.lng })));
  const tickRef = useRef(0);

  const [hostiles, setHostiles] = useState(HOSTILES);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;
      const t = tickRef.current;
      const next = HOSTILES.map((h, i) => {
        const b = baseRef.current[i];
        return {
          ...h,
          lat: b.lat + Math.sin(t * 0.28 + i * 2.3) * jitter,
          lng: b.lng + Math.cos(t * 0.22 + i * 1.8) * jitter,
        };
      });
      setHostiles(next);
      setLastUpdate(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, jitter]);

  return {
    hostiles,
    friendlies: FRIENDLIES,
    self: SELF,
    lastUpdate,
  };
}

export function useFeedAge(lastUpdate) {
  const [age, setAge] = useState('Just now');
  useEffect(() => {
    const id = setInterval(() => {
      const s = Math.round((Date.now() - lastUpdate) / 1000);
      setAge(s < 2 ? 'Just now' : `${s}s ago`);
    }, 500);
    return () => clearInterval(id);
  }, [lastUpdate]);
  return age;
}
