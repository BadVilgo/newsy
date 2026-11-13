import { describe, it, expect } from 'vitest';
import { formatDateTime } from '@/lib/format';

describe('formatDateTime', () => {
  // Strefa jest ustawiona jawnie, więc wynik nie zależy od strefy serwera ani przeglądarki -
  // to warunek poprawnej hydracji prerenderowanych stron (/demo, strona główna).
  it('formatuje czas w strefie polskiej niezależnie od strefy środowiska', () => {
    expect(formatDateTime('2026-07-26T16:15:00+00:00')).toBe('26.07, 18:15'); // lato, CEST
    expect(formatDateTime('2026-01-15T16:15:00Z')).toBe('15.01, 17:15'); // zima, CET
  });

  it('zwraca null dla niepoprawnej daty', () => {
    expect(formatDateTime('nie-data')).toBeNull();
  });
});
