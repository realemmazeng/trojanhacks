import { useEffect, useMemo, useRef, useState } from 'react';
import { cumulativeLengths, offset, pointAlong, projectOnPath } from './geo.js';

const OFF_ROUTE_M = 30;        // farther than this from the path counts as off-path
const OFF_ROUTE_READINGS = 3;  // …for this many readings in a row (GPS drifts)
const ARRIVE_M = 25;           // within this distance of the end = arrived
const MAX_ACCURACY_M = 50;     // ignore GPS fixes worse than this
const SIM_SPEEDUP = 20;        // simulated walk runs 20× faster than real time

/**
 * Follows the user along `path` ([[lat, lng], …]).
 * mode "simulate" replays a fake walk; mode "gps" uses navigator.geolocation.
 */
export default function useTracking({ path, minutes, mode = 'simulate' }) {
  const cum = useMemo(() => cumulativeLengths(path), [path]);
  const total = cum[cum.length - 1];
  const speed = total / (minutes * 60); // m/s implied by the backend's estimate

  const [position, setPosition] = useState(path[0]);
  const [alongM, setAlongM] = useState(0);
  const [offPath, setOffPath] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [error, setError] = useState('');

  const offCount = useRef(0);
  const simOff = useRef(false);
  const simAlong = useRef(0);

  // Shared logic for every new position reading.
  const handleReading = (p) => {
    const proj = projectOnPath(path, p, cum);
    setPosition(p);
    if (proj.distanceM > OFF_ROUTE_M) {
      offCount.current += 1;
      if (offCount.current >= OFF_ROUTE_READINGS) setOffPath(true);
    } else {
      offCount.current = 0;
      setOffPath(false);
      setAlongM(proj.alongM);
      if (total - proj.alongM < ARRIVE_M) setArrived(true);
    }
  };

  useEffect(() => {
    if (mode === 'gps') {
      if (!('geolocation' in navigator)) {
        setError('Location is not available on this device.');
        return undefined;
      }
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos.coords.accuracy > MAX_ACCURACY_M) return;
          handleReading([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => setError(err.message || 'Could not get your location.'),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
      return () => navigator.geolocation.clearWatch(id);
    }

    // Simulated walk
    const id = setInterval(() => {
      if (!simOff.current) simAlong.current = Math.min(total, simAlong.current + speed * SIM_SPEEDUP);
      const onPath = pointAlong(path, simAlong.current, cum);
      handleReading(simOff.current ? offset(onPath, 60, 0) : onPath);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, path]);

  const remainingM = Math.max(0, total - alongM);
  return {
    position,
    alongM,
    remainingM,
    remainingMin: Math.max(1, Math.round(remainingM / speed / 60)),
    progress: total ? alongM / total : 0,
    offPath,
    arrived,
    error,
    // Demo-only controls (simulate mode)
    simulateOffPath: () => { simOff.current = true; },
    backToPath: () => { simOff.current = false; },
  };
}
