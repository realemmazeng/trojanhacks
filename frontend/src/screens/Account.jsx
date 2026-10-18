import Icon from '../components/Icon.jsx';
import { usingMock } from '../api.js';


export default function Account({ user, friendsCount, onGoFriends, onLogout }) {
  const rows = [
    { icon: 'users', title: 'Trusted contacts', sub: `${friendsCount} saved`, onClick: onGoFriends },
    { icon: 'pin', title: 'Location tracking', sub: 'Phone GPS · only during a walk' },
    { icon: 'info', title: 'Data sources', sub: usingMock ? 'Sample data (backend not connected)' : 'City of LA streetlights · USC DPS' },
    { icon: 'shield', title: 'Emergency', sub: 'SOS calls 911' },
  ];
  return (
    <div className="screen" style={{ gap: 20 }}>
      <h1 className="page-title">Account</h1>

      <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="avatar" style={{ width: 56, height: 56, borderRadius: 28, fontSize: 20 }}>{(user.name || 'T').charAt(0).toUpperCase()}</span>
        <span className="list-text">
          <span className="list-title" style={{ fontSize: 18 }}>{user.name || 'Trojan'}</span>
          <span className="list-sub">{user.email || 'USC student'}</span>
        </span>
      </div>

      <div className="card" style={{ padding: '4px 14px' }}>
        <div className="list">
          {rows.map((r) => {
            const Tag = r.onClick ? 'button' : 'div';
            return (
              <Tag key={r.title} className="list-row" onClick={r.onClick}>
                <span className="list-icon"><Icon name={r.icon} color="var(--text-2)" /></span>
                <span className="list-text"><span className="list-title">{r.title}</span><span className="list-sub">{r.sub}</span></span>
                {r.onClick && <Icon name="next" size={18} color="var(--muted)" />}
              </Tag>
            );
          })}
        </div>
      </div>

      <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
        Safety Path recommends paths using available data. It can't guarantee your safety.
      </p>
      <div className="grow" />
      <button className="btn btn-secondary" onClick={onLogout}>Log out</button>
    </div>
  );
}
