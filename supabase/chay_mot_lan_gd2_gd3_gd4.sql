-- =====================================================================
-- Xóm Mình · CHẠY MỘT LẦN: gộp 0003 + 0004 + 0005 (giai đoạn 2, 3, 4)
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

-- >>>>>>>>>> 0003_hoat_dong.sql
-- =====================================================================
-- Xóm Mình · 0003: điểm danh, kèo, đăng cai, chat, bình chọn, tin ghim
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

-- Thành viên này có phải là chính mình không
create or replace function public.is_me(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where id = p_member and user_id = auth.uid());
$$;
create or replace function public.my_member(p_xom uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where xom_id = p_xom and user_id = auth.uid() limit 1;
$$;

-- Thứ tự tạo chính xác cả khi tạo nhiều người trong cùng một lệnh (giữ đúng thứ tự chồng, vợ)
alter table public.members alter column created_at set default clock_timestamp();

-- ---------- Tin ghim của xóm ----------
alter table public.xoms add column if not exists pin_text text check (pin_text is null or char_length(pin_text) <= 300);
alter table public.xoms add column if not exists pin_member uuid references public.members(id) on delete set null;

-- ---------- Điểm danh ----------
create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  xom_id     uuid not null references public.xoms(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  day        date not null,
  status     text not null check (status in ('cafe','bia','an','con','met','ban')),
  updated_at timestamptz not null default now(),
  unique (member_id, day)
);
create index if not exists checkins_xom_day_idx on public.checkins(xom_id, day);

-- ---------- Kèo ----------
create table if not exists public.keos (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  host_member uuid not null references public.members(id) on delete cascade,
  type        text not null check (type in ('cafe','bia','an','bong','hat','con')),
  title       text not null check (char_length(title) between 1 and 60),
  at          timestamptz not null,
  place       text not null check (char_length(place) between 1 and 100),
  min_people  int not null default 3 check (min_people between 2 and 30),
  cancelled   boolean not null default false,
  locked_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists keos_xom_at_idx on public.keos(xom_id, at);

create table if not exists public.keo_rsvps (
  keo_id     uuid not null references public.keos(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  xom_id     uuid not null references public.xoms(id) on delete cascade,
  status     text not null check (status in ('yes','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key (keo_id, member_id)
);

-- ---------- Đăng cai ----------
create table if not exists public.hosts (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  family_id   uuid references public.families(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 60),
  at          timestamptz not null,
  note        text check (note is null or char_length(note) <= 300),
  created_by  uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists hosts_xom_at_idx on public.hosts(xom_id, at);

create table if not exists public.host_rsvps (
  host_id    uuid not null references public.hosts(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  xom_id     uuid not null references public.xoms(id) on delete cascade,
  status     text not null check (status in ('yes','maybe','no')),
  primary key (host_id, member_id)
);

-- ---------- Chat ----------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  channel     text not null default 'general' check (channel ~ '^(general|keo:[0-9a-f-]{36})$'),
  member_id   uuid references public.members(id) on delete set null,
  kind        text not null default 'text' check (kind in ('text','system')),
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists messages_xom_ch_idx on public.messages(xom_id, channel, created_at desc);

-- ---------- Bình chọn ----------
create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  question    text not null check (char_length(question) between 1 and 120),
  options     text[] not null check (array_length(options, 1) between 2 and 6),
  created_by  uuid references public.members(id) on delete set null,
  closed      boolean not null default false,
  created_at  timestamptz not null default now()
);
create table if not exists public.poll_votes (
  poll_id    uuid not null references public.polls(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  xom_id     uuid not null references public.xoms(id) on delete cascade,
  option     int not null check (option between 0 and 5),
  primary key (poll_id, member_id)
);

-- ---------- RLS ----------
alter table public.checkins   enable row level security;
alter table public.keos       enable row level security;
alter table public.keo_rsvps  enable row level security;
alter table public.hosts      enable row level security;
alter table public.host_rsvps enable row level security;
alter table public.messages   enable row level security;
alter table public.polls      enable row level security;
alter table public.poll_votes enable row level security;

-- Điểm danh: cả xóm xem, mỗi người tự ghi của mình
drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert to authenticated with check (public.is_me(member_id) and xom_id = (select xom_id from public.members where id = member_id));
drop policy if exists checkins_update on public.checkins;
create policy checkins_update on public.checkins for update to authenticated using (public.is_me(member_id)) with check (public.is_me(member_id));

-- Kèo: ai trong xóm cũng rủ được; người rủ hoặc trưởng xóm sửa/huỷ
drop policy if exists keos_select on public.keos;
create policy keos_select on public.keos for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists keos_insert on public.keos;
create policy keos_insert on public.keos for insert to authenticated
  with check (public.is_me(host_member) and xom_id = (select xom_id from public.members where id = host_member) and not cancelled and locked_at is null);
drop policy if exists keos_update on public.keos;
create policy keos_update on public.keos for update to authenticated
  using (public.is_me(host_member) or public.is_xom_admin(xom_id))
  with check (public.is_me(host_member) or public.is_xom_admin(xom_id));

drop policy if exists keo_rsvps_select on public.keo_rsvps;
create policy keo_rsvps_select on public.keo_rsvps for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists keo_rsvps_write on public.keo_rsvps;
create policy keo_rsvps_write on public.keo_rsvps for all to authenticated
  using (public.is_me(member_id))
  with check (public.is_me(member_id) and xom_id = (select k.xom_id from public.keos k where k.id = keo_id));

-- Đăng cai: xem chung; tạo buổi do nhà mình làm chủ, hoặc trưởng xóm mở buổi chờ xung phong
drop policy if exists hosts_select on public.hosts;
create policy hosts_select on public.hosts for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists hosts_insert on public.hosts;
create policy hosts_insert on public.hosts for insert to authenticated
  with check (public.is_xom_member(xom_id) and public.is_me(created_by)
              and ((family_id is null and public.is_xom_admin(xom_id)) or (family_id is not null and public.is_my_family(family_id))));
drop policy if exists hosts_update on public.hosts;
create policy hosts_update on public.hosts for update to authenticated
  using (public.is_xom_admin(xom_id) or (family_id is not null and public.is_my_family(family_id)))
  with check (public.is_xom_admin(xom_id) or (family_id is not null and public.is_my_family(family_id)));
drop policy if exists hosts_delete on public.hosts;
create policy hosts_delete on public.hosts for delete to authenticated using (public.is_xom_admin(xom_id) or public.is_me(created_by));

drop policy if exists host_rsvps_select on public.host_rsvps;
create policy host_rsvps_select on public.host_rsvps for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists host_rsvps_write on public.host_rsvps;
create policy host_rsvps_write on public.host_rsvps for all to authenticated
  using (public.is_me(member_id))
  with check (public.is_me(member_id) and xom_id = (select h.xom_id from public.hosts h where h.id = host_id));

-- Chat: cả xóm đọc; mỗi người gửi tin của mình; tin hệ thống do máy chủ tạo
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (kind = 'text' and public.is_me(member_id) and xom_id = (select xom_id from public.members where id = member_id));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated using (public.is_me(member_id) or public.is_xom_admin(xom_id));

-- Bình chọn
drop policy if exists polls_select on public.polls;
create policy polls_select on public.polls for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists polls_insert on public.polls;
create policy polls_insert on public.polls for insert to authenticated
  with check (public.is_me(created_by) and xom_id = (select xom_id from public.members where id = created_by) and not closed);
drop policy if exists polls_update on public.polls;
create policy polls_update on public.polls for update to authenticated
  using (public.is_me(created_by) or public.is_xom_admin(xom_id)) with check (public.is_me(created_by) or public.is_xom_admin(xom_id));
drop policy if exists poll_votes_select on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists poll_votes_write on public.poll_votes;
create policy poll_votes_write on public.poll_votes for all to authenticated
  using (public.is_me(member_id))
  with check (public.is_me(member_id) and xom_id = (select p.xom_id from public.polls p where p.id = poll_id and not p.closed));

-- ---------- Tin hệ thống tự động ----------
create or replace function public.sys_msg(p_xom uuid, p_body text, p_channel text default 'general')
returns void language sql security definer set search_path = public as $$
  insert into messages(xom_id, channel, kind, body) values (p_xom, p_channel, 'system', left(p_body, 500));
$$;
revoke all on function public.sys_msg(uuid, text, text) from public, anon, authenticated;

create or replace function public.type_label(t text) returns text language sql immutable as $$
  select case t when 'cafe' then '☕ Cafe' when 'bia' then '🍺 Bia' when 'an' then '🍜 Ăn trưa'
                when 'bong' then '⚽ Đá bóng' when 'hat' then '🎤 Karaoke' else '🎡 Đi chơi cùng con' end;
$$;

create or replace function public.keos_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select name into who from members where id = new.host_member;
  if tg_op = 'INSERT' then
    perform sys_msg(new.xom_id, coalesce(who, 'Ai đó') || ' vừa rủ kèo ' || type_label(new.type) || ': ' || new.title);
  elsif new.cancelled and not old.cancelled then
    perform sys_msg(new.xom_id, 'Kèo "' || new.title || '" đã bị huỷ');
  end if;
  return new;
end $$;
drop trigger if exists keos_after on public.keos;
create trigger keos_after after insert or update on public.keos for each row execute function public.keos_after();

-- Đủ người thì tự chốt kèo (một lần) và báo cả xóm
create or replace function public.keo_rsvps_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare k keos; n int;
begin
  select * into k from keos where id = coalesce(new.keo_id, old.keo_id);
  if k.id is null or k.cancelled or k.locked_at is not null then return null; end if;
  select count(*) into n from keo_rsvps where keo_id = k.id and status = 'yes';
  if n >= k.min_people then
    update keos set locked_at = now() where id = k.id;
    perform sys_msg(k.xom_id, 'Kèo "' || k.title || '" đã đủ ' || n || ' người, chốt kèo! 🔥');
  end if;
  return null;
end $$;
drop trigger if exists keo_rsvps_after on public.keo_rsvps;
create trigger keo_rsvps_after after insert or update on public.keo_rsvps for each row execute function public.keo_rsvps_after();

-- Có người vào xóm
create or replace function public.members_joined() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and old.user_id is null then
    perform sys_msg(new.xom_id, new.name || ' vừa vào xóm 👋');
  end if;
  return new;
end $$;
drop trigger if exists members_joined on public.members;
create trigger members_joined after update on public.members for each row execute function public.members_joined();

-- Có nhà nhận đăng cai
create or replace function public.hosts_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare fam text;
begin
  if new.family_id is not null and (tg_op = 'INSERT' or old.family_id is distinct from new.family_id) then
    select string_agg(name, ' & ' order by created_at) into fam from members where family_id = new.family_id and role = 'adult';
    perform sys_msg(new.xom_id, 'Nhà ' || coalesce(fam, '') || ' xung phong đăng cai "' || new.title || '" 🏡');
  elsif tg_op = 'INSERT' and new.family_id is null then
    perform sys_msg(new.xom_id, 'Có buổi mới chờ nhà xung phong đăng cai: "' || new.title || '"');
  end if;
  return new;
end $$;
drop trigger if exists hosts_after on public.hosts;
create trigger hosts_after after insert or update on public.hosts for each row execute function public.hosts_after();

-- Xung phong / nhường lại đăng cai
create or replace function public.volunteer_host(p_host uuid, p_take boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare h hosts; v_fam uuid;
begin
  select * into h from hosts where id = p_host for update;
  if h.id is null or not is_xom_member(h.xom_id) then raise exception 'Không tìm thấy buổi này'; end if;
  select family_id into v_fam from members where xom_id = h.xom_id and user_id = auth.uid();
  if p_take then
    if h.family_id is not null then raise exception 'Buổi này đã có nhà nhận rồi'; end if;
    update hosts set family_id = v_fam where id = h.id;
    insert into host_rsvps(host_id, member_id, xom_id, status)
      select h.id, m.id, h.xom_id, 'yes' from members m where m.family_id = v_fam and m.role = 'adult' and m.user_id is not null
      on conflict (host_id, member_id) do update set status = 'yes';
  else
    if h.family_id is distinct from v_fam then raise exception 'Chỉ nhà đăng cai mới nhường lại được'; end if;
    update hosts set family_id = null where id = h.id;
    delete from host_rsvps where host_id = h.id;
    perform sys_msg(h.xom_id, 'Buổi "' || h.title || '" đang chờ nhà khác xung phong đăng cai');
  end if;
end $$;
revoke all on function public.volunteer_host(uuid, boolean) from public, anon;
grant execute on function public.volunteer_host(uuid, boolean) to authenticated;

-- ---------- Bật cập nhật thời gian thực (chat, điểm danh, kèo) ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages','checkins','keos','keo_rsvps','hosts','host_rsvps','poll_votes','polls'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- >>>>>>>>>> 0004_mieu.sql
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

-- >>>>>>>>>> 0005_thong_bao.sql
-- =====================================================================
-- Xóm Mình · 0005: thông báo đẩy trên điện thoại
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

-- Mỗi điện thoại/trình duyệt bật thông báo là một dòng
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  p256dh      text not null check (char_length(p256dh) < 200),
  auth        text not null check (char_length(auth) < 100),
  created_at  timestamptz not null default now()
);
create index if not exists push_xom_idx on public.push_subscriptions(xom_id);

alter table public.push_subscriptions enable row level security;

-- Người trong xóm đọc được để gửi thông báo cho nhau (không ai gửi được nếu không có khoá riêng của máy chủ)
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.is_me(member_id) and xom_id = (select xom_id from public.members where id = member_id));
drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Dọn các máy đã tắt thông báo hoặc gỡ app (máy chủ báo hết hạn)
create or replace function public.prune_push(p_endpoints text[])
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = any(p_endpoints) and is_xom_member(xom_id);
$$;
revoke all on function public.prune_push(text[]) from public, anon;
grant execute on function public.prune_push(text[]) to authenticated;
