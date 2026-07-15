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

-- ── Rate limiting: max N odświeżeń na IP dziennie (endpoint /api/refresh) ─────────────
-- Licznik trzymamy w bazie, bo funkcje serverless na Vercelu są bezstanowe (Map w pamięci
-- by nie działał między instancjami). Dzień liczymy w UTC — reset o północy UTC.
create table if not exists public.rate_limits (
  ip    text not null,
  day   date not null default (now() at time zone 'utc')::date,
  count int  not null default 0,
  primary key (ip, day)
);

-- Blokujemy bezpośredni dostęp; zapis idzie wyłącznie przez funkcję security definer poniżej.
alter table public.rate_limits enable row level security;

-- Atomowo zwiększa licznik dla IP i mówi, czy żądanie mieści się w limicie.
-- Gdy limit osiągnięty, NIE zwiększa dalej (WHERE przy ON CONFLICT) — count nie puchnie od spamu.
create or replace function public.consume_rate_limit(p_ip text, p_limit int)
returns table (allowed boolean, current_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (ip, day, count)
  values (p_ip, (now() at time zone 'utc')::date, 1)
  on conflict (ip, day)
  do update set count = public.rate_limits.count + 1
    where public.rate_limits.count < p_limit
  returning count into v_count;

  if v_count is null then
    -- ON CONFLICT nie zaktualizował (limit osiągnięty) — zwróć aktualny stan jako zablokowany.
    select count into v_count from public.rate_limits
      where ip = p_ip and day = (now() at time zone 'utc')::date;
    return query select false, v_count;
  else
    return query select true, v_count;
  end if;
end;
$$;
