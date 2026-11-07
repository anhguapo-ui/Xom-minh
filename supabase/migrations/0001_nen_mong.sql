-- =====================================================================
-- Xóm Mình · Giai đoạn 1: Nền móng
-- Xóm → Gia đình → Thành viên (người lớn có tài khoản, các bé chỉ có hồ sơ)
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Bảng ----------
create table if not exists public.xoms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  wedding     date,
  created_at  timestamptz not null default now()
);
create index if not exists families_xom_idx on public.families(xom_id);

create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  xom_id        uuid not null references public.xoms(id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  role          text not null check (role in ('adult','kid')),
  name          text not null check (char_length(name) between 1 and 40),
  dob           date,
  phone         text check (phone is null or char_length(phone) <= 20),
  phone_public  boolean not null default false,
  look          jsonb not null default '{}'::jsonb,
  is_admin      boolean not null default false,
  joined_at     timestamptz,
  created_at    timestamptz not null default now(),
  constraint kid_has_no_account check (role = 'adult' or user_id is null),
  constraint look_size check (pg_column_size(look) < 120000)
);
create index if not exists members_xom_idx on public.members(xom_id);
create index if not exists members_family_idx on public.members(family_id);
create unique index if not exists members_one_per_xom on public.members(xom_id, user_id) where user_id is not null;

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  family_id   uuid not null references public.families(id) on delete cascade,
  code        text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null default now() + interval '7 days',
  max_uses    int not null default 2,
  uses        int not null default 0,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists invites_family_idx on public.invites(family_id);

-- ---------- Hàm kiểm tra quyền (security definer để tránh vòng lặp RLS) ----------
create or replace function public.is_xom_member(p_xom uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where xom_id = p_xom and user_id = auth.uid());
$$;

create or replace function public.is_xom_admin(p_xom uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where xom_id = p_xom and user_id = auth.uid() and is_admin);
$$;

create or replace function public.is_my_family(p_family uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where family_id = p_family and user_id = auth.uid());
$$;

-- ---------- Bật RLS: mặc định không ai đọc/ghi được gì ----------
alter table public.xoms     enable row level security;
alter table public.families enable row level security;
alter table public.members  enable row level security;
alter table public.invites  enable row level security;

drop policy if exists xoms_select on public.xoms;
create policy xoms_select on public.xoms for select to authenticated using (public.is_xom_member(id));
drop policy if exists xoms_update on public.xoms;
create policy xoms_update on public.xoms for update to authenticated using (public.is_xom_admin(id)) with check (public.is_xom_admin(id));

drop policy if exists families_select on public.families;
create policy families_select on public.families for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists families_update on public.families;
create policy families_update on public.families for update to authenticated
  using (public.is_my_family(id) or public.is_xom_admin(xom_id))
  with check (public.is_my_family(id) or public.is_xom_admin(xom_id));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using (public.is_my_family(family_id) or public.is_xom_admin(xom_id))
  with check (public.is_my_family(family_id) or public.is_xom_admin(xom_id));
drop policy if exists members_insert_kid on public.members;
create policy members_insert_kid on public.members for insert to authenticated
  with check (role = 'kid' and user_id is null and not is_admin and public.is_my_family(family_id)
              and xom_id = (select f.xom_id from public.families f where f.id = family_id));
drop policy if exists members_delete_kid on public.members;
create policy members_delete_kid on public.members for delete to authenticated
  using (role = 'kid' and (public.is_my_family(family_id) or public.is_xom_admin(xom_id)));

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (public.is_xom_admin(xom_id) or public.is_my_family(family_id));

-- Người dùng không được tự đổi các cột nhạy cảm (tài khoản gắn, quyền trưởng xóm, xóm, gia đình)
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('xom.trusted', true) = 'on' then return new; end if;
  if new.user_id is distinct from old.user_id or new.is_admin is distinct from old.is_admin
     or new.xom_id is distinct from old.xom_id or new.family_id is distinct from old.family_id
     or new.role is distinct from old.role or new.joined_at is distinct from old.joined_at then
    raise exception 'Không được đổi các thông tin này';
  end if;
  return new;
end $$;
drop trigger if exists members_guard on public.members;
create trigger members_guard before update on public.members for each row execute function public.members_guard();

-- ---------- Hàm nghiệp vụ ----------
create or replace function public.new_code() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random()*32)::int, 1), '')
  from generate_series(1, 8);
$$;

