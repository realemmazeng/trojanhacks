// Live navigation module for Safety Path.
// Exposes window.LiveNav with { start, replaceRoute, stop }.
//
// On start():
//   - requests continuous geolocation (`watchPosition`)
//   - draws a blue "you are here" dot that follows the user
//   - computes perpendicular distance from the fix to the recommended polyline
//   - after OFF_ROUTE_THRESHOLD metres for OFF_ROUTE_SECONDS seconds, triggers onReroute
//   - keeps the screen awake (where supported) and the map centred on the user
//   - wires the SOS button + action sheet (DPS, 911, share location)
//
// Off-route detection uses point-to-segment distance in a local flat projection
// (fine at USC scale) so we don't pull in a geo library.

(() => {
  'use strict';

  const OFF_ROUTE_M = 30;        // metres from the polyline before we consider the user "off route"
  const OFF_ROUTE_SEC = 10;      // consecutive seconds of being off-route before we reroute
  const UPDATE_MS = 1500;        // throttle UI updates
  const EARTH = 6371000;

  const nav = {};
  let state = null;

  // ---------- Geometry ----------
  const toXY = (lat, lon, ref) => {
    const rlat = (ref[0] * Math.PI) / 180;
    return [
      ((lon - ref[1]) * Math.PI) / 180 * Math.cos(rlat) * EARTH,
      ((lat - ref[0]) * Math.PI) / 180 * EARTH,
    ];
  };
  const projectCoords = (coords) => {
    const ref = coords[0];
    const pts = coords.map((c) => toXY(c[0], c[1], ref));
    return { ref, pts };
  };
  const pointSegmentDist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (!len2) return [Math.hypot(p[0] - a[0], p[1] - a[1]), 0];
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = a[0] + t * dx, qy = a[1] + t * dy;
    return [Math.hypot(p[0] - qx, p[1] - qy), t];
  };
  // Returns {dist, segIndex, t} for the closest point on the polyline.
  const closestOnRoute = (fix, routeXY) => {
    let best = { dist: Infinity, i: 0, t: 0 };
    for (let i = 0; i < routeXY.length - 1; i++) {
      const [d, t] = pointSegmentDist(fix, routeXY[i], routeXY[i + 1]);
      if (d < best.dist) best = { dist: d, i, t };
    }
    return best;
  };
  // Remaining metres from (segIndex, t) to the end of the route.
  const remainingAfter = (closest, routeXY, segLens, total) => {
    const covered = segLens.slice(0, closest.i).reduce((s, x) => s + x, 0)
                  + closest.t * segLens[closest.i];
    return Math.max(0, total - covered);
  };

  // ---------- "You are here" marker ----------
  const makeMarker = (map) => {
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;'
        + 'border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.25);"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    const m = L.marker([0, 0], { icon, keyboard: false, interactive: false }).addTo(map);
    const accuracy = L.circle([0, 0], { radius: 0, color: '#2563eb', weight: 1,
      fillColor: '#2563eb', fillOpacity: 0.1 }).addTo(map);
    return { marker: m, accuracy };
  };

  // ---------- Public API ----------
  nav.start = ({ map, route, onReroute, onStop }) => {
    if (!navigator.geolocation) {
      alert('Live navigation needs location permission.');
      return;
    }
    state = {
      map, route, onReroute, onStop,
      projected: null, segLens: null, totalLen: 0,
      marker: makeMarker(map), watchId: null, offSince: null, lastUpdate: 0,
      rerouting: false, wakeLock: null,
    };
    nav.replaceRoute(route);

    state.watchId = navigator.geolocation.watchPosition(onFix, (err) => {
      console.warn('watchPosition error:', err);
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });

    // Keep the screen on (iOS Safari doesn't support this; failure is silent).
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((l) => { state.wakeLock = l; }).catch(() => {});
    }

    // Wire the SOS button once per start.
    document.getElementById('sos-btn').onclick = openSOS;
    document.getElementById('stop-btn').onclick = () => nav.stop();
  };

  nav.replaceRoute = (route) => {
    if (!state) return;
    const coords = route.recommended.coords;
    state.route = route;
    state.projected = projectCoords(coords);
    state.segLens = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const [a, b] = [state.projected.pts[i], state.projected.pts[i + 1]];
      state.segLens.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    state.totalLen = state.segLens.reduce((s, x) => s + x, 0);
    state.offSince = null;
    document.getElementById('live-off').hidden = true;
  };

  nav.stop = () => {
    if (!state) return;
    if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
    state.marker.marker.remove();
    state.marker.accuracy.remove();
    if (state.wakeLock) state.wakeLock.release().catch(() => {});
    state.onStop && state.onStop();
    state = null;
  };

  // ---------- Fix handling ----------
  function onFix(pos) {
    if (!state) return;
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    state.marker.marker.setLatLng([lat, lon]);
    state.marker.accuracy.setLatLng([lat, lon]).setRadius(Math.min(60, accuracy || 20));

    // Centre the map on the user, but don't yank it on every tick.
    if (!state.lastCentre || Date.now() - state.lastCentre > 3500) {
      state.map.panTo([lat, lon], { animate: true, duration: 1 });
      state.lastCentre = Date.now();
    }

    // Snap the fix into the route's local XY and check off-route distance.
    const xy = toXY(lat, lon, state.projected.ref);
    const closest = closestOnRoute(xy, state.projected.pts);
    const remainingM = remainingAfter(closest, state.projected.pts, state.segLens, state.totalLen);

    // UI update (throttled)
    if (Date.now() - state.lastUpdate > UPDATE_MS) {
      const mins = Math.max(1, Math.round(remainingM / (1.3 * 60)));
      document.getElementById('live-remaining').textContent =
        `${Math.round(remainingM)} m to destination · ${mins} min`;
      state.lastUpdate = Date.now();
    }

    // Off-route detection: track how long we've been more than OFF_ROUTE_M away.
    const effectiveM = closest.dist - Math.min(25, accuracy || 0) * 0.5;
    if (effectiveM > OFF_ROUTE_M) {
      state.offSince = state.offSince || Date.now();
      if (!state.rerouting && Date.now() - state.offSince > OFF_ROUTE_SEC * 1000) {
        state.rerouting = true;
        document.getElementById('live-off').hidden = false;
        Promise.resolve(state.onReroute && state.onReroute({ lat, lon }))
          .finally(() => {
            // Restart the off-route clock so we wait another OFF_ROUTE_SEC before rerouting again.
            if (state) { state.rerouting = false; state.offSince = null; }
          });
      }
    } else {
      state.offSince = null;
      document.getElementById('live-off').hidden = true;
    }
  }

  // ---------- SOS action sheet ----------
  function openSOS() {
    const sheet = document.getElementById('sos-sheet');
    sheet.showModal();

    const share = document.getElementById('share-loc');
    const detail = document.getElementById('share-loc-detail');
    share.onclick = async () => {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
        const url = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        try {
          await navigator.clipboard.writeText(url);
          detail.textContent = 'Copied! Paste it to a friend.';
        } catch {
          detail.textContent = url;  // clipboard denied: show it so the user can copy by hand
        }
      } catch (err) {
        detail.textContent = `Could not get location: ${err.message || err}`;
      }
    };
    document.getElementById('sos-cancel').onclick = () => sheet.close();
  }

  window.LiveNav = nav;
})();
