import type { Snapshot } from '@/lib/types';
import BulletItem from './BulletItem';

export default function NewsSection({ snapshot }: { snapshot: Snapshot | undefined }) {
  if (!snapshot || snapshot.items.length === 0) {
    return <p className="empty">Brak danych. Kliknij odśwież, aby pobrać newsy.</p>;
  }

  return (
    <ul className="news-list">
      {snapshot.items.map((bullet, i) => (
        <BulletItem key={i} bullet={bullet} />
      ))}
    </ul>
  );
}
