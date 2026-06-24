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
    </div>
  );
}
