-- ============================================================================
-- Schema dla aplikacji "Newsy — tablica tematów"
-- Wklej całość w Supabase Studio -> SQL Editor -> Run.
-- ============================================================================

-- Box = jeden temat obserwowany przez użytkownika (np. "spółka Nvidia giełda").
create table if not exists public.boxes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  topic      text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- Snapshot = wynik jednego odświeżenia boxa (4 newsy ze źródłami).
-- Najnowszy snapshot renderowany jest jako sekcja "24h", poprzedni jako "24-48h".
-- Dzięki temu nie prosimy Gemini o precyzyjne okno historyczne — wczorajsze "24h"
-- naturalnie staje się dzisiejszym starszym wiadrem.
create table if not exists public.snapshots (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references public.boxes (id) on delete cascade,
  fetched_at timestamptz not null default now(),
  -- items: [{ "text": "...", "sources": [{ "title": "...", "url": "..." }] }]
  items      jsonb not null default '[]'::jsonb
);

create index if not exists snapshots_box_fetched_idx
  on public.snapshots (box_id, fetched_at desc);

-- ----------------------------------------------------------------------------
-- Row Level Security: każdy użytkownik widzi i modyfikuje tylko swoje dane.
-- ----------------------------------------------------------------------------
alter table public.boxes     enable row level security;
alter table public.snapshots enable row level security;

-- BOXES: user_id musi zgadzać się z zalogowanym użytkownikiem.
create policy "boxes_select_own" on public.boxes
  for select using (auth.uid() = user_id);
create policy "boxes_insert_own" on public.boxes
  for insert with check (auth.uid() = user_id);
create policy "boxes_update_own" on public.boxes
  for update using (auth.uid() = user_id);
create policy "boxes_delete_own" on public.boxes
  for delete using (auth.uid() = user_id);

-- SNAPSHOTS: dostęp przez własność boxa nadrzędnego (join).
create policy "snapshots_select_own" on public.snapshots
  for select using (
    exists (select 1 from public.boxes b where b.id = box_id and b.user_id = auth.uid())
  );
create policy "snapshots_insert_own" on public.snapshots
  for insert with check (
    exists (select 1 from public.boxes b where b.id = box_id and b.user_id = auth.uid())
  );
create policy "snapshots_delete_own" on public.snapshots
  for delete using (
    exists (select 1 from public.boxes b where b.id = box_id and b.user_id = auth.uid())
  );
