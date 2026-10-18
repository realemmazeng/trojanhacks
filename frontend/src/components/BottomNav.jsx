import Icon from './Icon.jsx';

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'friends', label: 'Friends', icon: 'users' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'account', label: 'Account', icon: 'user' },
];

export default function BottomNav({ tab, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((t) => (
        <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={22} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
