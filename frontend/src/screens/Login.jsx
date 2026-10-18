import { useState } from 'react';
import Icon from '../components/Icon.jsx';

// v1: no real auth. We only keep a display name for "Hello [Name]".
export default function Login({ onBack, onLogin }) {
  const [email, setEmail] = useState('');

  const nameFromEmail = () => {
    const local = email.split('@')[0] || '';
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Trojan';
  };

  return (
    <form
      className="screen"
      style={{ gap: 24 }}
      onSubmit={(e) => { e.preventDefault(); onLogin(nameFromEmail(), email); }}
    >
      <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={22} /></button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 className="display" style={{ fontSize: 30 }}>Welcome back</h1>
        <p className="muted" style={{ margin: 0, fontSize: 16 }}>Log in to plan your walk.</p>
      </div>

      <button type="button" className="btn btn-light" onClick={() => onLogin('Trojan', '')}>
        <Icon name="campus" /> Continue with USC NetID
      </button>

      <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />or with email<span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">USC email
          <input id="login-email" className="input" type="email" placeholder="ttrojan@usc.edu" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">Password
          <input className="input" type="password" placeholder="••••••••" autoComplete="current-password" />
        </label>
      </div>

      <div className="grow" />
      <button type="submit" className="btn btn-primary" style={{ height: 56 }}>Log in</button>
    </form>
  );
}
