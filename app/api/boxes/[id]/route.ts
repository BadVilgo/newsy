import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/boxes/:id — zmiana tematu boxa. { topic: string }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const topic = String(body.topic || '').trim();
  if (!topic) return NextResponse.json({ error: 'Podaj temat.' }, { status: 400 });

  // RLS pilnuje własności — nie trzeba ręcznie filtrować po user_id.
  const { data, error } = await supabase
    .from('boxes')
    .update({ topic })
    .eq('id', id)
    .select('id, topic, position, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ box: data });
}

// DELETE /api/boxes/:id — usunięcie boxa (snapshoty kaskadowo znikają).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niezalogowany.' }, { status: 401 });

  const { error } = await supabase.from('boxes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
