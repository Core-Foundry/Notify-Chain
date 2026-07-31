import { useState, useRef, useEffect } from 'react';
/**
 * App.tsx
 *
 * Integrates:
 *  - #394 Accessibility: role="tablist", aria-selected, keyboard nav (arrow keys),
 *    focus-visible rings, skip-to-content link
 *  - #396 Navigation Redesign: grouped tabs, active-route highlighting,
 *    mobile hamburger + off-canvas drawer
 *  - #397 Toast: ToastProvider wraps the whole app
 */

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
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
import { MobileNavDrawer, NAV_ITEMS, type Tab } from './components/MobileNavDrawer';
import { ToastProvider } from './context/ToastContext';
import { useTheme } from './hooks/useTheme';
import { DeliveryHeatmap } from './components/DeliveryHeatmap';
import { useEventStore } from './store/eventStore';
import { SyncStatus } from './components/SyncStatus';

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
export function App() {
  const [tab, setTab] = useState<Tab>('explorer');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const events = useEventStore((state) => state.events);
  const tabListRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // ── Keyboard navigation inside tablist (arrow keys) ──────────────────────
  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const tabs = Array.from(
        tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
      );
      const current = tabs.findIndex((el) => el === document.activeElement);

      let next = current;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = (current + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        next = (current - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        next = tabs.length - 1;
      }

      if (next !== current) {
        tabs[next].focus();
        // Activate on arrow-key navigation (roving tabindex pattern)
        const navItem = NAV_ITEMS[next];
        if (navItem) setTab(navItem.id);
      }
    },
    [],
  );

  const handleDrawerOpen = useCallback(() => setDrawerOpen(true), []);
  const handleDrawerClose = useCallback(() => setDrawerOpen(false), []);

  return (
    <ToastProvider>
      {/* Skip-to-content link (#394) */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="app">
        {/* Top bar */}
        <header className="app__header" role="banner">
          <div className="app__header-inner">
            {/* Hamburger for mobile (#396) */}
            <button
              ref={hamburgerRef}
              type="button"
              className="app__hamburger"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              onClick={handleDrawerOpen}
            >
              <span className="app__hamburger-bar" aria-hidden="true" />
              <span className="app__hamburger-bar" aria-hidden="true" />
              <span className="app__hamburger-bar" aria-hidden="true" />
            </button>

            <span className="app__brand">NotifyChain</span>

            <div className="app__theme-bar">
              <SyncStatus />
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
        </header>

        {/* Desktop tab navigation (#394, #396) */}
        <nav className="app-tabs" aria-label="Main navigation">
          <div
            ref={tabListRef}
            role="tablist"
            aria-label="Dashboard sections"
            className="app-tabs__list"
            onKeyDown={handleTabKeyDown}
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                className={`app-tabs__btn${tab === item.id ? ' app-tabs__btn--active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile off-canvas drawer (#396) */}
        <MobileNavDrawer
          isOpen={drawerOpen}
          onClose={handleDrawerClose}
          activeTab={tab}
          onSelectTab={(t) => {
            setTab(t);
            handleDrawerClose();
          }}
        />

        {/* Main content area */}
        <main id="main-content" className="app__content" tabIndex={-1}>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.id}
              role="tabpanel"
              id={`panel-${item.id}`}
              aria-labelledby={`tab-${item.id}`}
              hidden={tab !== item.id}
              className="app__panel"
            >
              {tab === item.id && renderPanel(item.id, events)}
            </div>
          ))}
        </main>
      </div>
    </ToastProvider>
  );
}

// ─── Panel renderer ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPanel(tab: Tab, events: any[]) {
  switch (tab) {
    case 'explorer':
      return (
        <>
          <EventExplorerPage />
          <DeliveryHeatmap events={events} />
        </>
      );
    case 'timeline':
      return <NotificationTimelineView />;
    case 'activity':
      return <ActivityFeed />;
    case 'user-activity':
      return <UserActivityTimeline />;
    case 'retry-stats':
      return <RetryStatisticsPanel />;
    case 'webhooks':
      return <WebhookDashboardPage />;
    case 'export-history':
      return <ExportHistoryPage />;
    case 'search':
      return <NotificationSearchPage />;
    case 'preferences':
      return <NotificationPreferencesPage />;
    case 'templates':
      return <TemplatesPage />;
    default:
      return null;
  }
}
