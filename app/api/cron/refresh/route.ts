import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchRssBullets, RateLimitError } from '@/lib/rssEngine';

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: boxes, error } = await supabase.from('boxes').select('id, topic, topic_en');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let refreshed = 0;
  const failures: { boxId: string; error: string }[] = [];

  for (const box of boxes ?? []) {
    try {
      const { bullets, topicEn } = await fetchRssBullets(box.topic, box.topic_en);
      if (topicEn && topicEn !== box.topic_en) {
        await supabase.from('boxes').update({ topic_en: topicEn }).eq('id', box.id);
      }
      const { error: insertError } = await supabase
        .from('snapshots')
        .insert({ box_id: box.id, items: bullets, method: 'rss' });
      if (insertError) {
        failures.push({ boxId: box.id, error: insertError.message });
      } else {
        refreshed++;
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        failures.push({ boxId: box.id, error: 'rate limit - przerwano' });
        break;
      }
      failures.push({ boxId: box.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ refreshed, failures });
}
