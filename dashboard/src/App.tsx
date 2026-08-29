import { useState, useCallback } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { NotificationTimelineView } from './components/NotificationTimelineView';

    if (next !== current) {
      tabs[next]?.focus();
      const navItem = NAV_ITEMS[next];
      if (navItem) setTab(navItem.id);
    }
  }, []);

  const handleDrawerOpen = useCallback(() => setDrawerOpen(true), []);
  const handleDrawerClose = useCallback(() => setDrawerOpen(false), []);

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
  }, []);

  return (
    <ToastProvider>
      <DashboardLayout
        activeTab={tab}
        onSelectTab={setTab}
        drawerOpen={drawerOpen}
        onDrawerOpen={handleDrawerOpen}
        onDrawerClose={handleDrawerClose}
        tabListRef={tabListRef}
        hamburgerRef={hamburgerRef}
        onTabKeyDown={handleTabKeyDown}
        themeBar={
          <>
            <SyncStatus />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </>
        }
      >
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
      </DashboardLayout>

      <MobileNavDrawer
        isOpen={drawerOpen}
        onClose={handleDrawerClose}
        activeTab={tab}
        onSelectTab={(t) => {
          setTab(t);
          handleDrawerClose();
        }}
      />
    </ToastProvider>
  );
}

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
