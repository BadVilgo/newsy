'use client';

import { useState } from 'react';

export default function AddBox({ onAdd }: { onAdd: (topic: string) => Promise<void> }) {
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      await onAdd(trimmed);
      setTopic('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
      <input
        type="text"
        placeholder="np. spółka Nvidia giełda"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        style={{ flex: 1, padding: 8 }}
      />
      <button type="submit" disabled={busy}>
        {busy ? '…' : 'Dodaj box'}
      </button>
      {error && <span style={{ color: '#b91c1c', alignSelf: 'center' }}>{error}</span>}
    </form>
  );
}
