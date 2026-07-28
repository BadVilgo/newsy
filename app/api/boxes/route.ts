import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { translateTopic } from '@/lib/rssEngine';

// Snapshoty zapisujemy z metoda 'rss' (silnik w Pythonie). Stare wpisy z poprzedniego
// wariantu (grounding, method='search') zostaja w bazie, ale ich nie pokazujemy.
const METHOD = 'rss';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const { data: boxes, error } = await supabase
    .from('boxes')
    .select('id, topic, topic_en, position, created_at, snapshots(id, fetched_at, items)')
    .eq('snapshots.method', METHOD)
    .order('position', { ascending: true })
    .order('fetched_at', { referencedTable: 'snapshots', ascending: false })
    .limit(2, { referencedTable: 'snapshots' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ boxes: boxes ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const topic = String(body.topic || '').trim();
  if (!topic) return NextResponse.json({ error: 'Podaj temat.' }, { status: 400 });

  const { data: last } = await supabase
    .from('boxes')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  // Angielskie haslo liczymy RAZ, przy dodaniu tematu - odswiezanie korzysta juz z cache.
  // Best-effort: gdy silnik nie odpowie, box i tak powstaje (tlumaczenie doliczy sie pozniej).
  const topicEn = await translateTopic(topic).catch(() => null);

  const { data, error } = await supabase
    .from('boxes')
    .insert({ user_id: user.id, topic, topic_en: topicEn, position })
    .select('id, topic, topic_en, position, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ box: { ...data, snapshots: [] } }, { status: 201 });
}
