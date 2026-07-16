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
      setError(err instanceof Error ? err.message : 'Nie udało się dodać.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="add-row">
      <input
        className="input"
        type="text"
        placeholder="np. spółka Nvidia giełda"
        aria-label="Nowy temat do obserwowania"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Dodawanie…' : 'Dodaj box'}
      </button>
      {error && <span className="error" role="alert" style={{ alignSelf: 'center' }}>{error}</span>}
    </form>
  );
}
