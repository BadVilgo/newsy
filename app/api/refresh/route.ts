import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RateLimitError } from '@/lib/rssEngine';
import { refreshBoxNews } from '@/lib/refreshBox';

export const maxDuration = 60;

// Maks. odświeżeń na jeden adres IP w ciągu doby (UTC). Chroni płatne Gemini przed nadużyciem.
const DAILY_LIMIT_PER_IP = 30;

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

  // Limit dzienny na IP - atomowo w bazie (funkcja consume_rate_limit z schema.sql).
  const ip = getClientIp(request);
  const { data: rl, error: rlError } = await supabase.rpc('consume_rate_limit', {
    p_ip: ip,
    p_limit: DAILY_LIMIT_PER_IP,
  });
  if (rlError) {
    // Fail-open: gdy sam licznik się wywali, nie blokujemy usera - logujemy i przepuszczamy.
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
    .select('id, topic, topic_en')
    .eq('id', boxId)
    .single();
  if (boxError || !box) return NextResponse.json({ error: 'Box nie istnieje.' }, { status: 404 });

  try {
    // Ręczne odświeżenie zawsze oddaje świeży snapshot (bez pomijania „bez zmian") - użytkownik
    // kliknął, więc ma zobaczyć wynik. Pamięć poprzedniego dnia nadal działa.
    const outcome = await refreshBoxNews(supabase, box, { skipIfUnchanged: false });
    if (outcome.status !== 'refreshed') {
      return NextResponse.json({ error: 'Brak nowych wiadomości.' }, { status: 404 });
    }
    return NextResponse.json({ snapshot: outcome.snapshot });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
