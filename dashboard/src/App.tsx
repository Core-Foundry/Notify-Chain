import { useState, useRef, useEffect } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { NotificationTimelineView } from './components/NotificationTimelineView';
import { ActivityFeed } from './components/ActivityFeed';
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
  | 'webhooks'
  | 'export-history'
  | 'search'
  | 'preferences'
  | 'templates';

const TAB_ITEMS: { id: Tab; label: string }[] = [
  { id: 'explorer', label: 'Event Explorer' },
  { id: 'timeline', label: 'Delivery Timeline' },
  { id: 'activity', label: 'Activity Feed' },
  { id: 'webhooks', label: 'Webhook Performance' },
  { id: 'export-history', label: 'Export History' },
  { id: 'search', label: 'Notification Search' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'templates', label: 'Templates' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('explorer');
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const events = useEventStore((state) => state.events);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setMenuOpen(false);
  };

  return (
    <div className="app">
      <div className="app__topbar">
        <div className="app__brand">
          <h1 className="app__brand-name">NotifyChain</h1>
          <p className="app__brand-eyebrow">Dashboard</p>
        </div>
        <div className="app__topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <div className="app__nav-wrapper" ref={menuRef}>
            <button
              type="button"
              className="app-nav__toggle"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              aria-controls="app-nav-menu"
              aria-label="Toggle navigation menu"
            >
              <span className="app-nav__toggle-icon">{menuOpen ? '✕' : '☰'}</span>
              <span className="app-nav__toggle-label">{menuOpen ? 'Close' : 'Menu'}</span>
            </button>
            <nav
              id="app-nav-menu"
              className={`app-nav${menuOpen ? ' app-nav--open' : ''}`}
              role="tablist"
              aria-label="Main navigation"
            >
              {TAB_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`app-nav__button${tab === item.id ? ' app-nav__button--active' : ''}`}
                  onClick={() => handleTabChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {tab === 'explorer' && (
        <>
          <EventExplorerPage />
          <DeliveryHeatmap events={events} />
        </>
      )}
      {tab === 'timeline' && <NotificationTimelineView />}
      {tab === 'activity' && <ActivityFeed />}
      {tab === 'webhooks' && <WebhookDashboardPage />}
      {tab === 'export-history' && <ExportHistoryPage />}
      {tab === 'search' && <NotificationSearchPage />}
      {tab === 'preferences' && <NotificationPreferencesPage />}
      {tab === 'templates' && <TemplatesPage />}
    </div>
  );
}
