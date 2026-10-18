import { useEffect, useMemo, useRef, useState } from 'react';
import { cumulativeLengths, projectOnPath } from './geo.js';

const OFF_ROUTE_M = 30;     // farther than this from the path counts as off-path…
const OFF_ROUTE_SEC = 10;   // …for this many seconds in a row (GPS drifts) before we reroute
const ARRIVE_M = 25;        // within this distance of the end = arrived
const MAX_ACCURACY_M = 50;  // ignore GPS fixes worse than this

/**
 * Follows the user's real GPS position along `path` ([[lat, lng], …]).
 * When they stay off the path, calls onOffPath([lat, lng]) once so the caller can reroute.
 * Keeps the screen awake while tracking where the browser supports it.
 */
export default function useTracking({ path, minutes, onOffPath }) {
  const cum = useMemo(() => cumulativeLengths(path), [path]);
  const total = cum[cum.length - 1];
  const speed = total / (Math.max(1, minutes) * 60); // m/s implied by the backend's estimate

  const [position, setPosition] = useState(null);   // null until the first good fix
  const [accuracy, setAccuracy] = useState(null);
  const [alongM, setAlongM] = useState(0);
  const [offPath, setOffPath] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [error, setError] = useState('');

  const offSince = useRef(null);
  const reported = useRef(false);
  const onOffPathRef = useRef(onOffPath);
  onOffPathRef.current = onOffPath;

  // A new path (e.g. after rerouting) starts a fresh off-path episode.
  useEffect(() => {
    offSince.current = null;
    reported.current = false;
    setOffPath(false);
    setAlongM(0);
  }, [path]);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Location is not available on this device.');
      return undefined;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        if (acc > MAX_ACCURACY_M) { setError('Weak GPS signal — move into the open if you can.'); return; }
        setError('');
        const p = [pos.coords.latitude, pos.coords.longitude];
        const proj = projectOnPath(path, p, cum);
        setPosition(p);
        setAccuracy(acc);
        // Give GPS noise the benefit of the doubt: subtract part of the reported accuracy.
        const effectiveM = proj.distanceM - Math.min(25, acc || 0) * 0.5;
        if (effectiveM > OFF_ROUTE_M) {
          offSince.current = offSince.current || Date.now();
          if (Date.now() - offSince.current >= OFF_ROUTE_SEC * 1000) {
            setOffPath(true);
            if (!reported.current) {
              reported.current = true;
              onOffPathRef.current && onOffPathRef.current(p);
            }
          }
        } else {
          offSince.current = null;
          reported.current = false;
          setOffPath(false);
          setAlongM(proj.alongM);
          if (total - proj.alongM < ARRIVE_M) setArrived(true);
        }
      },
      (err) => setError(err.code === 1
        ? 'Location permission is off. Turn it on to track your walk.'
        : err.message || 'Could not get your location.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [path, cum, total]);

  // Keep the screen on during the walk (not supported on iOS Safari; fails quietly).
  useEffect(() => {
    let lock = null;
    const request = () => {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      if (lock) lock.release().catch(() => {});
    };
  }, []);

  const remainingM = Math.max(0, total - alongM);
  return {
    position,
    accuracy,
    alongM,
    remainingM,
    remainingMin: Math.max(1, Math.round(remainingM / speed / 60)),
    progress: total ? alongM / total : 0,
    offPath,
    arrived,
    error,
    // Let the user ask for a new path right away instead of waiting out the timer.
    requestReroute: () => {
      if (position) {
        reported.current = true;
        onOffPathRef.current && onOffPathRef.current(position);
      }
    },
  };
}
