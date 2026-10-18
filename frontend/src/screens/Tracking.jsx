import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import PathMap, { COLORS } from '../components/PathMap.jsx';
import { ShareSheet } from '../components/Sheets.jsx';
import useTracking from '../lib/useTracking.js';
import { cumulativeLengths, splitPath } from '../lib/geo.js';
import { formatClock, formatDistance } from '../lib/format.js';

// Arrow for the current instruction ("Turn left onto…", "Continue onto…", "Head north on…").
function turnIcon(instruction, index) {
  if (index === 0 || /^(continue|head)/i.test(instruction)) return 'up';
  if (/\bleft\b/i.test(instruction)) return 'left';
  if (/turn around|u-turn/i.test(instruction)) return 'uturn';
  return 'right';
}

export default function Tracking({ trip, friends, onShareChange, onAddFriends, onEnd, onArrive, onReroute, onSos }) {
  const { result, sharedWith } = trip;
  const [sharing, setSharing] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteError, setRerouteError] = useState('');
  const sharedNames = friends.filter((f) => sharedWith.includes(f.id)).map((f) => f.name);
  const rec = result.recommended;
  const path = rec.geometry;
  const cum = useMemo(() => cumulativeLengths(path), [path]);

  // Off the path for long enough: ask the backend for a new path from where the user is now.
  const reroute = async (position) => {
    setRerouting(true);
    setRerouteError('');
    try {
      await onReroute(position);
    } catch (e) {
      setRerouteError(`Couldn't find a new path: ${e.message}`);
    } finally {
      setRerouting(false);
    }
  };

  const t = useTracking({ path, minutes: rec.minutes, onOffPath: reroute });

  useEffect(() => {
    if (t.arrived) {
      const id = setTimeout(onArrive, 800);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [t.arrived, onArrive]);

  // Current and next instruction from the backend's steps
  const steps = rec.steps || [];
  let current = 0;
  steps.forEach((s, i) => { if (cum[s.start_index] <= t.alongM + 1) current = i; });
  const step = steps[current];
  const next = steps[current + 1];
  const toNextM = next ? Math.max(0, cum[next.start_index] - t.alongM) : 0;

  const [walked, remaining] = splitPath(path, t.alongM, cum);
  const eta = new Date(Date.now() + t.remainingMin * 60000);
  const meColor = t.offPath ? COLORS.caution : COLORS.lit;
  const waiting = !t.position;

  return (
    <div className="map-screen">
      <PathMap
        paths={[
          { coords: walked, color: COLORS.lit, opacity: 0.3, weight: 8 },
          { coords: remaining, color: COLORS.lit, weight: 8 },
        ]}
        origin={waiting ? path[0] : undefined}
        destination={path[path.length - 1]}
        me={t.position ? { position: t.position, color: meColor, accuracy: t.accuracy } : undefined}
        follow={!!t.position}
        style={{ position: 'absolute', inset: '0 0 auto 0', height: '72%' }}
        label={t.offPath ? 'Your location is off the safety path' : 'Your location along the safety path'}
      />

      {waiting && (
        <div className="overlay-top" role="status">
          <div className="card" style={{ flex: 1, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center', borderRadius: 18 }}>
            <span className="gps-pulse" aria-hidden="true" />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Finding your location…</span>
              <span className="small muted">Allow location access to follow your walk</span>
            </span>
          </div>
        </div>
      )}

      {!waiting && !t.offPath && step && (
        <div className="overlay-top">
          <div className="card" style={{ flex: 1, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center', borderRadius: 18 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--selected)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={turnIcon(step.instruction, current)} size={24} color={COLORS.lit} width={2.4} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{step.instruction}</span>
              {next && <span className="small muted">Then {next.instruction.charAt(0).toLowerCase() + next.instruction.slice(1)} in {formatDistance(toNextM)}</span>}
            </span>
          </div>
        </div>
      )}

      {!waiting && t.offPath && (
        <div className="overlay-top" role="alert">
          <div style={{ flex: 1, background: 'var(--caution-bg)', border: `1px solid ${COLORS.caution}`, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Icon name="info" size={24} color={COLORS.caution} width={2.2} style={{ flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--caution-text)' }}>You've left the safety path</span>
                <span style={{ fontSize: 13, color: '#E2C9A2' }}>
                  {rerouting ? 'Finding a new safety path from here…' : rerouteError || 'Head back toward the blue line, or get a new path from here.'}
                </span>
              </span>
            </div>
            {!rerouting && (
              <button className="btn" style={{ height: 44, borderRadius: 12, background: COLORS.caution, color: '#1E1607', fontSize: 15 }} onClick={t.requestReroute}>
                New path from here
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sheet" style={{ top: '68%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="display" style={{ fontSize: 24 }}>{t.remainingMin} min left</span>
            <span className="muted" style={{ fontSize: 14 }}>Arrive {formatClock(eta)} · {formatDistance(t.remainingM)} to go</span>
          </span>
          <button className="btn-outline" onClick={onEnd}>End</button>
        </div>
        <div role="progressbar" aria-label="Path progress" aria-valuenow={Math.round(t.progress * 100)} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, borderRadius: 4, background: '#262E3A' }}>
          <div style={{ height: 8, borderRadius: 4, width: `${t.progress * 100}%`, background: COLORS.lit, transition: 'width 0.6s' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1, height: 52, borderRadius: 14, minWidth: 0 }} onClick={() => setSharing(true)}>
            <Icon name="share" size={18} color={sharedNames.length ? COLORS.lit : 'currentColor'} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sharedNames.length ? `Sharing with ${sharedNames.join(', ')}` : 'Share trip'}
            </span>
          </button>
          <button className="btn btn-sos" onClick={onSos} style={{ width: 96, height: 52, borderRadius: 14, fontSize: 15 }} aria-label="Emergency options">
            <Icon name="shield" size={18} width={2.2} /> SOS
          </button>
        </div>
        {t.error && <p className="error" role="alert">{t.error}</p>}
        <p className="muted" style={{ margin: 0, fontSize: 12, textAlign: 'center' }}>Location is used only during this walk. Path doesn't guarantee safety.</p>
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
