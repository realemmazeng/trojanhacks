import Icon from '../components/Icon.jsx';
import { formatDate } from '../lib/time.js';

export default function Activity({ history, onWalkAgain, onGoHome }) {
  const totalMin = history.reduce((s, h) => s + h.minutes, 0);
  const shared = history.filter((h) => h.sharedWith.length).length;

  return (
    <div className="screen" style={{ gap: 20 }}>
      <h1 className="page-title">Activity</h1>

      {history.length === 0 ? (
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <h2 className="h2">No walks yet</h2>
          <p className="muted" style={{ margin: 0 }}>Your walks show up here after you arrive, with the path you took and who you shared it with.</p>
          <button className="chip-btn" onClick={onGoHome}>Plan a walk</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {[
              { v: history.length, l: 'walks' },
              { v: totalMin, l: 'minutes' },
              { v: shared, l: 'shared' },
            ].map((s) => (
              <div key={s.l} className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="display" style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
                <span className="small muted">{s.l}</span>
              </div>
            ))}
          </div>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 className="section-title">PAST WALKS</h2>
            <div className="card" style={{ padding: '4px 14px' }}>
              <div className="list">
                {history.map((h) => (
                  <div key={h.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <span className="list-icon"><Icon name="pin" color="var(--text-2)" /></span>
                    <span className="list-text" style={{ gap: 6 }}>
                      <span className="list-title">{h.destination.name}</span>
                      <span className="list-sub">{formatDate(h.date)} · {h.minutes} min</span>
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="badge badge-safe">Arrived safely ❤️</span>
                        {h.sharedWith.length > 0 && <span className="badge badge-muted">Shared with {h.sharedWith.join(', ')}</span>}
                        {h.sample && <span className="badge badge-muted">Sample</span>}
                      </span>
                    </span>
                    <button className="chip-btn" style={{ height: 36, fontSize: 13 }} onClick={() => onWalkAgain(h.destination)}>Walk again</button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
