'use client';

import { useState } from 'react';
import type { Bullet } from '@/lib/types';
import { LinkIcon } from './icons';

/** "26.07, 18:15" w czasie lokalnym; niepoprawna data nie wywraca renderu. */
function formatPublished(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BulletItem({ bullet }: { bullet: Bullet }) {
  const [showSources, setShowSources] = useState(false);
  const published = bullet.published ? formatPublished(bullet.published) : null;

  return (
    <li className="bullet">
      <span className="bullet-marker" aria-hidden="true">
        ▹
      </span>
      <div>
        {bullet.text}
        {bullet.foreign && (
          <span className="foreign-badge" title="Źródło zagraniczne (Google News US)">
            US
          </span>
        )}
        <div className="bullet-meta">
          {published && (
            <time className="bullet-date" dateTime={bullet.published}>
              {published}
            </time>
          )}
          {bullet.sources.length > 0 && (
            <button
              className="source-toggle"
              onClick={() => setShowSources((s) => !s)}
              aria-expanded={showSources}
            >
              <LinkIcon />
              {showSources ? 'Ukryj źródła' : `Źródła (${bullet.sources.length})`}
            </button>
          )}
        </div>
        {showSources && bullet.sources.length > 0 && (
          <ul className="source-list">
            {bullet.sources.map((s, j) => (
              <li key={j}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  <LinkIcon />
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
