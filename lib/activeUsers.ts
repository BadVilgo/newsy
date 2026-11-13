import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_EMAIL } from './demoAccount';

/**
 * Codzienne odświeżanie pomija konta, na które nikt nie zaglądał od tygodnia. Przy publicznym
 * demo i jednorazowych rejestracjach to największa realna oszczędność: każdy porzucony temat
 * kosztowałby zapytanie do Gemini dziennie, bez końca.
 *
 * Skąd wiemy, że ktoś zagląda? `last_sign_in_at` z Supabase Auth NIE wystarcza - zmienia się
 * tylko przy logowaniu hasłem, a sesja odnawia się tokenem tygodniami, więc codzienny
 * użytkownik wyglądałby na nieaktywnego. Dlatego przy wejściu na tablicę zapisujemy własny
 * znacznik `last_seen_at` w metadanych konta (najwyżej raz na dobę) - bez dodatkowej tabeli.
 */
export const INACTIVE_AFTER_DAYS = 7;
const INACTIVE_AFTER_MS = INACTIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

/** Jak często odnawiamy znacznik - częściej nie ma sensu, liczą się dni. */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Dzień, od którego zbieramy `last_seen_at`. Konta, które jeszcze nie mają znacznika, przez
 * pierwszy tydzień po tej dacie liczymy jako aktywne - inaczej stali użytkownicy z długą
 * sesją wypadliby z odświeżania, zanim zdążyliby otworzyć tablicę po wdrożeniu.
 */
export const ACTIVITY_TRACKING_SINCE = Date.parse('2026-11-12T00:00:00Z');

type AuthUser = {
  id: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function toTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function isUserActive(user: AuthUser, now: number = Date.now()): boolean {
  // Konto demo zasila publiczny podgląd /demo, więc odświeża się zawsze.
  if (user.email === DEMO_EMAIL) return true;

  const lastSeen = toTime(user.user_metadata?.last_seen_at);
  if (lastSeen === null && now < ACTIVITY_TRACKING_SINCE + INACTIVE_AFTER_MS) return true;

  const signals = [lastSeen, toTime(user.last_sign_in_at), toTime(user.created_at)].filter(
    (time): time is number => time !== null,
  );
  // Brak jakiejkolwiek daty traktujemy jak aktywność - wolimy odświeżyć za dużo niż za mało.
  if (signals.length === 0) return true;
  return now - Math.max(...signals) < INACTIVE_AFTER_MS;
}

/**
 * Zapisuje znacznik aktywności zalogowanego użytkownika (klient z jego sesją). Najwyżej raz
 * na dobę, a błąd zapisu nigdy nie psuje żądania - to tylko wskazówka dla odświeżania.
 */
export async function touchLastSeen(
  supabase: SupabaseClient,
  user: AuthUser,
  now: number = Date.now(),
): Promise<void> {
  const lastSeen = toTime(user.user_metadata?.last_seen_at);
  if (lastSeen !== null && now - lastSeen < TOUCH_INTERVAL_MS) return;
  try {
    await supabase.auth.updateUser({ data: { last_seen_at: new Date(now).toISOString() } });
  } catch {
    /* znacznik jest opcjonalny */
  }
}

/**
 * Identyfikatory kont nieaktywnych. Wymaga klienta z kluczem service_role (admin API).
 * Fail-open: gdy listy użytkowników nie da się pobrać, zwraca pusty zbiór - czyli
 * odświeżamy wszystkich, tak jak przed wprowadzeniem tej optymalizacji.
 */
export async function loadInactiveUserIds(
  supabase: SupabaseClient,
  now: number = Date.now(),
): Promise<Set<string>> {
  const inactive = new Set<string>();
  const perPage = 1000;

  try {
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      for (const user of data.users) {
        if (!isUserActive(user, now)) inactive.add(user.id);
      }
      if (data.users.length < perPage) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Nie udało się pobrać listy użytkowników - odświeżam wszystkich:', message);
    return new Set();
  }

  return inactive;
}
