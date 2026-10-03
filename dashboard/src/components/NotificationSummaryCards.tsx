import { memo } from 'react';
import type { NotificationStats } from '../hooks/useNotificationStats';

interface Props {
  stats: NotificationStats | null;
  isLoading: boolean;
  isMockData?: boolean;
}

function MetricCard({
  label,
  value,
  subValue,
  accent,
  isLoading,
}: {
  label: string;
  value: string;
  subValue?: string;
  accent: 'green' | 'yellow' | 'red' | 'blue';
  isLoading: boolean;
}) {
  return (
    <div className={`notif-summary-card notif-summary-card--${accent}`} aria-busy={isLoading}>
      <dt className="notif-summary-card__label">{label}</dt>
      {isLoading ? (
        <dd className="notif-summary-card__value">
          <span className="notif-summary-card__skeleton" aria-hidden="true" />
        </dd>
      ) : (
        <dd className="notif-summary-card__value">
          <span className="notif-summary-card__number">{value}</span>
          {subValue && <span className="notif-summary-card__sub">{subValue}</span>}
        </dd>
      )}
    </div>
  );
}

export const NotificationSummaryCards = memo(function NotificationSummaryCards({
  stats,
  isLoading,
  isMockData = false,
}: Props) {
  const delivered = isLoading || !stats ? '—' : stats.delivered.toLocaleString();
  const pending = isLoading || !stats ? '—' : stats.pending.toLocaleString();
  const failed = isLoading || !stats ? '—' : stats.failed.toLocaleString();
  const inFlight = isLoading || !stats ? '—' : stats.inFlight.toLocaleString();

  const successRateSub =
    !isLoading && stats?.successRate != null
      ? `${(stats.successRate * 100).toFixed(1)}% success rate`
      : undefined;

  const failedAccent: 'red' | 'yellow' =
    !isLoading && stats ? (stats.failed > 0 ? 'red' : 'yellow') : 'red';

  return (
    <section className="notif-summary" aria-label="Notification delivery summary">
      <div className="notif-summary__header">
        <h2 className="notif-summary__title">Delivery Overview</h2>
        {isMockData && (
          <span className="notif-summary__mock-badge" aria-label="Demo data">
            Demo
          </span>
        )}
      </div>
      <dl className="notif-summary__cards">
        <MetricCard
          label="Delivered"
          value={delivered}
          subValue={successRateSub}
          accent="green"
          isLoading={isLoading}
        />
        <MetricCard
          label="Pending"
          value={pending}
          accent="yellow"
          isLoading={isLoading}
        />
        <MetricCard
          label="Failed"
          value={failed}
          accent={failedAccent}
          isLoading={isLoading}
        />
        <MetricCard
          label="In Flight"
          value={inFlight}
          accent="blue"
          isLoading={isLoading}
        />
      </dl>
    </section>
  );
});
