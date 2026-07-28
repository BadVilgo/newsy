import type { Bullet } from './types';

/**
 * Klient silnika newsow napisanego w Pythonie (FastAPI, plik `api/rss.py`).
 * Warstwa TS tylko wola endpoint i dostaje gotowe Bullet[] - cala logika RSS + AI
 * zyje po stronie Pythona. Zapis do bazy robimy juz w TS (auth/RLS w jednym miejscu).
 *
 * URL rozwiazujemy w kolejnosci:
 *  1. RSS_ENGINE_URL         - jawnie ustawiony (uzywany m.in. przez daily refresh w GH Actions),
 *  2. https://$VERCEL_PROJECT_PRODUCTION_URL/api/rss - stabilny adres produkcyjny na Vercelu,
 *  3. http://localhost:3000/api/rss - lokalnie (dziala tylko pod `vercel dev`, nie `next dev`).
 */
export function rssEngineUrl(): string {
  if (process.env.RSS_ENGINE_URL) return process.env.RSS_ENGINE_URL;
  // WAZNE: uzywamy stabilnego adresu PRODUKCYJNEGO, nie VERCEL_URL.
  // VERCEL_URL to unikatowy adres konkretnego deploya - przy wlaczonej Vercel Deployment
  // Protection zwraca 401 "Protected deployment" na wewnetrzne wywolania server-to-server.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (host) return `https://${host}/api/rss`;
  return 'http://localhost:3000/api/rss';
}

/**
 * Dla tematu nie ma zadnych wiadomosci z ostatnich 48h. To NORMALNY wynik (temat niszowy,
 * spokojny dzien), a nie awaria - codzienne odswiezanie pomija taki box zamiast raportowac blad.
 */
export class NoFreshNewsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoFreshNewsError';
  }
}

/** Blad limitu zapytan do Gemini - skrypt odswiezania przerywa wtedy dalsze boxy. */
export class RateLimitError extends Error {
  constructor(message = 'Wyczerpano dzienny limit zapytań do Gemini (RPD). Spróbuj ponownie jutro.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function isRateLimitError(err: unknown): boolean {
  const message = String((err as { message?: string })?.message || err);
  return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

/**
 * Wyciaga czytelny komunikat z ciala bledu.
 * FastAPI uzywa pola `detail` (przy walidacji to TABLICA obiektow, nie string);
 * Vercel Deployment Protection zwraca `message` (np. "Protected deployment").
 * Bez tego surowy obiekt trafialby do new Error(...) jako bezuzyteczne "[object Object]".
 */
export function describeError(
  data: { detail?: unknown; error?: unknown; message?: unknown },
  status: number,
): string {
  const raw = data.detail ?? data.error ?? data.message;
  if (typeof raw === 'string' && raw) return raw;
  if (raw != null) {
    try {
      return JSON.stringify(raw);
    } catch {
      /* ignore */
    }
  }
  return `Silnik RSS zwrocil status ${status}.`;
}

type EnginePayload = { topic: string; topic_en?: string | null; translate_only?: boolean };

async function callEngine<T>(payload: EnginePayload): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.RSS_ENGINE_SECRET) headers['x-engine-secret'] = process.env.RSS_ENGINE_SECRET;

  let res: Response;
  try {
    res = await fetch(rssEngineUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      // Silnik nie powinien przekierowywac. Jesli middleware/logowanie wystawi 3xx,
      // chcemy jasny blad zamiast po cichu pobierac strone /login.
      redirect: 'manual',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Nie udalo sie polaczyc z silnikiem RSS: ${message}`);
  }

  if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
    throw new Error(
      `Silnik RSS przekierowal (status ${res.status}) - sprawdz, czy /api/rss jest poza middleware i czy RSS_ENGINE_URL jest poprawny.`,
    );
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      detail?: unknown;
      error?: unknown;
      message?: unknown;
    };
    const message = describeError(data, res.status);
    // 429 z silnika = limit Gemini; mapujemy na RateLimitError, zeby daily refresh
    // przerwal reszte boxow zamiast dobijac sie po kolejne 429.
    if (res.status === 429 || isRateLimitError(message)) throw new RateLimitError(message);
    // 404 = brak swiezych newsow dla tematu. To nie awaria, tylko normalny wynik.
    if (res.status === 404) throw new NoFreshNewsError(message);
    throw new Error(message);
  }

  return (await res.json().catch(() => ({}))) as T;
}

/**
 * Pobiera newsy dla tematu. `topicEn` to zcache'owane angielskie haslo (kolumna
 * boxes.topic_en) - gdy go brak, a silnik musi siegnac po wydanie US, policzy tlumaczenie
 * sam i zwroci je w `topicEn`, zebysmy mogli je zapisac na przyszlosc.
 */
export async function fetchRssBullets(
  topic: string,
  topicEn?: string | null,
): Promise<{ bullets: Bullet[]; topicEn: string | null }> {
  const data = await callEngine<{ bullets?: Bullet[]; topic_en?: string | null }>({
    topic,
    topic_en: topicEn ?? null,
  });
  return { bullets: data.bullets ?? [], topicEn: data.topic_en ?? null };
}

/** Liczy angielskie haslo wyszukiwania dla tematu (raz, przy dodaniu/edycji boxa). */
export async function translateTopic(topic: string): Promise<string | null> {
  const data = await callEngine<{ topic_en?: string | null }>({ topic, translate_only: true });
  return data.topic_en ?? null;
}
