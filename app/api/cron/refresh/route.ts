import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RateLimitError, NoFreshNewsError } from '@/lib/rssEngine';
import { refreshBoxNews } from '@/lib/refreshBox';
import { loadInactiveUserIds } from '@/lib/activeUsers';

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: boxes, error } = await supabase
    .from('boxes')
    .select('id, topic, topic_en, user_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Kont, na które nikt nie zagląda od tygodnia, nie odświeżamy (patrz lib/activeUsers.ts).
  const inactiveUsers = await loadInactiveUserIds(supabase);
  const activeBoxes = (boxes ?? []).filter((box) => !inactiveUsers.has(box.user_id));

  let refreshed = 0;
  let unchanged = 0;
  let skipped = 0;
  const failures: { boxId: string; error: string }[] = [];

  for (const box of activeBoxes) {
    try {
      const outcome = await refreshBoxNews(supabase, box, { skipIfUnchanged: true });
      if (outcome.status === 'unchanged') unchanged++;
      else refreshed++;
    } catch (err) {
      // Brak świeżych newsów to normalny wynik, nie awaria - nie raportujemy go jako błąd.
      if (err instanceof NoFreshNewsError) {
        skipped++;
        continue;
      }
      if (err instanceof RateLimitError) {
        failures.push({ boxId: box.id, error: 'rate limit - przerwano' });
        break;
      }
      failures.push({ boxId: box.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    refreshed,
    unchanged,
    skipped,
    inactive: (boxes?.length ?? 0) - activeBoxes.length,
    failures,
  });
}
