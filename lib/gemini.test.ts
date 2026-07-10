import { describe, it, expect } from 'vitest';
import { parseNumberedItems, mapSourcesToItems } from '@/lib/gemini';

describe('parseNumberedItems', () => {
  it('parsuje ponumerowaną listę i liczy offsety znakowe', () => {
    const text = '1. Pierwszy news\n2. Drugi news';
    const items = parseNumberedItems(text);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ number: 1, text: 'Pierwszy news', startOffset: 3, endOffset: 16 });
    expect(items[1]).toMatchObject({ number: 2, text: 'Drugi news', startOffset: 20, endOffset: 30 });
  });

  it('pomija linie bez numeracji', () => {
    const text = 'Wstęp bez numeru\n1. Właściwy news\nStopka';
    const items = parseNumberedItems(text);

    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Właściwy news');
  });

  it('zwraca pustą listę dla tekstu bez pozycji', () => {
    expect(parseNumberedItems('brak jakiejkolwiek listy')).toEqual([]);
  });
});

describe('mapSourcesToItems', () => {
  it('mapuje źródła na pozycje po zachodzeniu offsetów', () => {
    const items = parseNumberedItems('1. Pierwszy news\n2. Drugi news');
    const supports = [
      { segment: { startIndex: 3, endIndex: 10 }, groundingChunkIndices: [0, 1] },
      { segment: { startIndex: 21, endIndex: 28 }, groundingChunkIndices: [2] },
    ];

    const map = mapSourcesToItems(supports, items);

    expect([...(map.get(1) ?? [])]).toEqual([0, 1]);
    expect([...(map.get(2) ?? [])]).toEqual([2]);
  });

  it('nie mapuje źródeł, gdy segment nie zachodzi na żadną pozycję', () => {
    const items = parseNumberedItems('1. Pierwszy news');
    const supports = [{ segment: { startIndex: 100, endIndex: 110 }, groundingChunkIndices: [0] }];

    expect(mapSourcesToItems(supports, items).size).toBe(0);
  });

  it('nie przewraca się na braku groundingSupports', () => {
    const items = parseNumberedItems('1. Pierwszy news');
    expect(mapSourcesToItems(undefined, items).size).toBe(0);
  });
});
