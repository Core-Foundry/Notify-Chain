import { useState } from 'react';
import { ActivityFeed } from './components/ActivityFeed';
import { DeliveryHeatmap } from './components/DeliveryHeatmap';
import { NotificationTimelineView } from './components/NotificationTimelineView';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { ExportHistoryPage } from './pages/ExportHistoryPage';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage';
import { NotificationSearchPage } from './pages/NotificationSearchPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { WebhookDashboardPage } from './pages/WebhookDashboardPage';
import { useEventStore } from './store/eventStore';

type Tab =
  | 'explorer'
  | 'preferences'
  | 'timeline'
  | 'activity'
  | 'webhooks'
  | 'export-history'
  | 'search'
  | 'templates';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'explorer', label: 'Event Explorer' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'timeline', label: 'Delivery Timeline' },
  { id: 'activity', label: 'Activity Feed' },
  { id: 'webhooks', label: 'Webhook Performance' },
  { id: 'export-history', label: 'Export History' },
  { id: 'search', label: 'Notification Search' },
  { id: 'templates', label: 'Templates' },
];

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
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`app-tabs__btn${tab === id ? ' app-tabs__btn--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'explorer' && (
        <>
          <EventExplorerPage />
          <DeliveryHeatmap events={events} />
        </>
      )}
      {tab === 'preferences' && <NotificationPreferencesPage />}
      {tab === 'timeline' && <NotificationTimelineView />}
      {tab === 'activity' && <ActivityFeed />}
      {tab === 'webhooks' && <WebhookDashboardPage />}
      {tab === 'export-history' && <ExportHistoryPage />}
      {tab === 'search' && <NotificationSearchPage />}
      {tab === 'templates' && <TemplatesPage />}
    </div>
  );
}
