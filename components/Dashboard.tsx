'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Box as BoxType, Snapshot } from '@/lib/types';
import BoxCard from './Box';
import AddBox from './AddBox';
import { NewsIcon } from './icons';

export default function Dashboard({ username }: { username: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [boxes, setBoxes] = useState<BoxType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragEnabledId, setDragEnabledId] = useState<string | null>(null);

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

  function handleDragEnter(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    setBoxes((prev) => {
      const from = prev.findIndex((b) => b.id === draggingId);
      const to = prev.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function handleDragEnd() {
    const ordered = boxes;
    setDraggingId(null);
    setDragEnabledId(null);
    await fetch('/api/boxes/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map((b) => b.id) }),
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="container">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">
            <NewsIcon />
          </span>
          <div>
            <div className="brand-name">
              newsy<span className="accent">.live</span>
            </div>
            <div className="brand-sub">tablica tematów</div>
          </div>
        </div>
        <div className="user-area">
          <span className="avatar">{username.charAt(0) || '?'}</span>
          {username}
          <button className="btn" onClick={signOut}>
            Wyloguj
          </button>
        </div>
      </header>

      <AddBox onAdd={addBox} />

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Ładowanie…</p>}
      {!loading && boxes.length === 0 && (
        <p className="hint">Brak boxów. Dodaj pierwszy temat powyżej.</p>
      )}

      <div className="box-grid">
        {boxes.map((box) => (
          <div
            key={box.id}
            className={`grid-item${draggingId === box.id ? ' dragging' : ''}`}
            draggable={dragEnabledId === box.id}
            onDragStart={() => setDraggingId(box.id)}
            onDragEnter={() => handleDragEnter(box.id)}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={handleDragEnd}
          >
            <BoxCard
              box={box}
              onDelete={deleteBox}
              onEdit={editBox}
              onRefresh={refreshBox}
              onDragHandleDown={() => setDragEnabledId(box.id)}
            />
          </div>
        ))}
      </div>

      {boxes.length > 0 && (
        <div className="footer-note">
          <span className="pulse-dot" />
          auto-odświeżanie codziennie o 09:00
        </div>
      )}
    </main>
  );
}
