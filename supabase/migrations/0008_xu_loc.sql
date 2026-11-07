-- =====================================================================
-- Xóm Mình · 0008: Xu Lộc (sửa nhà trên Phố xóm) và Cây Đa của xóm
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- Xu chỉ được cộng ở máy chủ (trigger), người dùng không tự cộng được.
-- =====================================================================

create table if not exists public.xu_events (
  id         uuid primary key default gen_random_uuid(),
  xom_id     uuid not null references public.xoms(id) on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  member_id  uuid references public.members(id) on delete set null,
  kind       text not null,
  ref        text not null,
  amount     int not null,
  day        date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  created_at timestamptz not null default now()
);
create unique index if not exists xu_once_member on public.xu_events(member_id, kind, ref) where member_id is not null;
create unique index if not exists xu_once_family on public.xu_events(family_id, kind, ref) where member_id is null;
create index if not exists xu_xom_day on public.xu_events(xom_id, day);
create index if not exists xu_family on public.xu_events(family_id);
alter table public.xu_events enable row level security;
drop policy if exists xu_select on public.xu_events;
create policy xu_select on public.xu_events for select to authenticated using (public.is_xom_member(xom_id));

create table if not exists public.family_decor (
  family_id  uuid not null references public.families(id) on delete cascade,
  xom_id     uuid not null references public.xoms(id) on delete cascade,
  item       text not null,
  shown      boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (family_id, item)
);
alter table public.family_decor enable row level security;
drop policy if exists decor_select on public.family_decor;
create policy decor_select on public.family_decor for select to authenticated using (public.is_xom_member(xom_id));

-- Bảng giá đồ trang trí (phải khớp với src/decor.ts)
create or replace function public.decor_price(p_item text) returns int
language sql immutable as $$
  select case p_item
    when 'hoa' then 20 when 'chuong' then 25 when 'ga' then 30 when 'xe_dap' then 35
    when 'meo' then 40 when 'den_nhay' then 45 when 'cay_oi' then 50 when 'dieu' then 60
    when 'bien_vang' then 80
    when 'mai_do' then 30 when 'mai_xanh' then 30 when 'mai_tim' then 30 when 'mai_vang' then 30
  end;
$$;

-- Cộng xu cho một người (mỗi việc chỉ tính một lần; p_cap: tối đa bao nhiêu lần loại này mỗi ngày)
create or replace function public.xu_give(p_member uuid, p_kind text, p_ref text, p_amount int, p_cap int default null)
returns void language plpgsql security definer set search_path = public as $$
declare m members; v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into m from members where id = p_member;
  if m.id is null then return; end if;
  if p_cap is not null and (select count(*) from xu_events where member_id = m.id and kind = p_kind and day = v_day) >= p_cap then return; end if;
  insert into xu_events(xom_id, family_id, member_id, kind, ref, amount)
    values (m.xom_id, m.family_id, m.id, p_kind, p_ref, p_amount) on conflict do nothing;
end $$;
revoke all on function public.xu_give(uuid, text, text, int, int) from public, anon, authenticated;

create or replace function public.xu_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_table_name = 'checkins' then perform xu_give(new.member_id, 'checkin', new.day::text, 5);
    elsif tg_table_name = 'altar_offerings' then perform xu_give(new.member_id, 'altar', new.day::text, 5);
    elsif tg_table_name = 'keos' then perform xu_give(new.host_member, 'keo_new', new.id::text, 5, 2);
    elsif tg_table_name = 'keo_rsvps' then
      if new.status = 'yes' then perform xu_give(new.member_id, 'keo', new.keo_id::text, 3); end if;
    elsif tg_table_name = 'hosts' then
      if new.family_id is not null then
        perform xu_give(coalesce((select id from members where family_id = new.family_id and user_id = auth.uid() limit 1),
                                 (select id from members where family_id = new.family_id and role = 'adult' order by created_at limit 1)),
                        'host', new.id::text, 20);
      end if;
    elsif tg_table_name = 'help_responses' then
      if not exists (select 1 from help_posts p where p.id = new.post_id and p.member_id = new.member_id) then
        perform xu_give(new.member_id, 'help', new.post_id::text, 5);
      end if;
    elsif tg_table_name = 'photos' then perform xu_give(new.member_id, 'photo', new.id::text, 2, 3);
    end if;
  exception when others then null; -- lỗi cộng xu không được làm hỏng việc chính
  end;
  return new;
end $$;

drop trigger if exists xu_checkins on public.checkins;
create trigger xu_checkins after insert on public.checkins for each row execute function public.xu_trg();
drop trigger if exists xu_altar on public.altar_offerings;
create trigger xu_altar after insert on public.altar_offerings for each row execute function public.xu_trg();
drop trigger if exists xu_keos on public.keos;
create trigger xu_keos after insert on public.keos for each row execute function public.xu_trg();
drop trigger if exists xu_keo_rsvps on public.keo_rsvps;
create trigger xu_keo_rsvps after insert or update of status on public.keo_rsvps for each row execute function public.xu_trg();
drop trigger if exists xu_hosts on public.hosts;
create trigger xu_hosts after insert or update of family_id on public.hosts for each row execute function public.xu_trg();
drop trigger if exists xu_help on public.help_responses;
create trigger xu_help after insert on public.help_responses for each row execute function public.xu_trg();
drop trigger if exists xu_photos on public.photos;
create trigger xu_photos after insert on public.photos for each row execute function public.xu_trg();

-- Tính luôn xu cho những việc đã làm trước đây
insert into xu_events(xom_id, family_id, member_id, kind, ref, amount, day, created_at)
  select c.xom_id, m.family_id, m.id, 'checkin', c.day::text, 5, c.day, c.updated_at from checkins c join members m on m.id = c.member_id
  on conflict do nothing;
