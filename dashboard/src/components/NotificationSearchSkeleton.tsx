interface NotificationSearchSkeletonProps {
  cards?: number;
}

function SkeletonLine({ width, height = '12px' }: { width: string; height?: string }) {
  return (
    <span
      className="skeleton-block skeleton-block--inline"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

function NotificationResultCardSkeleton() {
  return (
    <article className="notif-result-card notif-result-card--skeleton" aria-hidden="true">
      <div className="notif-result-card__header">
        <SkeletonLine width="72px" height="20px" />
        <SkeletonLine width="88px" height="20px" />
        <SkeletonLine width="64px" height="20px" />
      </div>
      <div className="notif-result-card__fields notif-result-card__fields--skeleton">
        <SkeletonLine width="70px" />
        <SkeletonLine width="55%" />
        <SkeletonLine width="60px" />
        <SkeletonLine width="70%" />
        <SkeletonLine width="70px" />
        <SkeletonLine width="45%" />
        <SkeletonLine width="55px" />
        <SkeletonLine width="40%" />
      </div>
    </article>
  );
}

export function NotificationSearchSkeleton({ cards = 4 }: NotificationSearchSkeletonProps) {
  return (
    <div
      className="notif-search-results notif-search-results--skeleton"
      aria-busy="true"
      aria-label="Searching notifications"
      role="status"
    >
      {Array.from({ length: cards }).map((_, index) => (
        <NotificationResultCardSkeleton key={index} />
      ))}
    </div>
  );
}
