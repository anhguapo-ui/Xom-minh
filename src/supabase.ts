import { createClient } from '@supabase/supabase-js'

// Địa chỉ và khoá CÔNG KHAI (publishable) của Supabase: được phép nằm trong code app.
// Quyền truy cập dữ liệu do các quy tắc RLS trong supabase/migrations quyết định.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mvmhcoctikmnnbcfgtyl.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Cf8wufbB9Psm7KZChj6Xhw_ekYZt2dE'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export type Role = 'adult' | 'kid'
export type Xom = { id: string; name: string }
export type Family = { id: string; xom_id: string; wedding: string | null; created_at: string }
export type Member = {
  id: string; xom_id: string; family_id: string; user_id: string | null; role: Role; name: string
  dob: string | null; phone: string | null; phone_public: boolean; look: unknown
  is_admin: boolean; joined_at: string | null; created_at: string
}
export type XomData = { xom: Xom; families: Family[]; members: Member[] }

export async function loadXom(xomId: string): Promise<XomData> {
  const [x, f, m] = await Promise.all([
    sb.from('xoms').select('id,name').eq('id', xomId).single(),
    sb.from('families').select('*').eq('xom_id', xomId).order('created_at'),
    sb.from('members').select('*').eq('xom_id', xomId).order('created_at'),
  ])
  if (x.error) throw x.error
  if (f.error) throw f.error
  if (m.error) throw m.error
  return { xom: x.data as Xom, families: f.data as Family[], members: m.data as Member[] }
}

export async function myXomIds(userId: string): Promise<string[]> {
  const { data, error } = await sb.from('members').select('xom_id').eq('user_id', userId)
  if (error) throw error
  return (data || []).map(r => r.xom_id as string)
}

// Lỗi từ máy chủ → câu tiếng Việt dễ hiểu
export function errText(e: unknown): string {
  const m = (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)) || ''
  if (/fetch|network/i.test(m)) return 'Mất kết nối mạng, thử lại sau nhé.'
  if (/JWT|session/i.test(m)) return 'Phiên đăng nhập hết hạn, đăng nhập lại nhé.'
  return m.length < 120 ? m : 'Có lỗi xảy ra, thử lại sau nhé.'
}
