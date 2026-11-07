-- =====================================================================
-- Xóm Mình · 0004: Miếu Thần Tài (thắp hương, lời nguyện, xin xăm)
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

-- Thắp hương: ai thắp, lúc nào, dâng gì (cả xóm xem được)
create table if not exists public.altar_offerings (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  day         date not null,
  offerings   text[] not null default '{}' check (offerings <@ array['hoa','qua','nuoc','vang']::text[]),
  created_at  timestamptz not null default now(),
  unique (member_id, day)
);
create index if not exists altar_xom_day_idx on public.altar_offerings(xom_id, day);

-- Lời nguyện: tách riêng để lời nguyện "chỉ mình tôi thấy" không lộ ra ngoài
create table if not exists public.altar_wishes (
  offering_id uuid primary key references public.altar_offerings(id) on delete cascade,
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  wish        text not null check (char_length(wish) between 1 and 200),
  private     boolean not null default false
);

-- Xin xăm: mỗi người một quẻ mỗi ngày
create table if not exists public.xam_draws (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  day         date not null,
  n           int not null check (n between 1 and 36),
  topic       text not null check (topic in ('chung','gia','tai','cong','con')),
  shared      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (member_id, day)
);

alter table public.altar_offerings enable row level security;
alter table public.altar_wishes    enable row level security;
alter table public.xam_draws       enable row level security;

drop policy if exists altar_select on public.altar_offerings;
create policy altar_select on public.altar_offerings for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists altar_insert on public.altar_offerings;
create policy altar_insert on public.altar_offerings for insert to authenticated
  with check (public.is_me(member_id) and xom_id = (select xom_id from public.members where id = member_id));

drop policy if exists wishes_select on public.altar_wishes;
create policy wishes_select on public.altar_wishes for select to authenticated
  using (public.is_xom_member(xom_id) and (not private or public.is_me(member_id)));
drop policy if exists wishes_insert on public.altar_wishes;
create policy wishes_insert on public.altar_wishes for insert to authenticated
  with check (public.is_me(member_id)
              and exists (select 1 from public.altar_offerings o where o.id = offering_id and o.member_id = altar_wishes.member_id and o.xom_id = altar_wishes.xom_id));

drop policy if exists xam_select on public.xam_draws;
create policy xam_select on public.xam_draws for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists xam_insert on public.xam_draws;
create policy xam_insert on public.xam_draws for insert to authenticated
  with check (public.is_me(member_id) and xom_id = (select xom_id from public.members where id = member_id) and not shared);
drop policy if exists xam_update on public.xam_draws;
create policy xam_update on public.xam_draws for update to authenticated using (public.is_me(member_id)) with check (public.is_me(member_id));

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['altar_offerings'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
