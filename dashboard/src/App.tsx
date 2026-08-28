/**
 * App.tsx
 *
 * Integrates:
 *  - #394 Accessibility: role="tablist", aria-selected, keyboard nav (arrow keys),
 *    focus-visible rings, skip-to-content link
 *  - #396 Navigation Redesign: grouped tabs, active-route highlighting,
 *    mobile hamburger + off-canvas drawer
 *  - #397 Toast: ToastProvider wraps the whole app
 *  - #505 Keyboard Shortcuts: number keys for tabs, T for theme, ? for help
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
import { ChannelDetailsPage } from './pages/ChannelDetailsPage';
import { RpcBenchmarkPage } from './pages/RpcBenchmarkPage';
import { ThemeToggle } from './components/ThemeToggle';
import { MobileNavDrawer, NAV_ITEMS, type Tab } from './components/MobileNavDrawer';
import { ToastProvider } from './context/ToastContext';
import { useTheme } from './hooks/useTheme';
import { DeliveryHeatmap } from './components/DeliveryHeatmap';
import { useEventStore } from './store/eventStore';
import { SyncStatus } from './components/SyncStatus';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';

export function App() {
  const [tab, setTab] = useState<Tab>('explorer');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const events = useEventStore((state) => state.events);
  const tabListRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // ── Keyboard shortcuts (#505) ───────────────────────────────────────────
  useKeyboardShortcuts({
    activeTab: tab,
    onTabChange: setTab,
    onToggleTheme: toggleTheme,
    helpOpen,
    onToggleHelp: useCallback(() => setHelpOpen((prev) => !prev), []),
    onCloseHelp: useCallback(() => setHelpOpen(false), []),
  });

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

      {/* Keyboard shortcuts help overlay (#505) */}
      <KeyboardShortcutsHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

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
            {NAV_ITEMS.map((item, index) => (
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
                title={index < 9 ? `Press ${index + 1} to switch` : undefined}
              >
                {index < 9 && (
                  <kbd className="app-tabs__shortcut">{index + 1}</kbd>
                )}
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
    case 'channels':
      return <ChannelDetailsPage />;
    case 'rpc-benchmark':
      return <RpcBenchmarkPage />;
    default:
      return null;
  }
}
