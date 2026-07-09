import type { Snapshot } from '@/lib/types';

export default function NewsSection({
  label,
  snapshot,
}: {
  label: string;
  snapshot: Snapshot | undefined;
}) {
  return (
    <section style={{ marginTop: 12 }}>
      <h4 style={{ margin: '0 0 4px', fontSize: 13, color: '#666', textTransform: 'uppercase' }}>
        {label}
      </h4>
      {!snapshot || snapshot.items.length === 0 ? (
        <p style={{ fontSize: 13, color: '#999', margin: 0 }}>Brak danych.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {snapshot.items.map((bullet, i) => (
            <li key={i} style={{ marginBottom: 8, fontSize: 14 }}>
              {bullet.text}
              {bullet.sources.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 12 }}>
                  {bullet.sources.map((s, j) => (
                    <li key={j}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
