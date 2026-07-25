import type { ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  /** Short heading. Omit for compact/inline placements that only need a message. */
  title?: string;
  /** Helpful message guiding the user on what to do next. */
  message: string;
  /** Custom icon/illustration. Falls back to a generic empty-tray icon. */
  icon?: ReactNode;
  /** Optional call-to-action rendered below the message. */
  action?: EmptyStateAction;
  /**
   * Visual density:
   * - "default": large dashed card for standalone page/section placeholders.
   * - "compact": smaller dashed card for placeholders inside a page section.
   * - "inline": no border/background — for placeholders already nested inside
   *   a bordered container (a panel, card, or table cell).
   */
  size?: 'default' | 'compact' | 'inline';
  className?: string;
}

function DefaultEmptyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 13.5 5.5 5h13L21 13.5" />
      <path d="M3 13.5V19a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5.5" />
      <path d="M3 13.5h5a1 1 0 0 1 1 1 3 3 0 0 0 6 0 1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/**
 * Reusable placeholder for any screen or section with no data to show.
 * Pairs an icon with a short title and a helpful message, and optionally
 * a call-to-action, so empty screens always guide the user to a next step.
 */
export function EmptyState({
  title,
  message,
  icon,
  action,
  size = 'default',
  className,
}: EmptyStateProps) {
  const classes = ['empty-state', `empty-state--${size}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status" aria-live="polite">
      <div className="empty-state__icon">{icon ?? <DefaultEmptyIcon />}</div>
      {title && <h2 className="empty-state__title">{title}</h2>}
      <p className="empty-state__message">{message}</p>
      {action && (
        <button
          type="button"
          className="empty-state__action button button--secondary"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
