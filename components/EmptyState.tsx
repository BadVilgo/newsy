'use client';

import { useState } from 'react';
import { InboxIcon } from './icons';

const SUGGESTIONS = ['UFO', 'spółka Nvidia giełda', 'postępy nad agentami AI', 'wojna Rosja-Ukraina', 'Polska'];

export default function EmptyState({ onAdd }: { onAdd: (topic: string) => Promise<void> }) {
  const [adding, setAdding] = useState<string | null>(null);

  async function add(topic: string) {
    setAdding(topic);
    try {
      await onAdd(topic);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="empty-state">
      <div className="empty-icon">
        <InboxIcon />
      </div>
      <p className="empty-title">Zacznij od pierwszego tematu</p>
      <p className="empty-sub">Dodaj temat powyżej albo wybierz jeden z przykładów:</p>
      <div className="chip-row">
        {SUGGESTIONS.map((topic) => (
          <button key={topic} className="chip" onClick={() => add(topic)} disabled={adding !== null}>
            {adding === topic ? 'Dodawanie…' : topic}
          </button>
        ))}
      </div>
    </div>
  );
}
