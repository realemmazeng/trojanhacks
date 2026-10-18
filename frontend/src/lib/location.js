import { CURRENT_LOCATION, inServiceArea } from '../data/places.js';
import { usingMock } from '../api.js';

/**
 * Where the walk starts: the phone's GPS fix when it's inside the service area,
 * otherwise the demo stand-in (USC campus gate). Mock mode always uses the stand-in,
 * because the sample path starts there.
 */
export function currentOrigin() {
  if (usingMock || !('geolocation' in navigator)) return Promise.resolve(CURRENT_LOCATION);
  return new Promise((resolve) => {
    // getCurrentPosition's own timeout only starts once permission is granted, so an
    // unanswered permission prompt would hang forever. Give up after 6 s and use the stand-in.
    setTimeout(() => resolve(CURRENT_LOCATION), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { ...CURRENT_LOCATION, address: 'From your GPS', lat: pos.coords.latitude, lng: pos.coords.longitude };
        resolve(inServiceArea(here) ? here : CURRENT_LOCATION);
      },
      () => resolve(CURRENT_LOCATION),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );
  });
}
