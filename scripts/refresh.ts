/**
 * Codzienne odświeżanie newsów — uruchamiane przez GitHub Actions (scheduled workflow),
 * NIE przez Vercel. Runner GitHuba nie ma limitu 60 s, więc cała pętla po boxach
 * mieści się spokojnie (w przeciwieństwie do funkcji serverless na planie Hobby).
 *
 * Retry „co 20 min, do 3 prób" jest realizowany PRZEZ HARMONOGRAM, nie przez usypianie
 * runnera: workflow odpala się 3x co 20 min (0,20,40 * ...), a ten skrypt pomija boxy,
 * które mają już świeży snapshot (< FRESH_WINDOW_MS). Dzięki temu kolejne przebiegi
 * ponawiają tylko te boxy, które wcześniej padły (np. na 503 od Gemini). Gdy wszystkie
 * są gotowe, kolejny przebieg kończy się natychmiast.
 *
 * Ręczne uruchomienie (workflow_dispatch) ustawia FORCE_REFRESH=true i odświeża wszystko
 * niezależnie od świeżości — wygodne do testów.
 *
 * Uruchomienie lokalne:
 *   npx tsx --env-file=.env.local scripts/refresh.ts
 */
import { createAdminClient } from '../lib/supabase/admin';
import { refreshTopic, RateLimitError, type Bullet } from '../lib/gemini';

// Box uznajemy za „świeży" (do pominięcia), jeśli ma snapshot z ostatnich 3 godzin.
// Okno musi być wyraźnie większe niż rozjazd prób (40 min), a wyraźnie mniejsze niż doba.
const FRESH_WINDOW_MS = 3 * 60 * 60 * 1000;

// Szybki retry w obrębie jednej próby dla PRZEJŚCIOWYCH błędów Gemini (503/overload).
// To krótkie przeciążenia po stronie Google, więc zwykle wystarczy ponowić po kilkunastu
// sekundach — dzięki temu często wszystkie boxy przechodzą już w pierwszym przebiegu o 9:00,
// a mechanizm „co 20 min" zostaje jako zabezpieczenie na dłuższe awarie.
const RETRY_DELAYS_MS = [15_000, 15_000]; // 2 ponowienia => max 3 próby na box

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('overloaded') ||
    msg.toLowerCase().includes('high demand')
  );
}

async function refreshWithRetry(topic: string): Promise<Bullet[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await refreshTopic(topic);
    } catch (err) {
      // Limitu (429) ani błędów merytorycznych nie ponawiamy — tylko przejściowe przeciążenia.
      if (err instanceof RateLimitError || !isTransientError(err) || attempt >= RETRY_DELAYS_MS.length) {
        throw err;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      console.log(
        `  … przeciążenie Gemini (503) dla "${topic}", ponawiam za ${delay / 1000}s ` +
          `(próba ${attempt + 2}/${RETRY_DELAYS_MS.length + 1})`,
      );
      await sleep(delay);
    }
  }
}

async function main() {
  const force = process.env.FORCE_REFRESH === 'true';
  const supabase = createAdminClient();

  const { data: boxes, error } = await supabase.from('boxes').select('id, topic');
  if (error) {
    console.error('Nie udało się pobrać boxów:', error.message);
    process.exit(1);
  }

  // Zbiór boxów, które mają już świeży snapshot — pomijamy je (chyba że FORCE_REFRESH).
  const freshBoxIds = new Set<string>();
  if (!force) {
    const cutoff = new Date(Date.now() - FRESH_WINDOW_MS).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from('snapshots')
      .select('box_id')
      .gte('fetched_at', cutoff);
    if (recentError) {
      console.error('Nie udało się sprawdzić świeżości snapshotów:', recentError.message);
      process.exit(1);
    }
    for (const row of recent ?? []) freshBoxIds.add(row.box_id);
  }

  const total = boxes?.length ?? 0;
  const toRefresh = (boxes ?? []).filter((box) => !freshBoxIds.has(box.id));
  console.log(
    `Start odświeżania: ${total} boxów, do zrobienia ${toRefresh.length}` +
      (force ? ' (FORCE — pełne odświeżenie).' : `, świeżych pominiętych ${total - toRefresh.length}.`),
  );

  let refreshed = 0;
  const failures: { boxId: string; topic: string; error: string }[] = [];

  for (const box of toRefresh) {
    try {
      const bullets = await refreshWithRetry(box.topic);
      const { error: insertError } = await supabase
        .from('snapshots')
        .insert({ box_id: box.id, items: bullets });

      if (insertError) {
        failures.push({ boxId: box.id, topic: box.topic, error: insertError.message });
        console.error(`✗ "${box.topic}" — zapis do bazy nieudany: ${insertError.message}`);
      } else {
        refreshed++;
        console.log(`✓ "${box.topic}" — ${bullets.length} newsów`);
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        // Wyczerpany dzienny limit Gemini — dalsze boxy i tak dostaną 429, więc przerywamy.
        failures.push({ boxId: box.id, topic: box.topic, error: 'rate limit — przerwano' });
        console.error(`✗ "${box.topic}" — limit Gemini wyczerpany, przerywam resztę.`);
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ boxId: box.id, topic: box.topic, error: message });
      console.error(`✗ "${box.topic}" — ${message}`);
    }
  }

  console.log(
    `\nPodsumowanie: odświeżono ${refreshed}/${toRefresh.length} próbowanych, błędów: ${failures.length}.`,
  );

  // Niezerowy kod wyjścia = czerwony status w GitHub Actions. Padnięcia oznaczamy jako błąd,
  // żeby rzucały się w oczy — kolejny przebieg (za 20 min) ponowi tylko te boxy.
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Nieoczekiwany błąd:', err);
  process.exit(1);
});
