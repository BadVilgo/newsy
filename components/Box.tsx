'use client';

import { useState } from 'react';
import type { Box as BoxType } from '@/lib/types';
import NewsSection from './NewsSection';

// Pojedynczy box: temat (edytowalny), przyciski odśwież/usuń oraz dwie sekcje newsów.
export default function BoxCard({
  box,
  onDelete,
  onEdit,
  onRefresh,
}: {
  box: BoxType;
  onDelete: (id: string) => void;
  onEdit: (id: string, topic: string) => Promise<void>;
  onRefresh: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(box.topic);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const recent = box.snapshots[0]; // "24h"
  const previous = box.snapshots[1]; // "24-48h"

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    const result = await onRefresh(box.id);
    if (!result.ok) setError(result.error || 'Błąd odświeżania.');
    setRefreshing(false);
  }

  async function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== box.topic) await onEdit(box.id, trimmed);
    setEditing(false);
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            style={{ flex: 1, padding: 4 }}
            autoFocus
          />
        ) : (
          <h3 style={{ margin: 0, fontSize: 16 }}>{box.topic}</h3>
        )}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {editing ? (
            <button onClick={saveEdit}>Zapisz</button>
          ) : (
            <button onClick={() => setEditing(true)} title="Edytuj temat">
              ✎
            </button>
          )}
          <button onClick={handleRefresh} disabled={refreshing} title="Odśwież">
            {refreshing ? '…' : '↻'}
          </button>
          <button onClick={() => onDelete(box.id)} title="Usuń">
            🗑
          </button>
        </div>
      </div>

      {recent && (
        <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>
          Ostatnie odświeżenie: {new Date(recent.fetched_at).toLocaleString('pl-PL')}
        </p>
      )}
      {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}

      <NewsSection label="Ostatnie 24h" snapshot={recent} />
      <NewsSection label="24–48h (dzień wcześniej)" snapshot={previous} />
    </div>
  );
}
