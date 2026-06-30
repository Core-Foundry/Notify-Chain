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
import { useState } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
import { ExportHistoryPage } from './pages/ExportHistoryPage';

export function App() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'exports'>('explorer');

  return (
    <div className="app">
      <nav className="nav-header">
        <span className="nav-brand">Notify-Chain</span>
        <div className="nav-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'explorer' ? 'nav-tab-btn--active' : ''}`}
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
            className={`nav-tab-btn ${activeTab === 'exports' ? 'nav-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('exports')}
          >
            Export Center
          </button>
        </div>
      </nav>

      {activeTab === 'explorer' ? <EventExplorerPage /> : <ExportHistoryPage />}
import { DeliveryHeatmap } from './components/DeliveryHeatmap';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { useEventStore } from './store/eventStore';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const events = useEventStore((state) => state.events);

  return (
    <div className="app">
      <div className="app__theme-bar">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <EventExplorerPage />
      <DeliveryHeatmap events={events} />
import { TemplatePreviewDemoPage } from './pages/TemplatePreviewDemoPage';

type Page = 'events' | 'templates';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('templates');

  return (
    <div className="app">
      <nav className="app-nav">
        <button
          className={`app-nav__button ${currentPage === 'events' ? 'app-nav__button--active' : ''}`}
          onClick={() => setCurrentPage('events')}
          type="button"
import { NotificationTimelineView } from './components/NotificationTimelineView';
import { ActivityFeed } from './components/ActivityFeed';
import { ExportHistoryPage } from './pages/ExportHistoryPage';

type Tab = 'explorer' | 'timeline' | 'activity' | 'export-history';

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
          className={`app-nav__button ${currentPage === 'templates' ? 'app-nav__button--active' : ''}`}
          onClick={() => setCurrentPage('templates')}
          type="button"
        >
          Template Preview
        </button>
      </nav>
      
      <main className="app-content">
        {currentPage === 'events' && <EventExplorerPage />}
        {currentPage === 'templates' && <TemplatePreviewDemoPage />}
      </main>
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
      </nav>

      {tab === 'explorer' && <EventExplorerPage />}
      {tab === 'timeline' && <NotificationTimelineView />}
      {tab === 'activity' && <ActivityFeed />}
      {tab === 'export-history' && <ExportHistoryPage />}
    </div>
  );
}
