export default function Splash({ onStart }) {
  return (
    <div className="screen" style={{ justifyContent: 'space-between' }}>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
        <div style={{ width: 88, height: 88, borderRadius: 26, background: 'var(--lit)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0B1520" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Safety Path logo">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
            <path d="M9.5 16v-3h5v-3" />
          </svg>
        </div>
        <h1 className="display" style={{ fontSize: 36, lineHeight: 1.15 }}>
          Safety Path<br /><span style={{ color: 'var(--lit)' }}>at USC</span>
        </h1>
        <p style={{ margin: 0, fontSize: 17, color: 'var(--text-2)', lineHeight: 1.45 }}>
          Walk home smarter around USC,<br />not just faster.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <button className="btn btn-primary" style={{ width: '100%', height: 56 }} onClick={onStart}>Get started</button>
        <span className="small muted">For USC students · North University Park</span>
      </div>
    </div>
  );
}
