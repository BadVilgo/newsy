import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { Box } from './types';
import { DEMO_EMAIL, DEMO_PASSWORD } from './demoAccount';
import { METHOD } from './refreshBox';

/**
 * Dane do publicznego podglądu (/demo i kafelki na stronie głównej): tematy konta demo
 * razem z dwoma ostatnimi snapshotami - dokładnie to, co widać po zalogowaniu na to konto.
 *
 * Czytamy je po stronie SERWERA, logując się na konto demo kluczem publicznym (anon). Dane
 * logowania tego konta i tak są jawne, a taki odczyt przechodzi przez te same polityki RLS
 * co zwykła sesja - nie potrzeba klucza service_role ani żadnej dodatkowej konfiguracji.
 *
 * Wynik jest cache'owany na 15 minut i współdzielony przez obie strony, więc do bazy idzie
 * najwyżej jedno logowanie na kwadrans, niezależnie od liczby odwiedzających.
 *
 * Podgląd jest dodatkiem: przy jakimkolwiek błędzie (brak sieci na etapie builda, awaria
 * Supabase) `fetchDemoBoxes` oddaje pustą listę, a strona pokazuje się bez niego.
 */

/** Jak długo żyje cache podglądu (sekundy). Ta sama wartość steruje ISR obu stron. */
export const DEMO_REVALIDATE_SECONDS = 900;

// Build ani odwiedzający nie mogą czekać na wolną bazę.
const TIMEOUT_MS = 6000;

/**
 * Fetch z limitem czasu. Błąd sieci zamieniamy na odpowiedź 503: klient Supabase zwraca ją jako
 * zwykły błąd, zamiast wypisywać stos wywołań do logów (build w CI nie ma dostępu do bazy,
 * więc bez tego każdy przebieg kończyłby się czerwonym, mylącym wpisem).
 */
const quietFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return new Response(JSON.stringify({ message: 'Baza niedostępna.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/** Właściwy odczyt. Rzuca przy błędzie - dzięki temu porażka NIE trafia do cache'a. */
async function loadDemoBoxes(): Promise<Box[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Brak konfiguracji Supabase.');

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: quietFetch },
  });

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (authError) throw authError;

  try {
    const { data, error } = await supabase
      .from('boxes')
      .select('id, topic, position, created_at, snapshots(id, fetched_at, items)')
      .eq('snapshots.method', METHOD)
      .order('position', { ascending: true })
      .order('fetched_at', { referencedTable: 'snapshots', ascending: false })
      .limit(2, { referencedTable: 'snapshots' });
    if (error) throw error;
    return (data ?? []) as Box[];
  } finally {
    // Sprzątamy po sobie: bez tego każde odświeżenie cache'a zostawiałoby w Supabase martwą
    // sesję. Zakres 'local' kończy TYLKO tę sesję - domyślny 'global' wylogowałby wszystkich,
    // którzy akurat korzystają z konta demo w przeglądarce.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}

const loadDemoBoxesCached = unstable_cache(loadDemoBoxes, ['demo-boxes'], {
  revalidate: DEMO_REVALIDATE_SECONDS,
});

export async function fetchDemoBoxes(): Promise<Box[]> {
  try {
    return await loadDemoBoxesCached();
  } catch {
    return [];
  }
}

/** Tematy, które mają co pokazać (przynajmniej jeden news w najnowszym snapshocie). */
export function boxesWithNews(boxes: Box[]): Box[] {
  return boxes.filter((box) => (box.snapshots[0]?.items.length ?? 0) > 0);
}
