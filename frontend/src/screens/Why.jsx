import Icon from '../components/Icon.jsx';
import { COLORS } from '../components/PathMap.jsx';
import { formatUpdated } from '../lib/format.js';

function Bar({ pct, color }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: '#262E3A' }}>
      <div style={{ height: 8, borderRadius: 4, width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export default function Why({ trip, onBack }) {
  const { result } = trip;
  const r = result.recommended;
  const f = result.fastest;
  const maxAlerts = Math.max(3, r.factors.recent_alerts, f.factors.recent_alerts);

  const rows = [
    { name: 'Lighting coverage', note: 'share of path lit', rec: `${r.factors.lighting_pct}%`, fast: `${f.factors.lighting_pct}%`, r: r.factors.lighting_pct, f: f.factors.lighting_pct },
    { name: 'Street activity', note: 'at departure time', rec: r.factors.activity, fast: f.factors.activity, r: r.factors.activity_score, f: f.factors.activity_score },
    { name: 'USC Safety Resource Proximity', note: 'within patrol area', rec: `${r.factors.resource_proximity_pct}%`, fast: `${f.factors.resource_proximity_pct}%`, r: r.factors.resource_proximity_pct, f: f.factors.resource_proximity_pct },
    { name: 'Recent relevant alerts', note: `past ${result.alert_window_days} days, nearby`, rec: String(r.factors.recent_alerts), fast: String(f.factors.recent_alerts), r: (r.factors.recent_alerts / maxAlerts) * 100, f: (f.factors.recent_alerts / maxAlerts) * 100 },
    { name: 'Walking time', note: 'estimated', rec: `${r.minutes} min`, fast: `${f.minutes} min`, r: 100, f: (f.minutes / r.minutes) * 100 },
  ];

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="icon-btn" style={{ width: 44, height: 44, borderRadius: 12 }} aria-label="Back to recommended path" onClick={onBack}><Icon name="back" size={22} width={2.2} /></button>
        <h1 className="h1">Why this path?</h1>
      </div>

      <div className="small" style={{ display: 'flex', gap: 18, color: 'var(--text-2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 6, borderRadius: 3, background: COLORS.lit }} />Recommended</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 0, borderTop: `4px dashed ${COLORS.caution}` }} />Fastest</span>
      </div>

      <div className="card" style={{ padding: '4px 14px' }}>
        {rows.map((row, i) => (
          <div key={row.name} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{row.name}</span>
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{row.note}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px', gap: '6px 10px', alignItems: 'center' }}>
              <Bar pct={row.r} color={COLORS.lit} />
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{row.rec}</span>
              <Bar pct={row.f} color={COLORS.caution} />
              <span style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>{row.fast}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
        Each path is scored on lighting, street activity and USC Safety Resource Proximity, minus recent relevant alerts and extra walking time. The highest score is recommended.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="h2">Data sources</h2>
        <ul className="small" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {result.data_sources.map((s) => (
            <li key={s.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{s.name}</span><span className="muted">{formatUpdated(s.updated_at)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grow" />
      <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 14, background: 'var(--surface-2)', fontSize: 13, color: '#D5DBE3', lineHeight: 1.45 }}>
        <Icon name="info" size={18} color={COLORS.caution} width={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Safety Path recommends paths using available data. It can't guarantee your safety: stay aware, and call 911 in an emergency.</span>
      </div>
    </div>
  );
}
