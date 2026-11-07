-- =====================================================================
-- Xóm Mình · 0002: link mời riêng từng người, người mời điền thêm thông tin,
-- trưởng xóm sửa hồ sơ nhà khác và gỡ tên nhận nhầm.
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

-- Link mời gắn với đúng một người lớn (null = link chung cả nhà, kiểu cũ)
alter table public.invites add column if not exists member_id uuid references public.members(id) on delete cascade;
create index if not exists invites_member_idx on public.invites(member_id);

-- Trưởng xóm được thêm bé cho nhà khác (vd. nhà chưa vào xóm)
drop policy if exists members_insert_kid on public.members;
create policy members_insert_kid on public.members for insert to authenticated
  with check (role = 'kid' and user_id is null and not is_admin
              and (public.is_my_family(family_id) or public.is_xom_admin(xom_id))
              and xom_id = (select f.xom_id from public.families f where f.id = family_id));

-- Tạo link riêng cho một người lớn chưa vào xóm (thu hồi link cũ của người đó)
create or replace function public.make_member_invite(p_member uuid)
returns text language plpgsql security definer set search_path = public as $$
declare m members; v_code text;
begin
  select * into m from members where id = p_member;
  if m.id is null or m.role <> 'adult' then raise exception 'Không tìm thấy người này'; end if;
  if not (is_xom_admin(m.xom_id) or is_my_family(m.family_id)) then raise exception 'Không có quyền'; end if;
  if m.user_id is not null then raise exception '% đã vào xóm rồi', m.name; end if;
  update invites set revoked = true where member_id = m.id and not revoked;
  v_code := new_code();
  insert into invites(xom_id, family_id, member_id, code, created_by, max_uses)
    values (m.xom_id, m.family_id, m.id, v_code, auth.uid(), 1);
  return v_code;
end $$;

-- Trưởng xóm mời một gia đình: tạo hồ sơ + link riêng cho từng người lớn
-- p_kids: [{"name":"Su","dob":"2019-11-12"}, ...]
create or replace function public.invite_family2(p_xom uuid, p_adults text[], p_kids jsonb default '[]', p_wedding date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_fam uuid; a text; k jsonb; v_id uuid; out jsonb := '[]'::jsonb;
begin
  if not is_xom_admin(p_xom) then raise exception 'Chỉ trưởng xóm mới mời được gia đình mới'; end if;
  if coalesce(array_length(p_adults, 1), 0) = 0 then raise exception 'Cần ít nhất một tên người lớn'; end if;
  perform set_config('xom.trusted', 'on', true);
  insert into families(xom_id, wedding) values (p_xom, p_wedding) returning id into v_fam;
  foreach a in array p_adults loop
    if trim(a) <> '' then
      insert into members(xom_id, family_id, role, name) values (p_xom, v_fam, 'adult', trim(a)) returning id into v_id;
      out := out || jsonb_build_object('member_id', v_id, 'name', trim(a), 'code', make_member_invite(v_id));
    end if;
  end loop;
  for k in select * from jsonb_array_elements(coalesce(p_kids, '[]'::jsonb)) loop
    if coalesce(trim(k->>'name'), '') <> '' then
      insert into members(xom_id, family_id, role, name, dob)
        values (p_xom, v_fam, 'kid', trim(k->>'name'), nullif(k->>'dob', '')::date);
    end if;
  end loop;
  return out;
end $$;

-- Trưởng xóm gỡ tài khoản khỏi một tên (khi nhận nhầm); tên trở lại trạng thái chờ
create or replace function public.unclaim_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where id = p_member;
  if m.id is null or m.role <> 'adult' then raise exception 'Không tìm thấy người này'; end if;
  if not is_xom_admin(m.xom_id) then raise exception 'Chỉ trưởng xóm mới gỡ được'; end if;
  if m.user_id = auth.uid() then raise exception 'Không tự gỡ chính mình được'; end if;
  if m.user_id is null then return; end if;
  perform set_config('xom.trusted', 'on', true);
  update members set user_id = null, joined_at = null where id = m.id;
  update invites set revoked = true where member_id = m.id and not revoked;
end $$;

-- Tạo xóm: link mời cho vợ/chồng nay là link riêng
create or replace function public.create_xom(p_xom_name text, p_my_name text, p_spouse_name text default null, p_kids text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_xom uuid; v_fam uuid; v_sp uuid; k text;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  perform set_config('xom.trusted', 'on', true);
  insert into xoms(name, created_by) values (trim(p_xom_name), auth.uid()) returning id into v_xom;
  insert into families(xom_id) values (v_xom) returning id into v_fam;
  insert into members(xom_id, family_id, user_id, role, name, is_admin, joined_at)
    values (v_xom, v_fam, auth.uid(), 'adult', trim(p_my_name), true, now());
  if coalesce(trim(p_spouse_name), '') <> '' then
    insert into members(xom_id, family_id, role, name, is_admin) values (v_xom, v_fam, 'adult', trim(p_spouse_name), true) returning id into v_sp;
    insert into invites(xom_id, family_id, member_id, code, created_by, max_uses) values (v_xom, v_fam, v_sp, new_code(), auth.uid(), 1);
  end if;
  foreach k in array coalesce(p_kids, '{}') loop
    if trim(k) <> '' then insert into members(xom_id, family_id, role, name) values (v_xom, v_fam, 'kid', trim(k)); end if;
  end loop;
  return v_xom;
end $$;

-- Xem link mời: nếu là link riêng thì trả về luôn người được mời
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
    'member', (select jsonb_build_object('id', m.id, 'name', m.name, 'claimed', m.user_id is not null) from members m where m.id = i.member_id),
    'adults', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'claimed', m.user_id is not null) order by m.created_at)
                        from members m where m.family_id = i.family_id and m.role = 'adult'), '[]'::jsonb),
    'kids', coalesce((select jsonb_agg(m.name order by m.created_at) from members m where m.family_id = i.family_id and m.role = 'kid'), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Nhận tên: link riêng thì chỉ nhận đúng người đó
create or replace function public.claim_invite(p_code text, p_member uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare i invites; m members;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  select * into i from invites where code = upper(trim(p_code)) for update;
  if i.id is null or i.revoked or i.expires_at < now() or i.uses >= i.max_uses then raise exception 'Link mời không còn dùng được'; end if;
  if i.member_id is not null and p_member is distinct from i.member_id then raise exception 'Link này dành cho người khác'; end if;
  select * into m from members where id = p_member for update;
  if m.id is null or m.family_id <> i.family_id or m.role <> 'adult' then raise exception 'Tên này không thuộc link mời'; end if;
  if m.user_id is not null then raise exception 'Tên này đã có người nhận'; end if;
  if exists (select 1 from members where xom_id = i.xom_id and user_id = auth.uid()) then raise exception 'Tài khoản này đã ở trong xóm rồi'; end if;
  perform set_config('xom.trusted', 'on', true);
  update members set user_id = auth.uid(), joined_at = now() where id = m.id;
  update invites set uses = uses + 1 where id = i.id;
  return i.xom_id;
end $$;

revoke all on function public.make_member_invite(uuid) from public, anon;
revoke all on function public.invite_family2(uuid, text[], jsonb, date) from public, anon;
revoke all on function public.unclaim_member(uuid) from public, anon;
grant execute on function public.make_member_invite(uuid) to authenticated;
grant execute on function public.invite_family2(uuid, text[], jsonb, date) to authenticated;
grant execute on function public.unclaim_member(uuid) to authenticated;
