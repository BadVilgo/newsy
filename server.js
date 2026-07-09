import 'dotenv/config';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error('Brak GEMINI_API_KEY w pliku .env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json());
app.use(express.static('public'));

// Parsuje ponumerowaną listę "1. tekst\n2. tekst..." zwróconą przez Flasha,
// zapamiętując offset znakowy każdej pozycji w oryginalnym tekście -
// potrzebne, żeby dopasować groundingSupports (też liczone w offsetach znaków).
function parseNumberedItems(text) {
  const items = [];
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
    offset += line.length + 1; // +1 za usunięty znak '\n'
  }
  return items;
}

// Mapuje groundingSupports (segmenty tekstu -> indeksy chunków źródeł) na
// numery pozycji z parseNumberedItems, na podstawie zachodzenia offsetów.
function mapSourcesToItems(groundingSupports, items) {
  const map = new Map(); // number -> Set<chunkIndex>
  for (const support of groundingSupports || []) {
    const segStart = support.segment?.startIndex ?? 0;
    const segEnd = support.segment?.endIndex ?? segStart;
    for (const item of items) {
      const overlaps = segStart < item.endOffset && segEnd > item.startOffset;
      if (overlaps) {
        if (!map.has(item.number)) map.set(item.number, new Set());
        for (const idx of support.groundingChunkIndices || []) {
          map.get(item.number).add(idx);
        }
      }
    }
  }
  return map;
}

function isRateLimitError(err) {
  const message = String(err?.message || err);
  return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

app.post('/api/summary', async (req, res) => {
  const topic = (req.body.topic || '').trim();
  if (!topic) {
    return res.status(400).json({ error: 'Podaj temat.' });
  }

  try {
    // Krok 1: Flash + Google Search - szybkie, darmowe zebranie surowych newsów.
    const flashResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Znajdź w Google 20-25 najnowszych newsów i doniesień z ostatnich 24 godzin na temat: "${topic}". Zwróć ponumerowaną listę po polsku, każda pozycja to jeden numer, jeden krótki nagłówek + jednozdaniowa zajawka, format: "1. <nagłówek>: <zajawka>". Bez wstępu, bez podsumowania, tylko ponumerowana lista.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const flashText = flashResponse.text || '';
    const items = parseNumberedItems(flashText);

    if (items.length === 0) {
      return res.status(500).json({ error: 'Model nie znalazł żadnych newsów na ten temat.' });
    }

    const flashCandidate = flashResponse.candidates?.[0];
    const groundingChunks = flashCandidate?.groundingMetadata?.groundingChunks || [];
    const groundingSupports = flashCandidate?.groundingMetadata?.groundingSupports || [];
    const itemSourceMap = mapSourcesToItems(groundingSupports, items);

    // Krok 2: drugie wywołanie Flash w roli redaktora - tylko rozumowanie nad
    // gotową listą, bez własnego wyszukiwania (zostaje w darmowym tierze Flasha).
    const rawList = items.map((item) => `${item.number}. ${item.text}`).join('\n');
    const editorResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Jesteś ekspertem redakcyjnym. Oto surowa, ponumerowana lista newsów zebrana z sieci na temat "${topic}":\n\n${rawList}\n\nDokonaj głębokiej selekcji: odrzuć clickbaity i mało istotne informacje, wybierz dokładnie 4 absolutnie najważniejsze pozycje w ogólnej skali istotności. Jeśli kilka pozycji opisuje dokładnie to samo wydarzenie, wybierz tylko jedną z nich. Zwróć same numery wybranych pozycji, od najważniejszej do najmniej ważnej.`,
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
    let selectedNumbers = [];
    try {
      selectedNumbers = JSON.parse(editorResponse.text || '[]').filter((n) => validNumbers.has(n));
    } catch {
      selectedNumbers = [];
    }

    if (selectedNumbers.length === 0) {
      return res.status(500).json({ error: 'Model redaktora nie zwrócił poprawnej selekcji newsów.' });
    }

    const bullets = selectedNumbers.map((number) => {
      const item = items.find((i) => i.number === number);
      const chunkIndices = itemSourceMap.get(number) || new Set();
      const seen = new Set();
      const sources = [];
      for (const idx of chunkIndices) {
        const uri = groundingChunks[idx]?.web?.uri;
        const title = groundingChunks[idx]?.web?.title || uri;
        if (uri && !seen.has(uri)) {
          seen.add(uri);
          sources.push({ title, url: uri });
        }
      }
      const text = item.text.replace(/\*\*/g, '').replace(/\*/g, '');
      return { text, sources };
    });

    res.json({ bullets });
  } catch (err) {
    console.error(err);
    if (isRateLimitError(err)) {
      return res.status(429).json({
        error: 'Wyczerpano dzienny darmowy limit zapytań do Gemini. Spróbuj ponownie jutro.',
      });
    }
    res.status(500).json({ error: 'Błąd wywołania Gemini API: ' + (err.message || String(err)) });
  }
});

app.listen(PORT, () => {
  console.log(`Serwer działa: http://localhost:${PORT}`);
});
