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

/** FastAPI zwraca blad w polu `detail`; przy walidacji to tablica obiektow, nie string. */
function describeDetail(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail) return detail;
  if (detail != null) {
    try {
      return JSON.stringify(detail);
    } catch {
      /* ignore */
    }
  }
  return `Silnik RSS zwrocil status ${status}.`;
}

export async function fetchRssBullets(topic: string): Promise<Bullet[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.RSS_ENGINE_SECRET) headers['x-engine-secret'] = process.env.RSS_ENGINE_SECRET;

  let res: Response;
  try {
    res = await fetch(rssEngineUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic }),
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
    const data = (await res.json().catch(() => ({}))) as { detail?: unknown; error?: unknown };
    throw new Error(describeDetail(data.detail ?? data.error, res.status));
  }

  const data = (await res.json().catch(() => ({}))) as { bullets?: Bullet[] };
  return data.bullets ?? [];
}
