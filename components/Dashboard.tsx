'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Box as BoxType, Snapshot } from '@/lib/types';
import BoxCard from './Box';
import AddBox from './AddBox';

export default function Dashboard({ username }: { username: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [boxes, setBoxes] = useState<BoxType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadBoxes() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/boxes');
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Nie udało się pobrać boxów.');
    } else {
      setBoxes(data.boxes);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadBoxes();
  }, []);

  async function addBox(topic: string) {
    const res = await fetch('/api/boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Błąd dodawania.');
    setBoxes((prev) => [...prev, data.box]);
  }

  async function deleteBox(id: string) {
    const res = await fetch(`/api/boxes/${id}`, { method: 'DELETE' });
    if (res.ok) setBoxes((prev) => prev.filter((b) => b.id !== id));
  }

  async function editBox(id: string, topic: string) {
    const res = await fetch(`/api/boxes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
    const data = await res.json();
    if (res.ok) {
      setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, topic: data.box.topic } : b)));
    }
  }

  async function refreshBox(id: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: id }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error };

    const snapshot: Snapshot = data.snapshot;
    setBoxes((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, snapshots: [snapshot, ...b.snapshots].slice(0, 2) } : b,
      ),
    );
    return { ok: true };
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>Tablica tematów</h1>
        <div style={{ fontSize: 14, color: '#555' }}>
          {username} <button onClick={signOut}>Wyloguj</button>
        </div>
      </header>

      <AddBox onAdd={addBox} />

      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {loading && <p>Ładowanie…</p>}
      {!loading && boxes.length === 0 && <p>Brak boxów. Dodaj pierwszy temat powyżej.</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        {boxes.map((box) => (
          <BoxCard
            key={box.id}
            box={box}
            onDelete={deleteBox}
            onEdit={editBox}
            onRefresh={refreshBox}
          />
        ))}
      </div>
    </main>
  );
}
