import { useEffect } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, useMap } from 'react-leaflet';
import { STREETS } from '../data/places.js';

const OFFLINE = import.meta.env.VITE_OFFLINE_MAP === '1';

function StreetLayer() {
  return STREETS.map((s) => {
    const [a, b] = s.coords;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const vertical = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]);
    return (
      <span key={s.name}>
        <Polyline positions={s.coords} pathOptions={{ color: s.major ? '#343E4C' : '#2A3340', weight: s.major ? 10 : 6, opacity: 1 }} interactive={false} />
        <Marker
          position={mid}
          interactive={false}
          icon={L.divIcon({
            className: '',
            html: `<span style="display:inline-block;transform:translate(-50%,-50%)${vertical ? ' rotate(-72deg)' : ''};white-space:nowrap;font:600 10px Figtree,sans-serif;letter-spacing:.4px;color:#8C97A6;text-transform:uppercase">${s.name}</span>`,
          })}
        />
      </span>
    );
  });
}

const COLORS = { lit: '#5FB3FF', caution: '#F2A93B', text: '#EEF1F5', night: '#0E1116' };

function FitBounds({ points, padding }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [padding, padding] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);
  return null;
}

function Follow({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position, { animate: true });
  }, [map, position]);
  return null;
}

/**
 * Dark map with optional paths and markers.
 * - paths: [{ coords, color, dashed, weight, opacity }]
 * - area: polygon coords (service / patrol area)
 * - origin, destination: [lat, lng]
 * - me: { position, color } — the user's live location
 */
export default function PathMap({
  paths = [], area, origin, destination, me, follow = false,
  fitTo, padding = 40, style, label,
}) {
  const fitPoints = fitTo || paths.flatMap((p) => p.coords).concat(area || []);
  return (
    <div role="img" aria-label={label} style={style}>
      <MapContainer
        center={origin || [34.0275, -118.2835]}
        zoom={15}
        zoomControl={false}
        attributionControl
        style={{ width: '100%', height: '100%' }}
      >
        {OFFLINE ? <StreetLayer /> : (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={20}
          />
        )}
        {area && (
          <Polygon
            positions={area}
            pathOptions={{ color: COLORS.lit, weight: 2, opacity: 0.5, dashArray: '6 6', fillOpacity: 0.07 }}
          />
        )}
        {paths.map((p, i) => (
          <Polyline
            key={i}
            positions={p.coords}
            pathOptions={{
              color: p.color,
              weight: p.weight ?? 7,
              opacity: p.opacity ?? 1,
              dashArray: p.dashed ? '10 8' : undefined,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ))}
        {origin && (
          <CircleMarker center={origin} radius={8} pathOptions={{ color: COLORS.night, weight: 3, fillColor: COLORS.lit, fillOpacity: 1 }} />
        )}
        {destination && (
          <CircleMarker center={destination} radius={9} pathOptions={{ color: COLORS.night, weight: 3, fillColor: COLORS.text, fillOpacity: 1 }} />
        )}
        {me && (
          <>
            <CircleMarker center={me.position} radius={20} pathOptions={{ stroke: false, fillColor: me.color, fillOpacity: 0.2 }} />
            <CircleMarker center={me.position} radius={9} pathOptions={{ color: COLORS.night, weight: 3, fillColor: me.color, fillOpacity: 1 }} />
          </>
        )}
        {follow && me ? <Follow position={me.position} /> : <FitBounds points={fitPoints} padding={padding} />}
      </MapContainer>
    </div>
  );
}

export { COLORS };
