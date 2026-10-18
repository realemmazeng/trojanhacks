import { useEffect, useState } from 'react';
import BottomNav from './components/BottomNav.jsx';
import { DepartureSheet } from './components/Sheets.jsx';
import Splash from './screens/Splash.jsx';
import Login from './screens/Login.jsx';
import Home from './screens/Home.jsx';
import Search from './screens/Search.jsx';
import Friends from './screens/Friends.jsx';
import Activity from './screens/Activity.jsx';
import Account from './screens/Account.jsx';
import Recommended from './screens/Recommended.jsx';
import Why from './screens/Why.jsx';
import Tracking from './screens/Tracking.jsx';
import Arrived from './screens/Arrived.jsx';
import { getPath, usingMock } from './api.js';
import { CURRENT_LOCATION, PLACES, inServiceArea } from './data/places.js';
import { load, save, uid } from './lib/store.js';
import { departAt } from './lib/time.js';

// Shown in Activity until the user finishes a real walk.
const SAMPLE_HISTORY = [
  { id: 's1', sample: true, destination: PLACES[0], date: new Date(Date.now() - 86400000).toISOString(), minutes: 15, sharedWith: [] },
  { id: 's2', sample: true, destination: PLACES[1], date: new Date(Date.now() - 3 * 86400000).toISOString(), minutes: 9, sharedWith: [] },
];

/**
 * Screens: splash → login → tabs (home | friends | activity | account)
 * Walk flow from Home: search → recommended (→ why) → tracking → arrived → tabs
 */
export default function App() {
  const [screen, setScreen] = useState('splash');
  const [tab, setTab] = useState('home');
  const [user, setUser] = useState(() => load('user', { name: '', email: '' }));
  const [friends, setFriends] = useState(() => load('friends', []));
  const [history, setHistory] = useState(() => load('history', SAMPLE_HISTORY));
  const [departure, setDeparture] = useState({ later: false, day: 0, time: '21:40' });
  const [showDeparture, setShowDeparture] = useState(false);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => save('user', user), [user]);
  useEffect(() => save('friends', friends), [friends]);
  useEffect(() => save('history', history), [history]);

  const openTab = (t) => { setTab(t); setScreen('tabs'); };
  const realHistory = history.filter((h) => !h.sample);
  const recents = realHistory
    .map((h) => h.destination)
    .filter((d, i, all) => all.findIndex((x) => x.name === d.name) === i);

  const pickDestination = async (dest) => {
    setError('');
    if (!inServiceArea(dest)) {
      setScreen('search');
      setError('That place is outside the area Safety Path covers (W Adams–W Jefferson, S Vermont–S Figueroa).');
      return;
    }
    setScreen('search');
    setLoading(true);
    try {
      const when = departAt(departure);
      const result = await getPath({ origin: CURRENT_LOCATION, destination: dest, departAt: when });
      // Mock data always returns the same path, so pin the destination to where that path ends.
      const end = result.recommended.geometry[result.recommended.geometry.length - 1];
      const destination = usingMock ? { ...dest, lat: end[0], lng: end[1] } : dest;
      setTrip({
        origin: CURRENT_LOCATION,
        destination,
        departAt: when,
        later: departure.later,
        result,
        sharedWith: friends.filter((f) => f.autoShare).map((f) => f.id),
      });
      setScreen('recommended');
    } catch (e) {
      setError(`Couldn't find a path right now. ${e.message}. Try again in a moment.`);
    } finally {
      setLoading(false);
    }
  };

  const finishWalk = () => {
    setHistory((h) => [
      {
        id: uid(),
        destination: { name: trip.destination.name, address: trip.destination.address, lat: trip.destination.lat, lng: trip.destination.lng },
        date: new Date().toISOString(),
        minutes: trip.result.recommended.minutes,
        sharedWith: friends.filter((f) => trip.sharedWith.includes(f.id)).map((f) => f.name),
      },
      ...h.filter((x) => !x.sample),
    ]);
    setScreen('arrived');
  };

  const shareProps = {
    friends,
    onShareChange: (ids) => setTrip((t) => ({ ...t, sharedWith: ids })),
    onAddFriends: () => openTab('friends'),
  };

  return (
    <div className="app">
      {screen === 'splash' && <Splash onStart={() => setScreen(user.name ? 'tabs' : 'login')} />}
      {screen === 'login' && (
        <Login onBack={() => setScreen('splash')} onLogin={(name, email) => { setUser({ name, email }); openTab('home'); }} />
      )}

      {screen === 'tabs' && (
        <div className="tabs-layout">
          {tab === 'home' && (
            <Home
              userName={user.name}
              departure={departure}
              recents={recents}
              friendsCount={friends.length}
              onSearch={() => { setError(''); setScreen('search'); }}
              onOpenDeparture={() => setShowDeparture(true)}
              onPick={pickDestination}
              onGoFriends={() => setTab('friends')}
            />
          )}
          {tab === 'friends' && (
            <Friends
              friends={friends}
              onAdd={(f) => setFriends((all) => [...all, { ...f, id: uid(), autoShare: false }])}
              onRemove={(id) => setFriends((all) => all.filter((f) => f.id !== id))}
              onToggleAuto={(id) => setFriends((all) => all.map((f) => (f.id === id ? { ...f, autoShare: !f.autoShare } : f)))}
            />
          )}
          {tab === 'activity' && <Activity history={history} onWalkAgain={pickDestination} onGoHome={() => setTab('home')} />}
          {tab === 'account' && (
            <Account
              user={user}
              friendsCount={friends.length}
              onGoFriends={() => setTab('friends')}
              onLogout={() => { setUser({ name: '', email: '' }); setScreen('splash'); }}
            />
          )}
          <BottomNav tab={tab} onChange={setTab} />
        </div>
      )}

      {screen === 'search' && (
        <Search
          departure={departure}
          recents={recents}
          loading={loading}
          error={error}
          onOpenDeparture={() => setShowDeparture(true)}
          onPick={pickDestination}
          onBack={() => openTab('home')}
        />
      )}
      {screen === 'recommended' && trip && (
        <Recommended
          trip={trip}
          {...shareProps}
          onBack={() => setScreen('search')}
          onDetails={() => setScreen('why')}
          onStart={() => setScreen('tracking')}
        />
      )}
      {screen === 'why' && trip && <Why trip={trip} onBack={() => setScreen('recommended')} />}
      {screen === 'tracking' && trip && (
        <Tracking trip={trip} {...shareProps} onEnd={() => setScreen('recommended')} onArrive={finishWalk} />
      )}
      {screen === 'arrived' && trip && (
        <Arrived
          trip={trip}
          sharedNames={friends.filter((f) => trip.sharedWith.includes(f.id)).map((f) => f.name)}
          onHome={() => openTab('home')}
        />
      )}

      {showDeparture && (
        <DepartureSheet
          value={departure}
          onClose={() => setShowDeparture(false)}
          onDone={(d) => { setDeparture(d); setShowDeparture(false); }}
        />
      )}
    </div>
  );
}
