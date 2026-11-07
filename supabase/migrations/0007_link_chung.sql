-- =====================================================================
-- Xóm Mình · 0007: link mời chung cho nhóm Zalo, có trưởng xóm duyệt
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

alter table public.xoms add column if not exists group_code text unique;
alter table public.xoms add column if not exists group_expires timestamptz;

create table if not exists public.join_requests (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email       text,
  kind        text not null check (kind in ('claim','new')),
  member_id   uuid references public.members(id) on delete cascade,
  adults      text[] not null default '{}',
  kids        text[] not null default '{}',
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index if not exists join_one_pending on public.join_requests(xom_id, user_id) where status = 'pending';
alter table public.join_requests enable row level security;
drop policy if exists join_select on public.join_requests;
create policy join_select on public.join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_xom_admin(xom_id));

-- Trưởng xóm tạo link chung mới (link cũ hết hiệu lực), hạn 30 ngày
create or replace function public.make_group_link(p_xom uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not is_xom_admin(p_xom) then raise exception 'Chỉ trưởng xóm mới tạo được link chung'; end if;
  v := new_code() || new_code();
  update xoms set group_code = v, group_expires = now() + interval '30 days' where id = p_xom;
  return v;
end $$;

create or replace function public.stop_group_link(p_xom uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_xom_admin(p_xom) then raise exception 'Không có quyền'; end if;
  update xoms set group_code = null, group_expires = null where id = p_xom;
end $$;

-- Xem link chung: tên xóm và các tên người lớn đang chờ nhận (gom theo nhà)
create or replace function public.get_group_link(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare x xoms; r jsonb;
begin
  select * into x from xoms where group_code = upper(trim(p_code));
  if x.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if x.group_expires < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select jsonb_build_object(
    'ok', true, 'xom_id', x.id, 'xom', x.name,
    'family_count', (select count(*) from families where xom_id = x.id),
    'member', auth.uid() is not null and exists (select 1 from members where xom_id = x.id and user_id = auth.uid()),
    'request', (select jsonb_build_object('status', status, 'kind', kind) from join_requests where xom_id = x.id and user_id = auth.uid() order by created_at desc limit 1),
    'families', coalesce((select jsonb_agg(jsonb_build_object(
        'label', (select string_agg(m2.name, ' & ' order by m2.created_at) from members m2 where m2.family_id = f.id and m2.role = 'adult'),
        'open', (select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.created_at) from members m where m.family_id = f.id and m.role = 'adult' and m.user_id is null)
      ) order by f.created_at) from families f where f.xom_id = x.id
        and exists (select 1 from members m where m.family_id = f.id and m.role = 'adult' and m.user_id is null)), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Gửi yêu cầu vào xóm: nhận một tên có sẵn, hoặc khai nhà mới
create or replace function public.request_join(p_code text, p_member uuid default null, p_adults text[] default '{}', p_kids text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare x xoms; m members; a text[];
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  select * into x from xoms where group_code = upper(trim(p_code));
  if x.id is null or x.group_expires < now() then raise exception 'Link mời chung không còn dùng được'; end if;
  if exists (select 1 from members where xom_id = x.id and user_id = auth.uid()) then raise exception 'Bạn đã ở trong xóm rồi'; end if;
  delete from join_requests where xom_id = x.id and user_id = auth.uid() and status = 'pending';
  if p_member is not null then
    select * into m from members where id = p_member;
    if m.id is null or m.xom_id <> x.id or m.role <> 'adult' or m.user_id is not null then raise exception 'Tên này không còn chờ nhận'; end if;
    insert into join_requests(xom_id, user_id, email, kind, member_id) values (x.id, auth.uid(), auth.jwt() ->> 'email', 'claim', m.id);
  else
    a := array(select trim(v) from unnest(p_adults) v where trim(v) <> '' limit 2);
    if coalesce(array_length(a, 1), 0) = 0 then raise exception 'Cần ít nhất tên của bạn'; end if;
    insert into join_requests(xom_id, user_id, email, kind, adults, kids)
      values (x.id, auth.uid(), auth.jwt() ->> 'email', 'new', a, array(select left(trim(v), 40) from unnest(p_kids) v where trim(v) <> '' limit 8));
  end if;
end $$;

-- Trưởng xóm duyệt hoặc từ chối
create or replace function public.decide_join(p_req uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare q join_requests; v_fam uuid; i int; k text;
begin
  select * into q from join_requests where id = p_req for update;
  if q.id is null or not is_xom_admin(q.xom_id) then raise exception 'Không có quyền'; end if;
  if q.status <> 'pending' then raise exception 'Yêu cầu này đã được xử lý'; end if;
  if p_approve then
    if exists (select 1 from members where xom_id = q.xom_id and user_id = q.user_id) then raise exception 'Người này đã ở trong xóm rồi'; end if;
    perform set_config('xom.trusted', 'on', true);
    if q.kind = 'claim' then
      update members set user_id = q.user_id, joined_at = now() where id = q.member_id and user_id is null;
      if not found then raise exception 'Tên này đã có người nhận'; end if;
      update invites set revoked = true where member_id = q.member_id and not revoked;
    else
      insert into families(xom_id) values (q.xom_id) returning id into v_fam;
      for i in 1 .. array_length(q.adults, 1) loop
        insert into members(xom_id, family_id, role, name, user_id, joined_at)
          values (q.xom_id, v_fam, 'adult', left(q.adults[i], 40), case when i = 1 then q.user_id end, case when i = 1 then now() end);
      end loop;
      foreach k in array q.kids loop insert into members(xom_id, family_id, role, name) values (q.xom_id, v_fam, 'kid', k); end loop;
    end if;
  end if;
  update join_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now() where id = q.id;
end $$;

-- Máy của trưởng xóm để báo "có người xin vào" (chỉ người đang chờ duyệt mới gọi được)
create or replace function public.join_push_targets(p_xom uuid)
returns table(endpoint text, p256dh text, auth text) language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth from push_subscriptions s join members m on m.id = s.member_id
  where s.xom_id = p_xom and m.is_admin
    and exists (select 1 from join_requests r where r.xom_id = p_xom and r.user_id = auth.uid() and r.status = 'pending');
$$;

revoke all on function public.make_group_link(uuid) from public, anon;
revoke all on function public.stop_group_link(uuid) from public, anon;
revoke all on function public.request_join(text, uuid, text[], text[]) from public, anon;
revoke all on function public.decide_join(uuid, boolean) from public, anon;
revoke all on function public.join_push_targets(uuid) from public, anon;
grant execute on function public.make_group_link(uuid) to authenticated;
grant execute on function public.stop_group_link(uuid) to authenticated;
grant execute on function public.request_join(text, uuid, text[], text[]) to authenticated;
grant execute on function public.decide_join(uuid, boolean) to authenticated;
grant execute on function public.join_push_targets(uuid) to authenticated;
grant execute on function public.get_group_link(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'join_requests') then
    alter publication supabase_realtime add table public.join_requests;
  end if;
end $$;
