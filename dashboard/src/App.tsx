import { useState } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage';

type Tab = 'explorer' | 'preferences';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('explorer');

  return (
    <div className="app">
      <header className="app__topbar">
        <div className="app__brand">
          <p className="app__brand-eyebrow">Notify Chain</p>
          <h1>{activeTab === 'preferences' ? 'Notification Preferences' : 'Event Explorer'}</h1>
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

      {activeTab === 'explorer' ? <EventExplorerPage /> : <NotificationPreferencesPage />}
    </div>
  );
}
