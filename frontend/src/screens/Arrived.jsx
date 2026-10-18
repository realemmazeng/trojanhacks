import Icon from '../components/Icon.jsx';
import { COLORS } from '../components/PathMap.jsx';

export default function Arrived({ trip, sharedNames, onHome }) {
  const { destination, result } = trip;
  return (
    <div className="screen" style={{ alignItems: 'center', padding: '24px 24px 40px' }}>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
        <div style={{ width: 112, height: 112, borderRadius: 56, background: 'var(--selected)', border: `2px solid ${COLORS.lit}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" size={52} color={COLORS.lit} />
        </div>
        <h1 className="display" style={{ fontSize: 34 }}>Arrived safely ❤️</h1>
        <p style={{ margin: 0, fontSize: 16, color: 'var(--text-2)', lineHeight: 1.45 }}>
          {destination.name} · {result.recommended.minutes} min<br />via the recommended path
        </p>
        {sharedNames.length > 0 && (
          <p className="small" style={{ margin: 0, color: '#9CD0FF' }}>{sharedNames.join(', ')} will see that you arrived.</p>
        )}
      </div>
      <button onClick={onHome} style={{ background: 'none', border: 'none', color: 'var(--lit)', fontSize: 16, fontWeight: 600, padding: 12 }}>
        Back to home
      </button>
    </div>
  );
}
