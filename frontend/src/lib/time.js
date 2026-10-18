const pad = (n) => String(n).padStart(2, '0');

/** Local ISO date-time (no offset) for "now" or for a planned departure. */
export function departAt({ later, day, time }) {
  const d = new Date();
  if (!later) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  d.setDate(d.getDate() + day);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`;
}

export function departureLabel({ later, day, time }) {
  if (!later) return 'Now';
  const [h, m] = time.split(':').map(Number);
  const t = new Date();
  t.setHours(h, m);
  return `${day === 0 ? 'Today' : 'Tomorrow'} ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
