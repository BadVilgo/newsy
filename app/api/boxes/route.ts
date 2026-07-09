import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/boxes — lista boxów zalogowanego użytkownika wraz z ostatnimi dwoma
// snapshotami każdego (24h + 24-48h). RLS gwarantuje, że wracają tylko własne dane.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const { data: boxes, error } = await supabase
    .from('boxes')
    .select('id, topic, position, created_at, snapshots(id, fetched_at, items)')
    .order('position', { ascending: true })
    .order('fetched_at', { referencedTable: 'snapshots', ascending: false })
    .limit(2, { referencedTable: 'snapshots' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ boxes: boxes ?? [] });
}

// POST /api/boxes — nowy box z tematem. { topic: string }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const topic = String(body.topic || '').trim();
  if (!topic) return NextResponse.json({ error: 'Podaj temat.' }, { status: 400 });

  // Nowy box na koniec listy (position = max + 1).
  const { data: last } = await supabase
    .from('boxes')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('boxes')
    .insert({ user_id: user.id, topic, position })
    .select('id, topic, position, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ box: { ...data, snapshots: [] } }, { status: 201 });
}
