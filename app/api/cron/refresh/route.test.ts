import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from './route';

describe('GET /api/cron/refresh', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'sekret-testowy';
  });

  it('odrzuca żądanie bez nagłówka autoryzacji (401)', async () => {
    const res = await GET(new Request('http://localhost/api/cron/refresh'));
    expect(res.status).toBe(401);
  });

  it('odrzuca żądanie z błędnym sekretem (401)', async () => {
    const res = await GET(
      new Request('http://localhost/api/cron/refresh', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('odrzuca żądanie, gdy CRON_SECRET nie jest ustawiony (401)', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(
      new Request('http://localhost/api/cron/refresh', {
        headers: { authorization: 'Bearer cokolwiek' },
      }),
    );
    expect(res.status).toBe(401);
  });
});
