import { describe, it, expect, afterEach } from 'vitest';
import { boxesWithNews, fetchDemoBoxes } from '@/lib/demo';
import type { Box } from '@/lib/types';

const box = (id: string, items: number, withSnapshot = true): Box => ({
  id,
  topic: `Temat ${id}`,
  position: 0,
  created_at: '2026-07-26T10:00:00Z',
  snapshots: withSnapshot
    ? [
        {
          id: `s-${id}`,
          fetched_at: '2026-07-26T06:05:00Z',
          items: Array.from({ length: items }, (_, i) => ({ text: `News ${i}`, sources: [] })),
        },
      ]
    : [],
});

describe('boxesWithNews', () => {
  it('zostawia tylko tematy, które mają co pokazać', () => {
    const result = boxesWithNews([box('a', 3), box('pusty', 0), box('bez-snapshotu', 0, false), box('b', 1)]);
    expect(result.map((b) => b.id)).toEqual(['a', 'b']);
  });
});

describe('fetchDemoBoxes', () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  });

  // Podgląd jest dodatkiem - brak konfiguracji (np. build w CI) nie może wywrócić strony.
  it('bez konfiguracji Supabase oddaje pustą listę zamiast rzucać', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await expect(fetchDemoBoxes()).resolves.toEqual([]);
  });
});