insert into xu_events(xom_id, family_id, member_id, kind, ref, amount, day, created_at)
  select a.xom_id, m.family_id, m.id, 'altar', a.day::text, 5, a.day, a.created_at from altar_offerings a join members m on m.id = a.member_id
  on conflict do nothing;
insert into xu_events(xom_id, family_id, member_id, kind, ref, amount, day, created_at)
  select h.xom_id, h.family_id, (select id from members where family_id = h.family_id and role = 'adult' order by created_at limit 1), 'host', h.id::text, 20,
         (h.created_at at time zone 'Asia/Ho_Chi_Minh')::date, h.created_at
  from hosts h where h.family_id is not null
  on conflict do nothing;

-- Mục tiêu tưới Cây Đa mỗi tháng: 25 lượt cho mỗi nhà
create or replace function public.tree_goal(p_xom uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(50, 25 * (select count(*) from families where xom_id = p_xom))::int;
$$;

-- Mọi số liệu Xu Lộc của xóm trong một lần gọi
create or replace function public.xom_xu(p_xom uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_now date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_month date := date_trunc('month', v_now)::date; v_week date := date_trunc('week', v_now)::date;
begin
  if not is_xom_member(p_xom) then raise exception 'Không có quyền'; end if;
  return jsonb_build_object(
    'balance', coalesce((select jsonb_object_agg(family_id, s) from (select family_id, sum(amount) s from xu_events where xom_id = p_xom group by family_id) t), '{}'::jsonb),
    'week', coalesce((select jsonb_object_agg(family_id, s) from (select family_id, sum(amount) s from xu_events where xom_id = p_xom and amount > 0 and kind <> 'tree' and day >= v_week group by family_id) t), '{}'::jsonb),
    'today', coalesce((select jsonb_agg(jsonb_build_object('member_id', member_id, 'kind', kind, 'amount', amount)) from xu_events where xom_id = p_xom and day = v_now and member_id is not null and amount > 0), '[]'::jsonb),
    'water', (select count(*) from xu_events where xom_id = p_xom and kind in ('checkin', 'altar') and day >= v_month),
    'goal', tree_goal(p_xom),
    'tree_done', exists (select 1 from xu_events where xom_id = p_xom and kind = 'tree' and ref = to_char(v_month, 'YYYY-MM')),
    'decor', coalesce((select jsonb_agg(jsonb_build_object('family_id', family_id, 'item', item, 'shown', shown)) from family_decor where xom_id = p_xom), '[]'::jsonb)
  );
end $$;

-- Mua đồ trang trí cho nhà mình
create or replace function public.buy_decor(p_family uuid, p_item text)
returns void language plpgsql security definer set search_path = public as $$
declare f families; v_price int := decor_price(p_item); v_bal int; v_me uuid;
begin
  if v_price is null then raise exception 'Món này không có trong cửa hàng'; end if;
  select * into f from families where id = p_family for update;
  if f.id is null or not is_my_family(p_family) then raise exception 'Chỉ sửa được nhà mình'; end if;
  if exists (select 1 from family_decor where family_id = p_family and item = p_item) then raise exception 'Nhà mình có món này rồi'; end if;
  select coalesce(sum(amount), 0) into v_bal from xu_events where family_id = p_family;
  if v_bal < v_price then raise exception 'Chưa đủ Xu Lộc (còn thiếu % xu)', v_price - v_bal; end if;
  select id into v_me from members where family_id = p_family and user_id = auth.uid() limit 1;
  insert into xu_events(xom_id, family_id, member_id, kind, ref, amount) values (f.xom_id, p_family, v_me, 'buy', p_item, -v_price);
  if p_item like 'mai\_%' then update family_decor set shown = false where family_id = p_family and item like 'mai\_%'; end if;
  insert into family_decor(family_id, xom_id, item) values (p_family, f.xom_id, p_item);
end $$;

-- Bày ra hoặc cất đi
create or replace function public.set_decor(p_family uuid, p_item text, p_shown boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_my_family(p_family) then raise exception 'Chỉ sửa được nhà mình'; end if;
  if p_shown and p_item like 'mai\_%' then update family_decor set shown = false where family_id = p_family and item like 'mai\_%'; end if;
  update family_decor set shown = p_shown where family_id = p_family and item = p_item;
end $$;

-- Cây Đa trĩu quả: mỗi nhà được 15 xu, mỗi tháng một lần
create or replace function public.claim_tree(p_xom uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_now date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_month date := date_trunc('month', v_now)::date; n int;
begin
  if not is_xom_member(p_xom) then raise exception 'Không có quyền'; end if;
  if (select count(*) from xu_events where xom_id = p_xom and kind in ('checkin', 'altar') and day >= v_month) < tree_goal(p_xom) then
    raise exception 'Cây đa chưa đủ nước'; end if;
  insert into xu_events(xom_id, family_id, member_id, kind, ref, amount)
    select p_xom, id, null, 'tree', to_char(v_month, 'YYYY-MM'), 15 from families where xom_id = p_xom
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.xom_xu(uuid) from public, anon;
revoke all on function public.buy_decor(uuid, text) from public, anon;
revoke all on function public.set_decor(uuid, text, boolean) from public, anon;
revoke all on function public.claim_tree(uuid) from public, anon;
revoke all on function public.tree_goal(uuid) from public, anon;
grant execute on function public.xom_xu(uuid) to authenticated;
grant execute on function public.buy_decor(uuid, text) to authenticated;
grant execute on function public.set_decor(uuid, text, boolean) to authenticated;
grant execute on function public.claim_tree(uuid) to authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['xu_events', 'family_decor'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
