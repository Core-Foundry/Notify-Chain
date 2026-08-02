# Dashboard Storybook

Storybook documents reusable NotifyChain dashboard UI components for development and design review.

## Commands

From `dashboard/`:

```bash
npm install
npm run storybook
```

Open [http://localhost:6006](http://localhost:6006).

Build a static Storybook site:

```bash
npm run build-storybook
```

## Documented components

- `Modal` — size and footer variations
- `ThemeToggle` — light / dark
- `PaginationControls` — first / middle / last page and custom page sizes
- `EventCard` — compact / expanded / loading and event-type variants
- `EventExplorerCard` — copied, paused, and clickable states
- `ExportHistoryTable` — mixed export statuses
- `WebhookSummaryCards` — loading and filled metrics

Stories live next to components as `*.stories.tsx` and share fixtures under `src/stories/fixtures/`.
