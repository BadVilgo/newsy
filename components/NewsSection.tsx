import type { Snapshot } from '@/lib/types';
import BulletItem from './BulletItem';

export default function NewsSection({
  snapshot,
  emptyHint = 'Brak danych. Kliknij odśwież, aby pobrać newsy.',
}: {
  snapshot: Snapshot | undefined;
  emptyHint?: string;
}) {
  if (!snapshot || snapshot.items.length === 0) {
    return <p className="empty">{emptyHint}</p>;
  }

  return (
    <ul className="news-list">
      {snapshot.items.map((bullet, i) => (
        <BulletItem key={i} bullet={bullet} />
      ))}
    </ul>
  );
}
