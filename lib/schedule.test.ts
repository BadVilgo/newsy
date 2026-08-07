import { describe, it, expect } from 'vitest';
import { warsawHour, isBeforeStartHour, START_HOUR_PL } from '@/lib/schedule';

/**
 * Sedno: harmonogram GitHub Actions jest w UTC i nie ogarnia zmiany czasu, wiec o stalej
 * godzinie 8:00 lokalnie decyduje ta bramka. Latem robote wykonuje okno 6:xx UTC,
 * zima okno 7:xx UTC - a drugie z nich konczy sie natychmiast.
 */
describe('warsawHour', () => {
  it('przelicza UTC na czas letni (CEST, UTC+2)', () => {
    expect(warsawHour(new Date('2026-07-28T06:08:00Z'))).toBe(8);
  });

  it('przelicza UTC na czas zimowy (CET, UTC+1)', () => {
    expect(warsawHour(new Date('2026-01-15T07:08:00Z'))).toBe(8);
  });

  it('zwraca 0, a nie 24, tuz po polnocy', () => {
    expect(warsawHour(new Date('2026-01-15T23:30:00Z'))).toBe(0);
  });
});

describe('isBeforeStartHour', () => {
  it('LATEM: okno 6:xx UTC to juz 8:xx lokalnie - odswieza', () => {
    expect(isBeforeStartHour(new Date('2026-07-28T06:08:00Z'))).toBe(false);
  });

  it('LATEM: okno 7:xx UTC to 9:xx lokalnie - tez po starcie', () => {
    expect(isBeforeStartHour(new Date('2026-07-28T07:08:00Z'))).toBe(false);
  });

  it('ZIMA: okno 6:xx UTC to dopiero 7:xx lokalnie - czeka', () => {
    expect(isBeforeStartHour(new Date('2026-01-15T06:08:00Z'))).toBe(true);
  });

  it('ZIMA: okno 7:xx UTC to 8:xx lokalnie - odswieza', () => {
    expect(isBeforeStartHour(new Date('2026-01-15T07:08:00Z'))).toBe(false);
  });

  it('startuje dokladnie o pelnej godzinie startu', () => {
    const summerStart = new Date('2026-07-28T06:00:00Z');
    expect(warsawHour(summerStart)).toBe(START_HOUR_PL);
    expect(isBeforeStartHour(summerStart)).toBe(false);
  });
});
