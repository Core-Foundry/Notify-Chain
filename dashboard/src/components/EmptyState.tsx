import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  /** Optional call-to-action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Extra class for size/context variants */
  className?: string;
  /** aria role — defaults to "status" */
  role?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  role = 'status',
  children,
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`} role={role}>
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__description">{description}</p>
      {children}
      {action && (
        <button
          type="button"
          className="empty-state__action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
