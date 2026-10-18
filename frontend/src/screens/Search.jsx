import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { COLORS } from '../components/PathMap.jsx';
import { CURRENT_LOCATION, PLACES } from '../data/places.js';
import { searchPlaces } from '../lib/geocode.js';
import { departureLabel } from '../lib/time.js';

export default function Search({ departure, recents, loading, error, onOpenDeparture, onPick, onBack }) {
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced free-text search (Nominatim allows ~1 request/second).
  useEffect(() => {
    if (q.trim().length < 3) { setRemote([]); return undefined; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setSearching(true);
      setRemote(await searchPlaces(q.trim(), ctrl.signal));
      setSearching(false);
    }, 700);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q]);

  const needle = q.trim().toLowerCase();
  const local = [...recents, ...PLACES]
    .filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i)
    .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.address || '').toLowerCase().includes(needle));
  const results = [...local, ...remote.filter((r) => !local.some((l) => l.name === r.name))];

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="icon-btn" aria-label="Back to home" onClick={onBack}><Icon name="back" size={22} width={2.2} /></button>
        <h1 className="h1">Plan your walk</h1>
        <button className="chip-btn" style={{ marginLeft: 'auto' }} onClick={onOpenDeparture}>
          <Icon name="calendar" size={18} /> {departureLabel(departure)} <Icon name="down" size={16} />
        </button>
      </div>

      <div className="card" style={{ padding: '6px 14px', display: 'flex', gap: 12 }}>
        <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0' }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: COLORS.lit }} />
          <span style={{ width: 2, flex: 1, background: 'var(--line-strong)', margin: '4px 0' }} />
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--text)' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>From</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{CURRENT_LOCATION.name}</span>
          </div>
          <label htmlFor="dest-input" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', fontSize: 12, color: 'var(--muted)' }}>To
            <input
              id="dest-input"
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a place or address"
              autoComplete="off"
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 16, fontWeight: 600, padding: '2px 0' }}
            />
          </label>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="muted" role="status" style={{ margin: 0 }}>Finding your safety path…</p>}

      <div className="list" aria-live="polite">
        {results.map((p) => (
          <button key={p.id || p.name} className="list-row" onClick={() => onPick(p)} disabled={loading}>
            <span className="list-icon"><Icon name={recents.some((r) => r.name === p.name) ? 'clock' : 'pin'} color="var(--text-2)" /></span>
            <span className="list-text"><span className="list-title">{p.name}</span><span className="list-sub">{p.address || 'North University Park'}</span></span>
          </button>
        ))}
        {needle && !results.length && !searching && (
          <p className="muted" style={{ margin: '8px 4px' }}>No places found in North University Park. Try a street name, e.g. “Hoover”.</p>
        )}
        {searching && <p className="small muted" style={{ margin: '8px 4px' }}>Searching…</p>}
      </div>

      <div className="grow" />
      <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>
        Paths are available between W Adams Blvd–W Jefferson Blvd and S Vermont Ave–S Figueroa St. Search © OpenStreetMap.
      </p>
    </div>
  );
}
