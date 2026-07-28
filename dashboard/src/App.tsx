import { useState } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { NotificationTimelineView } from './components/NotificationTimelineView';
import { ActivityFeed } from './components/ActivityFeed';
import { UserActivityTimeline } from './components/UserActivityTimeline';
import { RetryStatisticsPanel } from './components/RetryStatisticsPanel';
import { WebhookDashboardPage } from './pages/WebhookDashboardPage';
import { ExportHistoryPage } from './pages/ExportHistoryPage';
import { NotificationSearchPage } from './pages/NotificationSearchPage';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { DeliveryHeatmap } from './components/DeliveryHeatmap';
import { useEventStore } from './store/eventStore';

type Tab =
  | 'explorer'
  | 'timeline'
  | 'activity'
  | 'user-activity'
  | 'retry-stats'
  | 'webhooks'
  | 'export-history'
  | 'search'
  | 'preferences'
  | 'templates';

export function App() {
  const [tab, setTab] = useState<Tab>('explorer');
  const { theme, toggleTheme } = useTheme();
  const events = useEventStore((state) => state.events);

  return (
    <div className="app">
      <div className="app__theme-bar">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
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
          aria-selected={tab === 'user-activity'}
          className={`app-tabs__btn${tab === 'user-activity' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('user-activity')}
        >
          User Activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'retry-stats'}
          className={`app-tabs__btn${tab === 'retry-stats' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('retry-stats')}
        >
          Retry Stats
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'templates'}
          className={`app-tabs__btn${tab === 'templates' ? ' app-tabs__btn--active' : ''}`}
          onClick={() => setTab('templates')}
        >
          Templates
        </button>
      </nav>

      {tab === 'explorer' && (
        <>
          <EventExplorerPage />
          <DeliveryHeatmap events={events} />
        </>
      )}
      {tab === 'timeline' && <NotificationTimelineView />}
      {tab === 'activity' && <ActivityFeed />}
      {tab === 'user-activity' && <UserActivityTimeline />}
      {tab === 'retry-stats' && <RetryStatisticsPanel />}
      {tab === 'webhooks' && <WebhookDashboardPage />}
      {tab === 'export-history' && <ExportHistoryPage />}
      {tab === 'search' && <NotificationSearchPage />}
      {tab === 'preferences' && <NotificationPreferencesPage />}
      {tab === 'templates' && <TemplatesPage />}
    </div>
  );
}
