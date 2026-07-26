import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rssEngineUrl, describeError, fetchRssBullets } from '@/lib/rssEngine';

const ENV_KEYS = ['RSS_ENGINE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL', 'RSS_ENGINE_SECRET'];

describe('rssEngineUrl', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('preferuje jawny RSS_ENGINE_URL ponad wszystko', () => {
    process.env.RSS_ENGINE_URL = 'https://example.com/api/rss';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'newsy-nine.vercel.app';
    process.env.VERCEL_URL = 'newsy-nine-abc123.vercel.app';
    expect(rssEngineUrl()).toBe('https://example.com/api/rss');
  });

  it('uzywa adresu produkcyjnego zamiast (chronionego) adresu deploya', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'newsy-nine.vercel.app';
    process.env.VERCEL_URL = 'newsy-nine-abc123.vercel.app';
    expect(rssEngineUrl()).toBe('https://newsy-nine.vercel.app/api/rss');
  });

  it('spada do VERCEL_URL, gdy brak adresu produkcyjnego', () => {
    process.env.VERCEL_URL = 'newsy-nine-abc123.vercel.app';
    expect(rssEngineUrl()).toBe('https://newsy-nine-abc123.vercel.app/api/rss');
  });

  it('lokalnie wskazuje na localhost', () => {
    expect(rssEngineUrl()).toBe('http://localhost:3000/api/rss');
  });
});

describe('describeError', () => {
  it('zwraca string z pola detail (FastAPI)', () => {
    expect(describeError({ detail: 'Podaj temat.' }, 400)).toBe('Podaj temat.');
  });

  it('serializuje tablicowy detail walidacji zamiast dawac [object Object]', () => {
    const out = describeError({ detail: [{ loc: ['body', 'topic'], msg: 'field required' }] }, 422);
    expect(out).not.toBe('[object Object]');
    expect(out).toContain('field required');
  });

  it('czyta pole message z Vercel Deployment Protection', () => {
    expect(describeError({ message: 'Protected deployment', code: '401' } as never, 401)).toBe(
      'Protected deployment',
    );
  });

  it('gdy brak tresci - podaje status', () => {
    expect(describeError({}, 500)).toBe('Silnik RSS zwrocil status 500.');
  });
});

describe('fetchRssBullets', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
    delete process.env.RSS_ENGINE_URL;
    delete process.env.RSS_ENGINE_SECRET;
  });

  function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      ...response,
    }) as unknown as typeof fetch;
  }

  it('zwraca bullets przy odpowiedzi OK', async () => {
    process.env.RSS_ENGINE_URL = 'https://example.com/api/rss';
    const bullets = [{ text: 'news', sources: [] }];
    mockFetch({ ok: true, status: 200, json: async () => ({ bullets }) });
    await expect(fetchRssBullets('Polska')).resolves.toEqual(bullets);
  });

  it('rzuca czytelny blad przy 401 Protected deployment', async () => {
    process.env.RSS_ENGINE_URL = 'https://example.com/api/rss';
    mockFetch({ ok: false, status: 401, json: async () => ({ message: 'Protected deployment' }) });
    await expect(fetchRssBullets('Polska')).rejects.toThrow('Protected deployment');
  });

  it('wykrywa przekierowanie (3xx) i tlumaczy przyczyne', async () => {
    process.env.RSS_ENGINE_URL = 'https://example.com/api/rss';
    mockFetch({ ok: false, status: 307, json: async () => ({}) });
    await expect(fetchRssBullets('Polska')).rejects.toThrow(/przekierowal/);
  });

  it('dokleja naglowek sekretu, gdy ustawiony RSS_ENGINE_SECRET', async () => {
    process.env.RSS_ENGINE_URL = 'https://example.com/api/rss';
    process.env.RSS_ENGINE_SECRET = 'tajne';
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ bullets: [] }) });
    global.fetch = spy as unknown as typeof fetch;
    await fetchRssBullets('Polska');
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-engine-secret']).toBe('tajne');
  });
});