-- Tạo xóm mới: người tạo thành trưởng xóm, kèm gia đình của mình
create or replace function public.create_xom(p_xom_name text, p_my_name text, p_spouse_name text default null, p_kids text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_xom uuid; v_fam uuid; k text;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  perform set_config('xom.trusted', 'on', true);
  insert into xoms(name, created_by) values (trim(p_xom_name), auth.uid()) returning id into v_xom;
  insert into families(xom_id) values (v_xom) returning id into v_fam;
  insert into members(xom_id, family_id, user_id, role, name, is_admin, joined_at)
    values (v_xom, v_fam, auth.uid(), 'adult', trim(p_my_name), true, now());
  if coalesce(trim(p_spouse_name), '') <> '' then
    insert into members(xom_id, family_id, role, name, is_admin) values (v_xom, v_fam, 'adult', trim(p_spouse_name), true);
    insert into invites(xom_id, family_id, code, created_by, max_uses) values (v_xom, v_fam, new_code(), auth.uid(), 1);
  end if;
  foreach k in array coalesce(p_kids, '{}') loop
    if trim(k) <> '' then insert into members(xom_id, family_id, role, name) values (v_xom, v_fam, 'kid', trim(k)); end if;
  end loop;
  return v_xom;
end $$;

-- Trưởng xóm mời một gia đình mới: tạo khung gia đình + link mời
create or replace function public.invite_family(p_xom uuid, p_adults text[], p_kids text[] default '{}')
returns text language plpgsql security definer set search_path = public as $$
declare v_fam uuid; v_code text; a text; k text;
begin
  if not is_xom_admin(p_xom) then raise exception 'Chỉ trưởng xóm mới mời được gia đình mới'; end if;
  perform set_config('xom.trusted', 'on', true);
  insert into families(xom_id) values (p_xom) returning id into v_fam;
  foreach a in array p_adults loop
    if trim(a) <> '' then insert into members(xom_id, family_id, role, name) values (p_xom, v_fam, 'adult', trim(a)); end if;
  end loop;
  foreach k in array coalesce(p_kids, '{}') loop
    if trim(k) <> '' then insert into members(xom_id, family_id, role, name) values (p_xom, v_fam, 'kid', trim(k)); end if;
  end loop;
  v_code := new_code();
  insert into invites(xom_id, family_id, code, created_by) values (p_xom, v_fam, v_code, auth.uid());
  return v_code;
end $$;

-- Tạo lại link mời cho một gia đình (trưởng xóm, hoặc người trong nhà mời vợ/chồng)
create or replace function public.reissue_invite(p_family uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_xom uuid; v_code text;
begin
  select xom_id into v_xom from families where id = p_family;
  if v_xom is null or not (is_xom_admin(v_xom) or is_my_family(p_family)) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from members where family_id = p_family and role = 'adult' and user_id is null) then
    raise exception 'Nhà này mọi người đã vào xóm rồi';
  end if;
  update invites set revoked = true where family_id = p_family and not revoked;
  v_code := new_code();
  insert into invites(xom_id, family_id, code, created_by) values (v_xom, p_family, v_code, auth.uid());
  return v_code;
end $$;

-- Xem thông tin link mời (cả khi chưa đăng nhập): tên xóm, người mời, các tên người lớn
create or replace function public.get_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i invites; r jsonb;
begin
  select * into i from invites where code = upper(trim(p_code));
  if i.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if i.revoked then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if i.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if i.uses >= i.max_uses then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  select jsonb_build_object(
    'ok', true,
    'xom', (select name from xoms where id = i.xom_id),
    'inviter', (select name from members where xom_id = i.xom_id and user_id = i.created_by limit 1),
    'family_count', (select count(*) from families where xom_id = i.xom_id),
    'adults', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'claimed', m.user_id is not null) order by m.created_at)
                        from members m where m.family_id = i.family_id and m.role = 'adult'), '[]'::jsonb),
    'kids', coalesce((select jsonb_agg(m.name order by m.created_at) from members m where m.family_id = i.family_id and m.role = 'kid'), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Nhận tên trong link mời: gắn tài khoản đang đăng nhập vào người lớn đã chọn
create or replace function public.claim_invite(p_code text, p_member uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare i invites; m members;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  select * into i from invites where code = upper(trim(p_code)) for update;
  if i.id is null or i.revoked or i.expires_at < now() or i.uses >= i.max_uses then raise exception 'Link mời không còn dùng được'; end if;
  select * into m from members where id = p_member for update;
  if m.id is null or m.family_id <> i.family_id or m.role <> 'adult' then raise exception 'Tên này không thuộc link mời'; end if;
  if m.user_id is not null then raise exception 'Tên này đã có người nhận'; end if;
  if exists (select 1 from members where xom_id = i.xom_id and user_id = auth.uid()) then raise exception 'Tài khoản này đã ở trong xóm rồi'; end if;
  perform set_config('xom.trusted', 'on', true);
  update members set user_id = auth.uid(), joined_at = now() where id = m.id;
  update invites set uses = uses + 1 where id = i.id;
  return i.xom_id;
end $$;

-- ---------- Quyền gọi hàm ----------
revoke all on function public.create_xom(text, text, text, text[]) from public, anon;
revoke all on function public.invite_family(uuid, text[], text[]) from public, anon;
revoke all on function public.reissue_invite(uuid) from public, anon;
revoke all on function public.claim_invite(text, uuid) from public, anon;
revoke all on function public.new_code() from public, anon, authenticated;
grant execute on function public.create_xom(text, text, text, text[]) to authenticated;
grant execute on function public.invite_family(uuid, text[], text[]) to authenticated;
grant execute on function public.reissue_invite(uuid) to authenticated;
grant execute on function public.claim_invite(text, uuid) to authenticated;
grant execute on function public.get_invite(text) to anon, authenticated;
