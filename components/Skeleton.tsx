function SkeletonCard() {
  return (
    <div className="card skeleton-pulse" style={{ ['--card-accent' as string]: 'var(--border-2)' }}>
      <div className="skeleton-title" />
      <div className="skeleton-line" style={{ width: '40%', marginTop: 14 }} />
      <div className="skeleton-line" style={{ width: '95%', marginTop: 18 }} />
      <div className="skeleton-line" style={{ width: '85%' }} />
      <div className="skeleton-line" style={{ width: '90%' }} />
      <div className="skeleton-line" style={{ width: '55%' }} />
    </div>
  );
}

export default function Skeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="box-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="grid-item">
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}
