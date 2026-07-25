'use client';

import { useEffect, useState } from 'react';
import type { Box as BoxType, Snapshot, NewsMethod } from '@/lib/types';
import BoxCard from './Box';
import AddBox from './AddBox';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import Nav from './Nav';

// Opis wersji pokazywany nad tablica - tlumaczy, czym rozni sie dana zakladka.
const VARIANTS: Record<NewsMethod, { title: string; note: string }> = {
  search: {
    title: 'Newsy',
    note: 'Wersja 1: Gemini samodzielnie przeszukuje sieć (Google grounding) i wybiera 4 najważniejsze newsy.',
  },
  rss: {
    title: 'Newsy 2',
    note: 'Wersja 2: 20 newsów z Google News RSS, a Gemini wybiera 4 najważniejsze i pisze własne opisy. Silnik w Pythonie (FastAPI).',
  },
};

export default function Dashboard({
  username,
  method = 'search',
}: {
  username: string;
  method?: NewsMethod;
}) {
  const [boxes, setBoxes] = useState<BoxType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragEnabledId, setDragEnabledId] = useState<string | null>(null);

  const variant = VARIANTS[method];

  async function loadBoxes() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/boxes?method=${method}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

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
      body: JSON.stringify({ boxId: id, method }),
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

  async function persistOrder(ordered: BoxType[]) {
    await fetch('/api/boxes/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map((b) => b.id) }),
    });
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
    await persistOrder(ordered);
  }

  async function moveBox(id: string, dir: -1 | 1) {
    const idx = boxes.findIndex((b) => b.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= boxes.length) return;
    const next = [...boxes];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBoxes(next);
    await persistOrder(next);
  }

  return (
    <main className="container">
      <h1 className="sr-only">newsy.live - {variant.title}</h1>
      <Nav username={username} />

      <p className="page-note">{variant.note}</p>

      <AddBox onAdd={addBox} />

      {error && <p className="error" role="alert">{error}</p>}

      {loading && <Skeleton count={3} />}

      {!loading && boxes.length === 0 && <EmptyState onAdd={addBox} />}

      {!loading && boxes.length > 0 && (
        <>
          <div className="box-grid">
            {boxes.map((box, i) => (
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
                  onMove={moveBox}
                  isFirst={i === 0}
                  isLast={i === boxes.length - 1}
                />
              </div>
            ))}
          </div>

          <div className="footer-note">
            <span className="pulse-dot" />
            auto-odświeżanie codziennie rano
          </div>
        </>
      )}
    </main>
  );
}
