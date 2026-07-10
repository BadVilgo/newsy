import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids = body.ids;
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'Brak listy ids.' }, { status: 400 });

  const results = await Promise.all(
    ids.map((id, index) => supabase.from('boxes').update({ position: index }).eq('id', String(id))),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
