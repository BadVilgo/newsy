import { describe, it, expect } from 'vitest';
import { buildMemory, MEMORY_MIN_AGE_MS } from '@/lib/refreshBox';

const NOW = Date.parse('2026-07-27T06:05:00Z');
const hoursAgo = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();

const snapshot = (hours: number, text: string, url: string) => ({
  fetched_at: hoursAgo(hours),
  items: [{ text, sources: [{ title: 'Tytuł', url }] }],
});

describe('buildMemory', () => {
  it('pamięta newsy z poprzedniego dnia (teksty i adresy źródeł)', () => {
    const memory = buildMemory([snapshot(24, 'Wczorajszy news.', 'https://example.com/a')], {
      skipIfUnchanged: true,
      now: NOW,
    });

    expect(memory.previous).toEqual([{ text: 'Wczorajszy news.', urls: ['https://example.com/a'] }]);
    expect(memory.since).toBe(hoursAgo(24));
  });

  // Ponowienie tuż po odświeżeniu (retry crona, drugi klik) ma dać ten sam rodzaj wyniku,
  // a nie „resztki" po odfiltrowaniu newsów sprzed chwili - stąd próg wieku pamięci.
  it('pomija snapshot sprzed chwili i sięga po starszy', () => {
    const memory = buildMemory(
      [
        snapshot(1, 'News sprzed godziny.', 'https://example.com/swiezy'),
        snapshot(25, 'News z wczoraj.', 'https://example.com/wczoraj'),
      ],
      { skipIfUnchanged: true, now: NOW },
    );

    expect(memory.previous?.map((item) => item.text)).toEqual(['News z wczoraj.']);
    // „Czy doszło coś nowego" liczymy jednak od NAJNOWSZEGO snapshotu.
    expect(memory.since).toBe(hoursAgo(1));
  });

  it('traktuje snapshot dokładnie na progu jako pamięć', () => {
    const onThreshold = {
      fetched_at: new Date(NOW - MEMORY_MIN_AGE_MS).toISOString(),
      items: [{ text: 'Na progu.', sources: [] }],
    };
    const memory = buildMemory([onThreshold], { skipIfUnchanged: false, now: NOW });
    expect(memory.previous).toEqual([{ text: 'Na progu.', urls: [] }]);
  });

  it('ręczne odświeżenie nie wysyła since, więc silnik niczego nie pomija', () => {
    const memory = buildMemory([snapshot(24, 'Wczoraj.', 'https://example.com/a')], {
      skipIfUnchanged: false,
      now: NOW,
    });
    expect(memory.since).toBeNull();
    expect(memory.previous).toHaveLength(1);
  });

  it('nowy box bez historii nie ma pamięci', () => {
    expect(buildMemory([], { skipIfUnchanged: true, now: NOW })).toEqual({
      previous: [],
      since: null,
    });
  });

  it('znosi snapshot bez pozycji i pozycje bez źródeł', () => {
    const memory = buildMemory(
      [
        { fetched_at: hoursAgo(30), items: null },
        { fetched_at: hoursAgo(50), items: [{ text: 'Stary.', sources: [] }] },
      ],
      { skipIfUnchanged: true, now: NOW },
    );
    expect(memory.previous).toEqual([]);
  });
});
