/**
 * Codzienne odświeżanie newsów — uruchamiane przez GitHub Actions (scheduled workflow),
 * NIE przez Vercel. Runner GitHuba nie ma limitu 60 s, więc cała pętla po boxach
 * mieści się spokojnie (w przeciwieństwie do funkcji serverless na planie Hobby).
 *
 * Ta sama logika co w app/api/cron/refresh/route.ts, tylko bez warstwy HTTP:
 * pobierz boxy -> dla każdego odśwież temat przez Gemini -> zapisz snapshot.
 *
 * Uruchomienie lokalne (do testów):
 *   npx tsx --env-file=.env.local scripts/refresh.ts
 */
import { createAdminClient } from '../lib/supabase/admin';
import { refreshTopic, RateLimitError } from '../lib/gemini';

async function main() {
  const supabase = createAdminClient();

  const { data: boxes, error } = await supabase.from('boxes').select('id, topic');
  if (error) {
    console.error('Nie udało się pobrać boxów:', error.message);
    process.exit(1);
  }

  const total = boxes?.length ?? 0;
  console.log(`Start odświeżania: ${total} ${total === 1 ? 'box' : 'boxów'}.`);

  let refreshed = 0;
  const failures: { boxId: string; topic: string; error: string }[] = [];

  for (const box of boxes ?? []) {
    try {
      const bullets = await refreshTopic(box.topic);
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

  console.log(`\nPodsumowanie: odświeżono ${refreshed}/${total}, błędów: ${failures.length}.`);

  // Niezerowy kod wyjścia = czerwony status w GitHub Actions, żeby błędy rzucały się w oczy.
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Nieoczekiwany błąd:', err);
  process.exit(1);
});
