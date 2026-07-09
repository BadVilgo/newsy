import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { refreshTopic, RateLimitError } from '@/lib/gemini';

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const boxId = String(body.boxId || '');
  if (!boxId) return NextResponse.json({ error: 'Brak boxId.' }, { status: 400 });

  const { data: box, error: boxError } = await supabase
    .from('boxes')
    .select('id, topic')
    .eq('id', boxId)
    .single();
  if (boxError || !box) return NextResponse.json({ error: 'Box nie istnieje.' }, { status: 404 });

  try {
    const bullets = await refreshTopic(box.topic);

    const { data: snapshot, error: insertError } = await supabase
      .from('snapshots')
      .insert({ box_id: box.id, items: bullets })
      .select('id, fetched_at, items')
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ snapshot });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Błąd Gemini: ' + message }, { status: 500 });
  }
}
