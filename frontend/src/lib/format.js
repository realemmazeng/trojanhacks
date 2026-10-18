export function formatClock(isoOrDate) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatUpdated(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `today, ${formatClock(d)}` : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDistance(m) {
  const mi = m / 1609.34;
  return mi < 0.1 ? `${Math.round(m * 3.281)} ft` : `${mi.toFixed(1)} mi`;
}
