import { useEffect, useMemo, useState } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage';

const VALID_TAB_KEYS = ['explorer', 'preferences'] as const;

type TabKey = (typeof VALID_TAB_KEYS)[number];

function parseActiveTab(search: string): TabKey {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  return VALID_TAB_KEYS.includes(tab as TabKey) ? (tab as TabKey) : 'explorer';
}

export function App() {
  const initialSearch = typeof window !== 'undefined' ? window.location.search : '';
  const [activeTab, setActiveTab] = useState<TabKey>(() => parseActiveTab(initialSearch));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      setActiveTab(parseActiveTab(window.location.search));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [activeTab]);

  const tabLabel = useMemo(
    () => (activeTab === 'preferences' ? 'Notification Preferences' : 'Event Explorer'),
    [activeTab]
  );

  return (
    <div className="app">
      <header className="app__topbar">
        <div className="app__brand">
          <p className="app__brand-eyebrow">Notify Chain</p>
          <h1>{tabLabel}</h1>
        </div>

        <nav className="app__nav" aria-label="Dashboard tabs">
          <button
            type="button"
            className={`app__tab ${activeTab === 'explorer' ? 'app__tab--active' : ''}`}
            onClick={() => setActiveTab('explorer')}
          >
            Event Explorer
          </button>
          <button
            type="button"
            className={`app__tab ${activeTab === 'preferences' ? 'app__tab--active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            Notification Preferences
          </button>
        </nav>
      </header>

      {activeTab === 'preferences' ? <NotificationPreferencesPage /> : <EventExplorerPage />}
    </div>
  );
}
