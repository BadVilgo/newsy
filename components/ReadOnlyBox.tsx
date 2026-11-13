import type { Box } from '@/lib/types';
import { accentFor } from '@/lib/accent';
import BoxNews from './BoxNews';

/**
 * Kafelek tylko do odczytu - publiczny podgląd tablicy (/demo i strona główna).
 * Ten sam wygląd i te same zakładki co na tablicy, ale bez akcji edycji.
 */
export default function ReadOnlyBox({
  box,
  headingLevel = 2,
}: {
  box: Box;
  /** Poziom nagłówka zależy od miejsca: h2 na /demo, h3 pod sekcją na stronie głównej. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <article className="card" style={{ ['--card-accent' as string]: accentFor(box.id) }}>
      <div className="card-head">
        <Heading className="card-title">{box.topic}</Heading>
      </div>
      <BoxNews snapshots={box.snapshots} emptyHint="Brak newsów w tej zakładce." />
    </article>
  );
}
