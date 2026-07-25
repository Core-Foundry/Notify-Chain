import { useState } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { NotificationTimelineView } from './components/NotificationTimelineView';
import { ActivityFeed } from './components/ActivityFeed';
import { WebhookDashboardPage } from './pages/WebhookDashboardPage';
import { ExportHistoryPage } from './pages/ExportHistoryPage';
import { NotificationSearchPage } from './pages/NotificationSearchPage';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage';

type Tab =
  | 'explorer'
  | 'timeline'
  | 'activity'
  | 'webhooks'
  | 'export-history'
  | 'search'
  | 'preferences';

export function App() {
  const [tab, setTab] = useState<Tab>('explorer');

  return (
    <div className="app">
      <nav className="app-tabs" role="tablist" aria-label="Main navigation">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'explorer'}
          className={`app-tabs__btn${tab === 'explorer' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('explorer')}
        >
          Event Explorer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'timeline'}
          className={`app-tabs__btn${tab === 'timeline' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('timeline')}
        >
          Delivery Timeline
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'activity'}
          className={`app-tabs__btn${tab === 'activity' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('activity')}
        >
          Activity Feed
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'webhooks'}
          className={`app-tabs__btn${tab === 'webhooks' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('webhooks')}
        >
          Webhook Performance
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'export-history'}
          className={`app-tabs__btn${tab === 'export-history' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('export-history')}
        >
          Export History
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          className={`app-tabs__btn${tab === 'search' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('search')}
        >
          Notification Search
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preferences'}
          className={`app-tabs__btn${tab === 'preferences' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('preferences')}
        >
          Preferences
        </button>
      </nav>

      {tab === 'explorer' && <EventExplorerPage />}
      {tab === 'timeline' && <NotificationTimelineView />}
      {tab === 'activity' && <ActivityFeed />}
      {tab === 'webhooks' && <WebhookDashboardPage />}
      {tab === 'export-history' && <ExportHistoryPage />}
      {tab === 'search' && <NotificationSearchPage />}
      {tab === 'preferences' && <NotificationPreferencesPage />}
    </div>
  );
}
