import { GoogleGenAI, Type } from '@google/genai';

export type Source = { title: string; url: string };
export type Bullet = { text: string; sources: Source[] };

type NumberedItem = {
  number: number;
  text: string;
  startOffset: number;
  endOffset: number;
};

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Brak GEMINI_API_KEY w zmiennych środowiskowych.');
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

function parseNumberedItems(text: string): NumberedItem[] {
  const items: NumberedItem[] = [];
  const lineRegex = /^\s*(\d+)\.\s*(.+)$/;
  let offset = 0;
  for (const line of text.split('\n')) {
    const match = line.match(lineRegex);
    if (match) {
      const startOffset = offset + line.indexOf(match[2]);
      items.push({
        number: Number(match[1]),
        text: match[2].trim(),
        startOffset,
        endOffset: startOffset + match[2].length,
      });
    }
    offset += line.length + 1;
  }
  return items;
}

function mapSourcesToItems(
  groundingSupports: any[] | undefined,
  items: NumberedItem[],
): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const support of groundingSupports || []) {
    const segStart = support.segment?.startIndex ?? 0;
    const segEnd = support.segment?.endIndex ?? segStart;
    for (const item of items) {
      const overlaps = segStart < item.endOffset && segEnd > item.startOffset;
      if (overlaps) {
        if (!map.has(item.number)) map.set(item.number, new Set());
        for (const idx of support.groundingChunkIndices || []) {
          map.get(item.number)!.add(idx);
        }
      }
    }
  }
  return map;
}

export function isRateLimitError(err: unknown): boolean {
  const message = String((err as any)?.message || err);
  return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

export class RateLimitError extends Error {
  constructor(message = 'Wyczerpano dzienny darmowy limit zapytań do Gemini.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export async function refreshTopic(topic: string): Promise<Bullet[]> {
  const trimmed = topic.trim();
  if (!trimmed) throw new Error('Podaj temat.');

  const ai = getClient();

  try {
    const flashResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Znajdź w Google 20-25 najważniejszych newsów i doniesień z ostatnich 24 godzin na temat: "${trimmed}". Zwróć ponumerowaną listę po polsku, każda pozycja to jeden numer, jeden krótki nagłówek + jednozdaniowa zajawka, format: "1. <nagłówek>: <zajawka>". Bez wstępu, bez podsumowania, tylko ponumerowana lista.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const flashText = flashResponse.text || '';
    const items = parseNumberedItems(flashText);

    if (items.length === 0) {
      throw new Error('Model nie znalazł żadnych newsów na ten temat.');
    }

    const flashCandidate = flashResponse.candidates?.[0];
    const groundingChunks = flashCandidate?.groundingMetadata?.groundingChunks || [];
    const groundingSupports = flashCandidate?.groundingMetadata?.groundingSupports || [];
    const itemSourceMap = mapSourcesToItems(groundingSupports, items);

    const rawList = items.map((item) => `${item.number}. ${item.text}`).join('\n');
    const editorResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Jesteś ekspertem redakcyjnym. Oto surowa, ponumerowana lista newsów zebrana z sieci na temat "${trimmed}":\n\n${rawList}\n\nDokonaj głębokiej selekcji: odrzuć clickbaity i mało istotne informacje, wybierz dokładnie 4 absolutnie najważniejsze pozycje w ogólnej skali istotności. Jeśli kilka pozycji opisuje dokładnie to samo wydarzenie, wybierz tylko jedną z nich. Zwróć same numery wybranych pozycji, od najważniejszej do najmniej ważnej.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER },
          minItems: 4,
          maxItems: 4,
        },
      },
    });

    const validNumbers = new Set(items.map((item) => item.number));
    let selectedNumbers: number[] = [];
    try {
      selectedNumbers = (JSON.parse(editorResponse.text || '[]') as number[]).filter((n) =>
        validNumbers.has(n),
      );
    } catch {
      selectedNumbers = [];
    }

    if (selectedNumbers.length === 0) {
      throw new Error('Model redaktora nie zwrócił poprawnej selekcji newsów.');
    }

    const bullets: Bullet[] = selectedNumbers.map((number) => {
      const item = items.find((i) => i.number === number)!;
      const chunkIndices = itemSourceMap.get(number) || new Set<number>();
      const seen = new Set<string>();
      const sources: Source[] = [];
      for (const idx of chunkIndices) {
        const uri = groundingChunks[idx]?.web?.uri;
        if (uri && !seen.has(uri)) {
          seen.add(uri);
          const title = groundingChunks[idx]?.web?.title || uri;
          sources.push({ title, url: uri });
        }
      }
      const text = item.text.replace(/\*\*/g, '').replace(/\*/g, '');
      return { text, sources };
    });

    return bullets;
  } catch (err) {
    if (isRateLimitError(err)) {
      throw new RateLimitError();
    }
    throw err;
  }
}
