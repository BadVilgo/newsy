'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Box as BoxType, Snapshot } from '@/lib/types';
import BoxCard from './Box';
import AddBox from './AddBox';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import Nav from './Nav';

const PAGE_NOTE =
  'Do 30 newsów z Google News RSS na temat, z których Gemini wybiera do 4 najważniejszych i pisze własne opisy po polsku. Tylko wiadomości z ostatnich 48h, z priorytetem dla ostatniej doby.';

const BOXES_KEY = ['boxes'] as const;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Coś poszło nie tak.');
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragEnabledId, setDragEnabledId] = useState<string | null>(null);

  const { data: boxes = [], isPending, error } = useQuery({
    queryKey: BOXES_KEY,
    queryFn: () => request<{ boxes: BoxType[] }>('/api/boxes').then((d) => d.boxes),
  });

  /** Skrót do lokalnej zmiany cache'a - używany przez optimistic updates i drag & drop. */
  function patchBoxes(updater: (prev: BoxType[]) => BoxType[]) {
    queryClient.setQueryData<BoxType[]>(BOXES_KEY, (prev) => updater(prev ?? []));
  }

  const addBox = useMutation({
    mutationFn: (topic: string) => request<{ box: BoxType }>('/api/boxes', json({ topic })),
    onSuccess: ({ box }) => patchBoxes((prev) => [...prev, box]),
  });

  // Usuwanie i edycja są optimistic: UI reaguje natychmiast, a przy błędzie wracamy
  // do poprzedniego stanu zapamiętanego w onMutate.
  const deleteBox = useMutation({
    mutationFn: (id: string) => request(`/api/boxes/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: BOXES_KEY });
      const previous = queryClient.getQueryData<BoxType[]>(BOXES_KEY);
      patchBoxes((prev) => prev.filter((b) => b.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(BOXES_KEY, context.previous);
    },
  });

  const editBox = useMutation({
    mutationFn: ({ id, topic }: { id: string; topic: string }) =>
      request(`/api/boxes/${id}`, { ...json({ topic }), method: 'PATCH' }),
    onMutate: async ({ id, topic }) => {
      await queryClient.cancelQueries({ queryKey: BOXES_KEY });
      const previous = queryClient.getQueryData<BoxType[]>(BOXES_KEY);
      patchBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, topic } : b)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(BOXES_KEY, context.previous);
    },
  });

  // Odświeżanie NIE jest optimistic - trwa kilka sekund i może się nie udać,
  // więc pokazujemy realny wynik dopiero po odpowiedzi serwera.
  const refreshBox = useMutation({
    mutationFn: (id: string) => request<{ snapshot: Snapshot }>('/api/refresh', json({ boxId: id })),
    onSuccess: ({ snapshot }, id) =>
      patchBoxes((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, snapshots: [snapshot, ...b.snapshots].slice(0, 2) } : b,
        ),
      ),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => request('/api/boxes/reorder', json({ ids })),
    onError: () => queryClient.invalidateQueries({ queryKey: BOXES_KEY }),
  });

  function persistCurrentOrder() {
    const current = queryClient.getQueryData<BoxType[]>(BOXES_KEY) ?? [];
    reorder.mutate(current.map((b) => b.id));
  }

  function handleDragEnter(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    patchBoxes((prev) => {
      const from = prev.findIndex((b) => b.id === draggingId);
      const to = prev.findIndex((b) => b.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragEnabledId(null);
    persistCurrentOrder();
  }

  function moveBox(id: string, dir: -1 | 1) {
    patchBoxes((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    persistCurrentOrder();
  }

  async function handleAdd(topic: string) {
    await addBox.mutateAsync(topic);
  }

  async function handleRefresh(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await refreshBox.mutateAsync(id);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return (
    <main className="container">
      <h1 className="sr-only">newsy.live - tablica tematów</h1>
      <Nav />

      <p className="page-note">{PAGE_NOTE}</p>

      <AddBox onAdd={handleAdd} />

      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      {isPending && <Skeleton count={3} />}

      {!isPending && boxes.length === 0 && <EmptyState onAdd={handleAdd} />}

      {!isPending && boxes.length > 0 && (
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
                  onDelete={(id) => deleteBox.mutate(id)}
                  onEdit={async (id, topic) => {
                    await editBox.mutateAsync({ id, topic });
                  }}
                  onRefresh={handleRefresh}
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
            auto-odświeżanie codziennie o 8:00
          </div>
        </>
      )}
    </main>
  );
}
