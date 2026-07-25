import type { Bullet } from './gemini';

/**
 * Klient silnika "Newsy 2" napisanego w Pythonie (FastAPI, plik `api/rss.py`).
 * Warstwa TS tylko wola endpoint i dostaje gotowe Bullet[] - cala logika RSS + AI
 * zyje po stronie Pythona. Zapis do bazy robimy juz w TS (auth/RLS w jednym miejscu).
 *
 * URL rozwiazujemy w kolejnosci:
 *  1. RSS_ENGINE_URL         - jawnie ustawiony (uzywany m.in. przez daily refresh w GH Actions),
 *  2. https://$VERCEL_URL/api/rss - gdy dzialamy na Vercelu (funkcja w tym samym deployu),
 *  3. http://localhost:3000/api/rss - lokalnie (dziala tylko pod `vercel dev`, nie `next dev`).
 */
export function rssEngineUrl(): string {
  if (process.env.RSS_ENGINE_URL) return process.env.RSS_ENGINE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/rss`;
  return 'http://localhost:3000/api/rss';
}

export async function fetchRssBullets(topic: string): Promise<Bullet[]> {
  let res: Response;
  try {
    res = await fetch(rssEngineUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Nie udalo sie polaczyc z silnikiem RSS: ${message}`);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { detail?: string; error?: string });
    throw new Error(data.detail || data.error || `Silnik RSS zwrocil status ${res.status}.`);
  }

  const data = (await res.json()) as { bullets?: Bullet[] };
  return data.bullets ?? [];
}
