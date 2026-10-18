import { useState } from 'react';
import Icon from './Icon.jsx';

export function Sheet({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="h1" style={{ fontSize: 20 }}>{title}</h2>
          <button className="icon-btn" style={{ width: 40, height: 40, borderRadius: 12 }} aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Leave now / plan for later. */
export function DepartureSheet({ value, onDone, onClose }) {
  const [later, setLater] = useState(value.later);
  const [day, setDay] = useState(value.day);
  const [time, setTime] = useState(value.time);
  return (
    <Sheet title="When are you leaving?" onClose={onClose}>
      <div className="segmented" role="group" aria-label="Departure time">
        <button type="button" aria-pressed={!later} onClick={() => setLater(false)}>Leave now</button>
        <button type="button" aria-pressed={later} onClick={() => setLater(true)}>Plan for later</button>
      </div>
      {later && (
        <div style={{ display: 'flex', gap: 10 }}>
          <label className="card" style={{ flex: 1, height: 52, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14, color: 'var(--muted)' }}>Day
            <select id="depart-day" className="select" style={{ width: 'auto', fontSize: 15 }} value={day} onChange={(e) => setDay(Number(e.target.value))}>
              <option value={0}>Today</option>
              <option value={1}>Tomorrow</option>
            </select>
          </label>
          <label className="card" style={{ flex: 1, height: 52, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14, color: 'var(--muted)' }}>Time
            <input id="depart-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 15, fontWeight: 600, colorScheme: 'dark' }} />
          </label>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>Lighting and street activity are scored for the time you leave.</p>
      <button className="btn btn-primary" onClick={() => onDone({ later, day, time })}>Done</button>
    </Sheet>
  );
}

/** Pick trusted contacts to share a path with. */
export function ShareSheet({ friends, selected, onDone, onClose, onAddFriends }) {
  const [picked, setPicked] = useState(selected);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Sheet title="Share your path" onClose={onClose}>
      {friends.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No trusted contacts yet. Add friends or family to share your walks.</p>
      ) : (
        <div className="list">
          {friends.map((f) => (
            <button key={f.id} className="list-row" onClick={() => toggle(f.id)} aria-pressed={picked.includes(f.id)}>
              <span className="avatar">{f.name.charAt(0).toUpperCase()}</span>
              <span className="list-text"><span className="list-title">{f.name}</span><span className="list-sub">{f.relation} · {f.contact}</span></span>
              <span className="check-box" data-on={picked.includes(f.id)}>{picked.includes(f.id) && <Icon name="check" size={16} width={3} />}</span>
            </button>
          ))}
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>They'll see your path, ETA and when you arrive.</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onAddFriends}><Icon name="plus" size={18} /> Add contact</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onDone(picked)}>{picked.length ? `Share with ${picked.length}` : 'Done'}</button>
      </div>
    </Sheet>
  );
}
