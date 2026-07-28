import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { translateTopic } from '@/lib/rssEngine';

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

  // Temat sie zmienil, wiec zcache'owane angielskie haslo trzeba przeliczyc.
  const topicEn = await translateTopic(topic).catch(() => null);

  const { data, error } = await supabase
    .from('boxes')
    .update({ topic, topic_en: topicEn })
    .eq('id', id)
    .select('id, topic, topic_en, position, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ box: data });
}

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
