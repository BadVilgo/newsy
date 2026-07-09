import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshTopic, RateLimitError } from '@/lib/gemini';

export const maxDuration = 60;

// GET /api/cron/refresh — wołane codziennie przez Vercel Cron (patrz vercel.json).
// Vercel automatycznie dodaje nagłówek "Authorization: Bearer <CRON_SECRET>",
// jeśli zmienna CRON_SECRET jest ustawiona — tak weryfikujemy, że to naprawdę cron.
// Używa klienta admin (service_role), bo musi odświeżyć boxy WSZYSTKICH użytkowników.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: boxes, error } = await supabase.from('boxes').select('id, topic');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let refreshed = 0;
  const failures: { boxId: string; error: string }[] = [];

  // Sekwencyjnie — bezpieczne dla limitów RPM Gemini (unikamy równoległych 429).
  for (const box of boxes ?? []) {
    try {
      const bullets = await refreshTopic(box.topic);
      const { error: insertError } = await supabase
        .from('snapshots')
        .insert({ box_id: box.id, items: bullets });
      if (insertError) {
        failures.push({ boxId: box.id, error: insertError.message });
      } else {
        refreshed++;
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        // Wyczerpany dzienny limit — przerywamy, resztę dokończy kolejny przebieg.
        failures.push({ boxId: box.id, error: 'rate limit — przerwano' });
        break;
      }
      failures.push({ boxId: box.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ refreshed, failures });
}
