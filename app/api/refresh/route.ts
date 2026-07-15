import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { refreshTopic, RateLimitError } from '@/lib/gemini';

export const maxDuration = 60;

// Maks. odświeżeń na jeden adres IP w ciągu doby (UTC). Chroni płatne Gemini przed nadużyciem.
const DAILY_LIMIT_PER_IP = 15;

function getClientIp(request: Request): string {
  // Na Vercelu prawdziwe IP klienta jest w x-forwarded-for (pierwszy wpis na liście).
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  // Limit dzienny na IP — atomowo w bazie (funkcja consume_rate_limit z schema.sql).
  const ip = getClientIp(request);
  const { data: rl, error: rlError } = await supabase.rpc('consume_rate_limit', {
    p_ip: ip,
    p_limit: DAILY_LIMIT_PER_IP,
  });
  if (rlError) {
    // Fail-open: gdy sam licznik się wywali, nie blokujemy usera — logujemy i przepuszczamy.
    console.error('Rate limit RPC error:', rlError.message);
  } else {
    const row = Array.isArray(rl) ? rl[0] : rl;
    if (row && row.allowed === false) {
      return NextResponse.json(
        { error: `Przekroczono dzienny limit odświeżeń (${DAILY_LIMIT_PER_IP} na dobę). Spróbuj ponownie jutro.` },
        { status: 429 },
      );
    }
  }

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
