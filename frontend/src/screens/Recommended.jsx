import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import PathMap, { COLORS } from '../components/PathMap.jsx';
import { ShareSheet } from '../components/Sheets.jsx';
import { formatClock, formatUpdated } from '../lib/format.js';

export default function Recommended({ trip, friends, onShareChange, onAddFriends, onBack, onDetails, onStart }) {
  const { origin, destination, departAt, later, result, sharedWith } = trip;
  const rec = result.recommended;
  const fast = result.fastest;
  const [sharing, setSharing] = useState(false);
  const sharedNames = friends.filter((f) => sharedWith.includes(f.id)).map((f) => f.name);

  return (
    <div className="map-screen">
      <PathMap
        paths={[
          { coords: fast.geometry, color: COLORS.caution, dashed: true, weight: 5 },
          { coords: rec.geometry, color: COLORS.lit, weight: 8 },
        ]}
        origin={[origin.lat, origin.lng]}
        destination={[destination.lat, destination.lng]}
        padding={50}
        style={{ position: 'absolute', inset: '0 0 auto 0', height: '42%' }}
        label="Recommended path in solid blue and fastest path in dashed orange"
      />

      <div className="overlay-top">
        <button className="icon-btn" aria-label="Back to path planning" onClick={onBack}><Icon name="back" size={22} width={2.2} /></button>
        <div className="card" style={{ flex: 1, minHeight: 48, padding: '6px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{origin.name.split(' · ')[0]} → {destination.name}</span>
          <span className="muted" style={{ fontSize: 12 }}>{later ? `Leaving ${formatClock(departAt)}` : 'Leaving now'}</span>
        </div>
      </div>

      <div className="sheet" style={{ top: '38%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="overline" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--lit)' }}>
              <span style={{ width: 20, height: 6, borderRadius: 3, background: 'var(--lit)' }} />RECOMMENDED PATH
            </span>
            <span className="display" style={{ fontSize: 30 }}>{rec.minutes} min</span>
          </div>
          {result.extra_minutes > 0 && <span className="tag-caution">+{result.extra_minutes} min vs fastest</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="h2">Why this path?</h2>
            <button className="pill-link" onClick={onDetails}>See details <Icon name="next" size={14} width={2.4} /></button>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 14, color: '#D5DBE3' }}>
            {rec.reasons.map((r) => (
              <li key={r} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Icon name="check" size={16} color={COLORS.lit} width={2.6} />{r}
              </li>
            ))}
            {result.extra_minutes > 0 && (
              <li style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Icon name="clock" size={16} color={COLORS.caution} width={2.4} />
                {result.extra_minutes === 1 ? 'One minute' : `${result.extra_minutes} minutes`} longer than the fastest path
              </li>
            )}
          </ul>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: 'var(--surface-2)' }}>
          <span style={{ width: 20, height: 0, borderTop: `4px dashed ${COLORS.caution}`, flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Fastest path · {fast.minutes} min</span>
            {fast.summary && <span className="small muted">{fast.summary}</span>}
          </span>
        </div>

        <div className="grow" />
        <div className="callout-caution">
          <Icon name="info" size={18} color={COLORS.caution} width={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--caution-text)' }}>{result.disclaimer}</span>
            <span style={{ fontSize: 12, color: '#E2C9A2' }}>Based on available data, updated {formatUpdated(result.updated_at)}. Stay aware.</span>
          </span>
        </div>
        <button className="list-row" style={{ padding: '4px 0' }} onClick={() => setSharing(true)}>
          <Icon name="share" size={18} color={sharedNames.length ? COLORS.lit : 'var(--muted)'} />
          <span className="list-sub" style={{ flex: 1, fontSize: 14, color: sharedNames.length ? 'var(--text-2)' : 'var(--muted)' }}>
            {sharedNames.length ? `Sharing with ${sharedNames.join(', ')}` : 'Not shared with anyone'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--lit)' }}>{sharedNames.length ? 'Edit' : 'Share'}</span>
        </button>
        <button className="btn btn-primary" onClick={onStart}>Start walking</button>
      </div>
      {sharing && (
        <ShareSheet
          friends={friends}
          selected={sharedWith}
          onClose={() => setSharing(false)}
          onDone={(ids) => { onShareChange(ids); setSharing(false); }}
          onAddFriends={onAddFriends}
        />
      )}
    </div>
  );
}
