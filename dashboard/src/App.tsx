import { useState } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { NotificationTimelineView } from './components/NotificationTimelineView';
import { ActivityFeed } from './components/ActivityFeed';
import { ExportHistoryPage } from './pages/ExportHistoryPage';
import { NotificationSearchPage } from './pages/NotificationSearchPage';

type Tab = 'explorer' | 'timeline' | 'activity' | 'export-history' | 'search';

export function App() {
  const [tab, setTab] = useState<Tab>('explorer');

  return (
    <div className="app">
      <nav className="app-tabs" role="tablist" aria-label="Main navigation">
        <button
          role="tab"
          aria-selected={tab === 'explorer'}
          className={`app-tabs__btn${tab === 'explorer' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('explorer')}
        >
          Event Explorer
        </button>
        <button
          role="tab"
          aria-selected={tab === 'timeline'}
          className={`app-tabs__btn${tab === 'timeline' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('timeline')}
        >
          Delivery Timeline
        </button>
        <button
          role="tab"
          aria-selected={tab === 'activity'}
          className={`app-tabs__btn${tab === 'activity' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('activity')}
        >
          Activity Feed
        </button>
        <button
          role="tab"
          aria-selected={tab === 'export-history'}
          className={`app-tabs__btn${tab === 'export-history' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('export-history')}
        >
          Export History
        </button>
        <button
          role="tab"
          aria-selected={tab === 'search'}
          className={`app-tabs__btn${tab === 'search' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('search')}
        >
          Notification Search
        </button>
      </nav>

      {tab === 'explorer' && <EventExplorerPage />}
      {tab === 'timeline' && <NotificationTimelineView />}
      {tab === 'activity' && <ActivityFeed />}
      {tab === 'export-history' && <ExportHistoryPage />}
      {tab === 'search' && <NotificationSearchPage />}
    </div>
  );
}
