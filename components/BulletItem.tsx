'use client';

import { useState } from 'react';
import type { Bullet } from '@/lib/types';
import { LinkIcon } from './icons';

export default function BulletItem({ bullet }: { bullet: Bullet }) {
  const [showSources, setShowSources] = useState(false);

  return (
    <li className="bullet">
      <span className="bullet-marker">▹</span>
      <div>
        {bullet.text}
        {bullet.sources.length > 0 && (
          <div>
            <button className="source-toggle" onClick={() => setShowSources((s) => !s)}>
              <LinkIcon />
              {showSources ? 'Ukryj źródła' : `Źródła (${bullet.sources.length})`}
            </button>
            {showSources && (
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
        )}
      </div>
    </li>
  );
}
