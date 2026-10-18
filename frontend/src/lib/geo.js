// Small geometry helpers for walking-scale distances (equirectangular approximation).
// Points are [lat, lng].

const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function toXY(p, ref) {
  return [(p[1] - ref[1]) * mPerDegLng(ref[0]), (p[0] - ref[0]) * M_PER_DEG_LAT];
}
function fromXY(xy, ref) {
  return [ref[0] + xy[1] / M_PER_DEG_LAT, ref[1] + xy[0] / mPerDegLng(ref[0])];
}

export function distanceM(a, b) {
  const [x, y] = toXY(b, a);
  return Math.hypot(x, y);
}

export function cumulativeLengths(path) {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + distanceM(path[i - 1], path[i]));
  return out;
}

/** Closest point on the path to p: distance from the path, distance along it, and segment index. */
export function projectOnPath(path, p, cum = cumulativeLengths(path)) {
  let best = { distanceM: Infinity, alongM: 0, segIndex: 0, point: path[0] };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const [bx, by] = toXY(path[i + 1], a);
    const [px, py] = toXY(p, a);
    const len2 = bx * bx + by * by || 1;
    const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const cx = t * bx;
    const cy = t * by;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best.distanceM) {
      best = {
        distanceM: d,
        alongM: cum[i] + t * Math.sqrt(len2),
        segIndex: i,
        point: fromXY([cx, cy], a),
      };
    }
  }
  return best;
}

/** Point that lies `d` metres along the path. */
export function pointAlong(path, d, cum = cumulativeLengths(path)) {
  if (d <= 0) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= d) {
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const a = path[i - 1];
      const b = path[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return path[path.length - 1];
}

/** Path split at `d` metres: [walked, remaining]. */
export function splitPath(path, d, cum = cumulativeLengths(path)) {
  const p = pointAlong(path, d, cum);
  const i = cum.findIndex((c) => c >= d);
  const idx = i === -1 ? path.length : i;
  return [[...path.slice(0, idx), p], [p, ...path.slice(idx)]];
}

/** Offset a point by metres east/north (used to simulate leaving the path). */
export function offset(p, eastM, northM) {
  return fromXY([eastM, northM], p);
}
