create table if not exists public.boxes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  topic      text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.snapshots (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references public.boxes (id) on delete cascade,
  fetched_at timestamptz not null default now(),
  items      jsonb not null default '[]'::jsonb
);

create index if not exists snapshots_box_fetched_idx
  on public.snapshots (box_id, fetched_at desc);

alter table public.boxes     enable row level security;
alter table public.snapshots enable row level security;

create policy "boxes_select_own" on public.boxes
  for select using (auth.uid() = user_id);
create policy "boxes_insert_own" on public.boxes
  for insert with check (auth.uid() = user_id);
create policy "boxes_update_own" on public.boxes
  for update using (auth.uid() = user_id);
create policy "boxes_delete_own" on public.boxes
  for delete using (auth.uid() = user_id);

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
