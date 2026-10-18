import Icon from '../components/Icon.jsx';
import { COLORS } from '../components/PathMap.jsx';
import { PLACES } from '../data/places.js';
import { departureLabel } from '../lib/time.js';

export default function Home({ userName, departure, recents, friendsCount, onSearch, onOpenDeparture, onPick, onGoFriends, onSos }) {
  const suggestions = recents.length ? recents.slice(0, 3) : PLACES.slice(0, 3);

  return (
    <div className="screen" style={{ gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>
          <Icon name="dot" size={14} color={COLORS.lit} /> Current location
        </span>
        <button className="sos-btn" onClick={onSos} aria-label="Emergency options">
          <Icon name="shield" size={18} width={2.2} />SOS
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-2)' }}>Hello {userName || 'Trojan'} 👋</span>
        <h1 className="display" style={{ fontSize: 26, lineHeight: 1.2 }}>Want to find a safety path?</h1>
      </div>

      <div className="search-pill" role="search">
        <button onClick={onSearch} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, height: '100%', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, textAlign: 'left', padding: 0 }}>
          <Icon name="search" size={22} color="var(--text)" /> Where to?
        </button>
        <button className="chip-btn" onClick={onOpenDeparture} aria-label={`Departure: ${departureLabel(departure)}`}>
          <Icon name="calendar" size={18} /> {departure.later ? departureLabel(departure) : 'Later'}
        </button>
      </div>

      <section className="card" style={{ padding: '4px 14px' }} aria-label={recents.length ? 'Recent destinations' : 'Suggested destinations'}>
        <div className="list">
          {suggestions.map((p) => (
            <button key={p.id || p.name} className="list-row" onClick={() => onPick(p)}>
              <span className="list-icon"><Icon name={recents.length ? 'clock' : 'pin'} color="var(--text-2)" /></span>
              <span className="list-text"><span className="list-title">{p.name}</span><span className="list-sub">{p.address || 'North University Park'}</span></span>
              <Icon name="next" size={18} color="var(--muted)" />
            </button>
          ))}
        </div>
      </section>

      <section style={{ borderRadius: 18, padding: 18, background: '#15233A', border: '1px solid #24364F', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="display" style={{ fontSize: 20 }}>Walking after dark?</h2>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--text-2)', lineHeight: 1.45 }}>
          {friendsCount
            ? `${friendsCount} trusted contact${friendsCount > 1 ? 's' : ''} can follow your path and get a heads-up when you arrive.`
            : 'Add a friend or family member so they can follow your path and know when you arrive.'}
        </p>
        <button className="chip-btn" style={{ alignSelf: 'flex-start', background: 'var(--text)', color: 'var(--on-lit)' }} onClick={onGoFriends}>
          {friendsCount ? 'Manage contacts' : 'Add trusted contact'}
        </button>
      </section>
    </div>
  );
}
