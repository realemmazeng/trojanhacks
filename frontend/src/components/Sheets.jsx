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

/** Emergency options: USC DPS, 911, and copying a map link to your location. */
export function SosSheet({ onClose }) {
  const [shareText, setShareText] = useState('Puts a Google Maps link to where you are in your clipboard');
  const copyLocation = () => {
    if (!('geolocation' in navigator)) { setShareText('Location is not available on this device.'); return; }
    setShareText('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const url = `https://www.google.com/maps?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        try {
          await navigator.clipboard.writeText(url);
          setShareText('Copied — paste it into a message to a friend.');
        } catch {
          setShareText(url); // clipboard blocked: show the link so it can be copied by hand
        }
      },
      (err) => setShareText(`Couldn't get your location: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  };
  return (
    <Sheet title="Need help?" onClose={onClose}>
      <a className="btn btn-sos" href="tel:+12137404321" style={{ flexDirection: 'column', gap: 2, height: 64 }}>
        <span>Call USC DPS Emergency</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, opacity: 0.9 }}>(213) 740-4321</span>
      </a>
      <a className="btn btn-secondary" href="tel:911" style={{ flexDirection: 'column', gap: 2, height: 64 }}>
        <span>Call 911</span>
        <span className="small muted">City emergency services</span>
      </a>
      <button className="btn btn-secondary" onClick={copyLocation} style={{ flexDirection: 'column', gap: 2, height: 'auto', minHeight: 64, padding: '10px 14px' }}>
        <span>Copy my location</span>
        <span className="small muted" style={{ fontWeight: 500, wordBreak: 'break-all' }} aria-live="polite">{shareText}</span>
      </button>
    </Sheet>
  );
}
