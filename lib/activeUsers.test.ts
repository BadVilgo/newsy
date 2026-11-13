import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACTIVITY_TRACKING_SINCE,
  INACTIVE_AFTER_DAYS,
  isUserActive,
  loadInactiveUserIds,
  touchLastSeen,
} from '@/lib/activeUsers';
import { DEMO_EMAIL } from '@/lib/demoAccount';

const DAY = 24 * 60 * 60 * 1000;
// Miesiąc po starcie zbierania znacznika - okres przejściowy już nie obowiązuje.
const NOW = ACTIVITY_TRACKING_SINCE + 30 * DAY;
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

describe('isUserActive', () => {
  it('uznaje za aktywnego kogoś, kto zaglądał w ostatnim tygodniu', () => {
    const user = { id: 'u1', user_metadata: { last_seen_at: daysAgo(2) }, last_sign_in_at: daysAgo(40) };
    expect(isUserActive(user, NOW)).toBe(true);
  });

  // Sesja odnawia się tokenem, więc last_sign_in_at codziennego użytkownika bywa bardzo stare.
  // Liczy się własny znacznik last_seen_at zapisywany przy wejściu na tablicę.
  it('nie ufa samemu last_sign_in_at, gdy jest świeży znacznik wizyty', () => {
    const user = { id: 'u1', user_metadata: { last_seen_at: daysAgo(1) }, last_sign_in_at: daysAgo(90) };
    expect(isUserActive(user, NOW)).toBe(true);
  });

  it('uznaje za nieaktywne konto bez wizyt od ponad tygodnia', () => {
    const user = {
      id: 'u1',
      user_metadata: { last_seen_at: daysAgo(INACTIVE_AFTER_DAYS + 1) },
      last_sign_in_at: daysAgo(20),
      created_at: daysAgo(60),
    };
    expect(isUserActive(user, NOW)).toBe(false);
  });

  it('świeża rejestracja jest aktywna dzięki dacie założenia konta', () => {
    expect(isUserActive({ id: 'u1', created_at: daysAgo(1) }, NOW)).toBe(true);
  });

  it('konto demo jest aktywne zawsze - zasila publiczny podgląd', () => {
    const user = { id: 'demo', email: DEMO_EMAIL, last_sign_in_at: daysAgo(400) };
    expect(isUserActive(user, NOW)).toBe(true);
  });

  it('w okresie przejściowym konta bez znacznika zostają aktywne', () => {
    const justAfterRollout = ACTIVITY_TRACKING_SINCE + 2 * DAY;
    const user = { id: 'u1', last_sign_in_at: new Date(justAfterRollout - 60 * DAY).toISOString() };
    expect(isUserActive(user, justAfterRollout)).toBe(true);
    // Po tygodniu od wdrożenia to samo konto, wciąż bez wizyty, wypada z odświeżania.
    expect(isUserActive(user, ACTIVITY_TRACKING_SINCE + 8 * DAY)).toBe(false);
  });

  it('brak jakiejkolwiek daty nie wyklucza konta', () => {
    expect(isUserActive({ id: 'u1' }, NOW)).toBe(true);
  });
});

describe('touchLastSeen', () => {
  function clientWithSpy() {
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    return { client: { auth: { updateUser } } as unknown as SupabaseClient, updateUser };
  }

  it('zapisuje znacznik przy pierwszej wizycie', async () => {
    const { client, updateUser } = clientWithSpy();
    await touchLastSeen(client, { id: 'u1' }, NOW);
    expect(updateUser).toHaveBeenCalledWith({ data: { last_seen_at: new Date(NOW).toISOString() } });
  });

  it('nie zapisuje częściej niż raz na dobę', async () => {
    const { client, updateUser } = clientWithSpy();
    await touchLastSeen(client, { id: 'u1', user_metadata: { last_seen_at: daysAgo(0.5) } }, NOW);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('błąd zapisu nie przerywa żądania', async () => {
    const client = {
      auth: { updateUser: vi.fn().mockRejectedValue(new Error('sieć')) },
    } as unknown as SupabaseClient;
    await expect(touchLastSeen(client, { id: 'u1' }, NOW)).resolves.toBeUndefined();
  });
});

describe('loadInactiveUserIds', () => {
  it('zwraca identyfikatory kont nieaktywnych', async () => {
    const users = [
      { id: 'aktywny', user_metadata: { last_seen_at: daysAgo(1) } },
      { id: 'porzucony', last_sign_in_at: daysAgo(30), created_at: daysAgo(30) },
      { id: 'demo', email: DEMO_EMAIL, last_sign_in_at: daysAgo(30) },
    ];
    const client = {
      auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users }, error: null }) } },
    } as unknown as SupabaseClient;

    expect([...(await loadInactiveUserIds(client, NOW))]).toEqual(['porzucony']);
  });

  // Fail-open: lepiej odświeżyć wszystkich niż przez błąd API nie odświeżyć nikogo.
  it('przy błędzie API nikogo nie wyklucza', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: new Error('401') }),
        },
      },
    } as unknown as SupabaseClient;

    expect((await loadInactiveUserIds(client, NOW)).size).toBe(0);
  });
});
