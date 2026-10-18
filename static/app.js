// Safety Path — Google Maps-style frontend for the stdlib backend.
// Depends on Leaflet (loaded in index.html) and window.LiveNav (static/nav.js).

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  // Tiny DOM helper. No innerHTML to avoid XSS surface -- every child is appended as a text node
  // or an element, so even reasons/labels from the API are rendered as plain text.
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids) n.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ''));
    return n;
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;

  const USC = [34.0224, -118.2851];

  // ---------- Map setup ----------
  const map = L.map('map', { zoomControl: false }).setView(USC, 15);
  window._map = map;  // exposed for the live-nav controller and for in-browser debugging
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19, className: prefersDark ? 'tiles-dark' : '',
  }).addTo(map);

  // Layers (declared once, reused per route)
  const layers = {
    recommended: L.polyline([], { color: css('--safe'), weight: 7, opacity: 0.92, lineCap: 'round' }).addTo(map),
    fastest: L.polyline([], { color: css('--short'), weight: 4, opacity: 0.65, dashArray: '6 8' }).addTo(map),
    from: null, to: null,
  };
  const setPin = (which, latlon) => {
    if (!latlon) return;
    if (layers[which]) layers[which].remove();
    layers[which] = L.marker(latlon, {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${
          which === 'from' ? css('--safe') : css('--risk')
        };border:3px solid white;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
      draggable: true, keyboard: false,
    }).addTo(map);
    layers[which].on('dragend', (ev) => {
      const { lat, lng } = ev.target.getLatLng();
      $(which).value = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      state.coords[which] = [lat, lng];
    });
  };

  // ---------- State ----------
  const state = {
    coords: { from: null, to: null },
    lastRoute: null,
  };
  // Default the time picker to the next 5-minute boundary.
  const now = new Date(Math.ceil(Date.now() / 300000) * 300000);
  $('time').value = now.toISOString().slice(0, 16);

  // ---------- Autocomplete ----------
  function setupAutocomplete(inputId, listId, which) {
    const input = $(inputId);
    const list = $(listId);
    let seq = 0;
    let activeIdx = -1;

    const close = () => { list.hidden = true; list.innerHTML = ''; activeIdx = -1; };
    const render = (results) => {
      list.innerHTML = '';
      if (!results.length) { close(); return; }
      results.forEach((r, i) => {
        const li = el('li', { role: 'option', 'data-i': i },
          el('span', {}, r.label),
          el('span', { class: 'kind' }, r.kind));
        li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
        list.appendChild(li);
      });
      list.hidden = false;
      list.dataset.results = JSON.stringify(results);
    };
    const pick = (i) => {
      const results = JSON.parse(list.dataset.results || '[]');
      const r = results[i];
      if (!r) return;
      input.value = r.label;
      state.coords[which] = [r.lat, r.lon];
      setPin(which, [r.lat, r.lon]);
      fitPins();
      close();
    };
    const search = async (q) => {
      if (!q.trim()) return close();
      const mine = ++seq;
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=5`);
        const data = await r.json();
        if (mine === seq) render(data);
      } catch {
        if (mine === seq) close();
      }
    };

    let timer;
    input.addEventListener('input', () => {
      // Clear any resolved coordinate when the user starts typing again.
      state.coords[which] = null;
      clearTimeout(timer);
      timer = setTimeout(() => search(input.value), 180);
    });
    input.addEventListener('focus', () => { if (input.value.trim()) search(input.value); });
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.addEventListener('keydown', (ev) => {
      if (list.hidden) return;
      const items = list.querySelectorAll('li');
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        activeIdx = Math.min(items.length - 1, activeIdx + 1);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        activeIdx = Math.max(0, activeIdx - 1);
      } else if (ev.key === 'Enter' && activeIdx >= 0) {
        ev.preventDefault();
        pick(activeIdx);
      } else if (ev.key === 'Escape') {
        close();
      }
      items.forEach((li, i) => li.setAttribute('aria-selected', i === activeIdx));
    });
  }
  setupAutocomplete('from', 'from-suggest', 'from');
  setupAutocomplete('to', 'to-suggest', 'to');

  // ---------- GPS "use my location" ----------
  $('gps-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { setStatus('Geolocation is not available.', true); return; }
    setStatus('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlon = [pos.coords.latitude, pos.coords.longitude];
        state.coords.from = latlon;
        $('from').value = 'My location';
        setPin('from', latlon);
        map.setView(latlon, 17);
        setStatus('');
      },
      (err) => setStatus(`Could not get location: ${err.message}`, true),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 });
  });

  // ---------- Safety slider label ----------
  const safetyLabels = { 0: 'fastest', 0.5: 'slight', 1: 'balanced', 1.5: 'cautious', 2: 'max avoid' };
  const safetyInput = $('safety');
  const safetyLabel = $('safety-label');
  const updateSafetyLabel = () => {
    const v = parseFloat(safetyInput.value);
    safetyLabel.textContent = safetyLabels[v] ?? `×${v}`;
  };
  safetyInput.addEventListener('input', updateSafetyLabel);
  updateSafetyLabel();

  // ---------- Fit pins ----------
  function fitPins() {
    const pins = ['from', 'to'].filter((k) => state.coords[k]);
    if (pins.length === 2) {
      map.fitBounds(L.latLngBounds(pins.map((k) => state.coords[k])).pad(0.3));
    } else if (pins.length === 1) {
      map.setView(state.coords[pins[0]], 16);
    }
  }

  // ---------- Status ----------
  function setStatus(msg, isError = false) {
    const s = $('status');
    s.textContent = msg;
    s.classList.toggle('error', isError);
  }

  // ---------- Submit ----------
  $('go-btn').addEventListener('click', findRoute);
  async function findRoute() {
    const fromQ = $('from').value.trim();
    const toQ = $('to').value.trim();
    if (!fromQ || !toQ) { setStatus('Enter both a start and a destination.', true); return; }
    const time = $('time').value || new Date().toISOString().slice(0, 16);
    const safety = $('safety').value;
    const btn = $('go-btn');
    btn.disabled = true; btn.textContent = 'Routing…';
    setStatus('Finding the safer route…');
    const fromArg = state.coords.from ? state.coords.from.join(',') : fromQ;
    const toArg = state.coords.to ? state.coords.to.join(',') : toQ;
    try {
      const r = await fetch(`/api/route?from=${encodeURIComponent(fromArg)}&to=${encodeURIComponent(toArg)}`
        + `&time=${encodeURIComponent(time)}&safety=${safety}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      state.lastRoute = data;
      state.coords.from = [data.from.lat, data.from.lon];
      state.coords.to = [data.to.lat, data.to.lon];
      setPin('from', state.coords.from);
      setPin('to', state.coords.to);
      renderRoute(data);
      // Save the last successful route so the offline shell can show something sensible.
      try { localStorage.setItem('lastRoute', JSON.stringify(data)); } catch {}
      setStatus('');
    } catch (err) {
      setStatus(`Routing failed: ${err.message}`, true);
    } finally {
      btn.disabled = false; btn.textContent = 'Find route';
    }
  }

  // ---------- Render route ----------
  function renderRoute(data) {
    layers.recommended.setLatLngs(data.recommended.coords);
    layers.fastest.setLatLngs(data.fastest.coords);
    const bounds = L.latLngBounds([...data.recommended.coords, ...data.fastest.coords]);
    map.fitBounds(bounds.pad(0.15), { animate: true });

    const rec = data.recommended;
    const fast = data.fastest;
    const metric = (val, lbl) => el('div', { class: 'm' },
      el('div', { class: 'val' }, val), el('div', { class: 'lbl' }, lbl));
    const metricsBox = $('metrics');
    metricsBox.innerHTML = '';
    metricsBox.append(
      metric(`${rec.minutes} min`, `${rec.length_m} m`),
      metric(`${Math.round(rec.patrol_coverage * 100)}%`, 'in DPS patrol'),
      metric(rec.lighting.toFixed(2), 'lighting'),
      metric(rec.incidents_2y_within_60m, 'DPS alerts <60 m'),
    );

    const fastBox = $('fast-metrics');
    fastBox.innerHTML = '';
    const extra = (rec.minutes - fast.minutes).toFixed(1);
    fastBox.append(
      metric(`${fast.minutes} min`, 'fastest'),
      metric(`${Math.round(fast.patrol_coverage * 100)}%`, 'in DPS patrol'),
      metric(fast.lighting.toFixed(2), 'lighting'),
      metric(extra > 0 ? `+${extra} min` : 'same', 'tradeoff'),
    );

    const reasons = $('reasons');
    reasons.innerHTML = '';
    data.reasons.forEach((r) => reasons.appendChild(el('li', {}, r)));
    if (!data.reasons.length) reasons.appendChild(el('li', { class: 'muted' },
      'No large differences — the fastest route is also reasonably safe.'));

    const steps = $('steps');
    steps.innerHTML = '';
    rec.steps.forEach(([name, m]) => steps.appendChild(el('li', {}, `${name} — ${m} m`)));

    const sources = $('sources');
    sources.innerHTML = '';
    (data.sources || []).forEach((s) => {
      const li = el('li');
      li.append(s.url
        ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.name)
        : document.createTextNode(s.name));
      li.append(` — ${s.updated}`);
      sources.appendChild(li);
    });

    $('disclaimer').textContent = data.disclaimer || '';
    $('result').hidden = false;
  }

  // ---------- Close result ----------
  $('result-close').addEventListener('click', () => { $('result').hidden = true; });

  // ---------- About dialog ----------
  $('info-btn').addEventListener('click', () => $('about').showModal());
  $('about-close').addEventListener('click', () => $('about').close());

  // ---------- Live navigation ----------
  $('start-btn').addEventListener('click', () => {
    if (!state.lastRoute) return;
    window.LiveNav.start({
      map,
      route: state.lastRoute,
      // Live-nav rerouting: call the API with the current fix and the original destination.
      onReroute: async (fix) => {
        setStatus('You went off route — recomputing…');
        const r = await fetch(`/api/route?from=${fix.lat},${fix.lon}`
          + `&to=${state.coords.to.join(',')}`
          + `&time=${encodeURIComponent(new Date().toISOString().slice(0, 16))}`
          + `&safety=${$('safety').value}`);
        if (r.ok) {
          const data = await r.json();
          state.lastRoute = data;
          renderRoute(data);
          window.LiveNav.replaceRoute(data);
          setStatus('');
        } else {
          setStatus('Could not recompute route.', true);
        }
      },
      onStop: () => { $('livenav').hidden = true; },
    });
    $('livenav').hidden = false;
    $('result').hidden = true;  // give the map room
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('Service worker registration failed:', err));
    });
  }

  // ---------- Pre-fill from URL (handy for sharing) ----------
  const params = new URLSearchParams(location.search);
  if (params.get('from')) $('from').value = params.get('from');
  if (params.get('to')) $('to').value = params.get('to');
  if (params.get('from') && params.get('to')) findRoute();
})();
