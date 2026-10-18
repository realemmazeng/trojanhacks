import { useState } from 'react';
import Icon from '../components/Icon.jsx';

const RELATIONS = ['Family', 'Friend', 'Roommate'];

export default function Friends({ friends, onAdd, onRemove, onToggleAuto, startAdding = false }) {
  const [adding, setAdding] = useState(startAdding || friends.length === 0);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [relation, setRelation] = useState('Family');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Add a name.');
    if (!contact.trim()) return setError('Add a phone number or email so we can reach them.');
    onAdd({ name: name.trim(), contact: contact.trim(), relation });
    setName(''); setContact(''); setRelation('Family'); setError(''); setAdding(false);
  };

  const groups = RELATIONS.map((r) => ({ relation: r, people: friends.filter((f) => f.relation === r) })).filter((g) => g.people.length);

  return (
    <div className="screen" style={{ gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Friends</h1>
        {!adding && <button className="chip-btn" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Add</button>}
      </div>
      <p className="muted" style={{ margin: 0, lineHeight: 1.45 }}>
        Trusted contacts can follow your path and get a message when you arrive. Nothing is shared unless you choose to.
      </p>

      {adding && (
        <form className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={submit}>
          <h2 className="h2">New trusted contact</h2>
          <label className="field">Name
            <input id="friend-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom" autoComplete="off" />
          </label>
          <label className="field">Phone or email
            <input id="friend-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="(213) 555-0123" autoComplete="off" />
          </label>
          <div className="field">Relationship
            <div role="group" aria-label="Relationship" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RELATIONS.map((r) => (
                <button key={r} type="button" className="chip-btn" aria-pressed={relation === r} onClick={() => setRelation(r)}
                  style={relation === r ? { background: 'var(--lit)', color: 'var(--on-lit)' } : undefined}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            {friends.length > 0 && <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setAdding(false)}>Cancel</button>}
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save contact</button>
          </div>
        </form>
      )}

      {groups.map((g) => (
        <section key={g.relation} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 className="section-title">{g.relation.toUpperCase()}</h2>
          <div className="card" style={{ padding: '4px 14px' }}>
            <div className="list">
              {g.people.map((f) => (
                <div key={f.id} className="list-row">
                  <span className="avatar">{f.name.charAt(0).toUpperCase()}</span>
                  <span className="list-text"><span className="list-title">{f.name}</span><span className="list-sub">{f.contact}</span></span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <button className="switch" role="switch" aria-checked={f.autoShare} aria-label={`Share every walk with ${f.name}`} onClick={() => onToggleAuto(f.id)} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>Auto-share</span>
                  </span>
                  <button className="icon-btn" style={{ width: 40, height: 40, borderRadius: 12, background: 'transparent', border: 'none' }} aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.id)}>
                    <Icon name="x" size={18} color="var(--muted)" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
