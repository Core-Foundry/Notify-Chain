import { useState } from 'react';
import { EventExplorerPage } from './pages/EventExplorerPage';
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
