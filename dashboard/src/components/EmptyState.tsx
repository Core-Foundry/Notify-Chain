import type { ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: ReactNode;
  action?: EmptyStateAction;
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
