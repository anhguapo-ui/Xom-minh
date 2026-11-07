-- =====================================================================
-- Xóm Mình · 0006: album ảnh, góc tương trợ, bộ đếm lượt dùng AI
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- =====================================================================

-- ---------- Album ảnh ----------
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  event_type  text not null default 'free' check (event_type in ('keo','host','free')),
  event_id    uuid,
  path        text not null unique check (char_length(path) < 200),
  caption     text check (caption is null or char_length(caption) <= 200),
  taken_day   date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists photos_xom_idx on public.photos(xom_id, created_at desc);
create index if not exists photos_event_idx on public.photos(event_id);

create table if not exists public.photo_likes (
  photo_id   uuid not null references public.photos(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  xom_id     uuid not null references public.xoms(id) on delete cascade,
  primary key (photo_id, member_id)
);

alter table public.photos      enable row level security;
alter table public.photo_likes enable row level security;
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated
  with check (public.is_me(member_id) and xom_id = (select xom_id from public.members where id = member_id) and path like xom_id::text || '/%');
drop policy if exists photos_update on public.photos;
create policy photos_update on public.photos for update to authenticated using (public.is_me(member_id)) with check (public.is_me(member_id));
drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos for delete to authenticated using (public.is_me(member_id) or public.is_xom_admin(xom_id));
drop policy if exists likes_select on public.photo_likes;
create policy likes_select on public.photo_likes for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists likes_write on public.photo_likes;
create policy likes_write on public.photo_likes for all to authenticated
  using (public.is_me(member_id))
  with check (public.is_me(member_id) and xom_id = (select p.xom_id from public.photos p where p.id = photo_id));

-- Lấy mã xóm từ đường dẫn ảnh "<xom_id>/<tên file>", đường dẫn lạ thì trả null
create or replace function public.xom_from_path(p text) returns uuid language plpgsql immutable as $$
begin
  return split_part(p, '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- Kho ảnh riêng tư trên Supabase Storage: chỉ người trong xóm xem được
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('album', 'album', false, 3145728, array['image/jpeg','image/webp'])
      on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/webp'];
    execute 'drop policy if exists album_read on storage.objects';
    execute $p$create policy album_read on storage.objects for select to authenticated
      using (bucket_id = 'album' and public.is_xom_member(public.xom_from_path(name)))$p$;
    execute 'drop policy if exists album_upload on storage.objects';
    execute $p$create policy album_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'album' and public.is_xom_member(public.xom_from_path(name)))$p$;
    execute 'drop policy if exists album_delete on storage.objects';
    execute $p$create policy album_delete on storage.objects for delete to authenticated
      using (bucket_id = 'album' and (owner = auth.uid() or public.is_xom_admin(public.xom_from_path(name))))$p$;
  end if;
end $$;

-- ---------- Góc tương trợ ----------
create table if not exists public.help_posts (
  id          uuid primary key default gen_random_uuid(),
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  kind        text not null check (kind in ('lend','ask','contact')),
  title       text not null check (char_length(title) between 1 and 80),
  body        text check (body is null or char_length(body) <= 400),
  phone       text check (phone is null or char_length(phone) <= 20),
  status      text not null default 'open' check (status in ('open','busy','done')),
  created_at  timestamptz not null default now()
);
create index if not exists help_xom_idx on public.help_posts(xom_id, created_at desc);

create table if not exists public.help_responses (
  post_id     uuid not null references public.help_posts(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  xom_id      uuid not null references public.xoms(id) on delete cascade,
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  primary key (post_id, member_id)
);

alter table public.help_posts     enable row level security;
alter table public.help_responses enable row level security;
drop policy if exists help_select on public.help_posts;
create policy help_select on public.help_posts for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists help_insert on public.help_posts;
create policy help_insert on public.help_posts for insert to authenticated
  with check (public.is_me(member_id) and xom_id = (select xom_id from public.members where id = member_id));
drop policy if exists help_update on public.help_posts;
create policy help_update on public.help_posts for update to authenticated
  using (public.is_me(member_id) or public.is_xom_admin(xom_id)) with check (public.is_me(member_id) or public.is_xom_admin(xom_id));
drop policy if exists help_delete on public.help_posts;
create policy help_delete on public.help_posts for delete to authenticated using (public.is_me(member_id) or public.is_xom_admin(xom_id));
drop policy if exists help_resp_select on public.help_responses;
create policy help_resp_select on public.help_responses for select to authenticated using (public.is_xom_member(xom_id));
drop policy if exists help_resp_write on public.help_responses;
create policy help_resp_write on public.help_responses for all to authenticated
  using (public.is_me(member_id))
  with check (public.is_me(member_id) and xom_id = (select h.xom_id from public.help_posts h where h.id = post_id));

-- ---------- Bộ đếm lượt dùng AI ----------
create table if not exists public.ai_usage (
  member_id  uuid not null references public.members(id) on delete cascade,
  kind       text not null check (kind in ('thay','draw','pick')),
  period     text not null,
  n          int not null default 0,
  primary key (member_id, kind, period)
);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated using (public.is_me(member_id));

-- Lấy một lượt: Thầy Lộc 100 câu/ngày, vẽ chibi 20 lần/tháng, AI chọn kiểu 50 lần/tháng (giờ Việt Nam)
create or replace function public.ai_take(p_xom uuid, p_kind text)
returns int language plpgsql security definer set search_path = public as $$
declare v_member uuid; v_period text; v_limit int; v_n int; vn timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
begin
  select id into v_member from members where xom_id = p_xom and user_id = auth.uid();
  if v_member is null then raise exception 'Không có quyền'; end if;
  if p_kind = 'thay' then v_period := to_char(vn, 'YYYY-MM-DD'); v_limit := 100;
  elsif p_kind = 'draw' then v_period := to_char(vn, 'YYYY-MM'); v_limit := 20;
  elsif p_kind = 'pick' then v_period := to_char(vn, 'YYYY-MM'); v_limit := 50;
  else raise exception 'Loại không hợp lệ'; end if;
  insert into ai_usage(member_id, kind, period, n) values (v_member, p_kind, v_period, 1)
    on conflict (member_id, kind, period) do update set n = ai_usage.n + 1
    where ai_usage.n < v_limit
    returning n into v_n;
  if v_n is null then raise exception 'Hết lượt'; end if;
  return v_limit - v_n;
end $$;
revoke all on function public.ai_take(uuid, text) from public, anon;
grant execute on function public.ai_take(uuid, text) to authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['photos','photo_likes','help_posts','help_responses'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
