import { EventExplorerPage } from './pages/EventExplorerPage';
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
    </div>
  );
}
