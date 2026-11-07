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
