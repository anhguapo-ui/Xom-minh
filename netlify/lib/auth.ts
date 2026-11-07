// Xác thực người gọi bằng access token Supabase và kiểm tra là thành viên của xóm
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvmhcoctikmnnbcfgtyl.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Cf8wufbB9Psm7KZChj6Xhw_ekYZt2dE'

export type Caller = { sb: SupabaseClient; userId: string; member: { id: string; name: string; dob: string | null; role: string; family_id: string } }

export async function caller(req: Request, xom: string): Promise<Caller | Response> {
  if (!/^[0-9a-f-]{36}$/.test(xom)) return new Response('Bad request', { status: 400 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return new Response('Unauthorized', { status: 401 })
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false } })
  const { data: u, error } = await sb.auth.getUser(token)
  if (error || !u.user) return new Response('Unauthorized', { status: 401 })
  const { data: m } = await sb.from('members').select('id,name,dob,role,family_id').eq('xom_id', xom).eq('user_id', u.user.id).maybeSingle()
  if (!m) return new Response('Forbidden', { status: 403 })
  return { sb, userId: u.user.id, member: m }
}

// Trừ một lượt dùng AI; hết lượt thì trả lỗi 429
export async function takeQuota(c: Caller, xom: string, kind: 'thay' | 'draw' | 'pick'): Promise<number | Response> {
  const { data, error } = await c.sb.rpc('ai_take', { p_xom: xom, p_kind: kind })
  if (error) return Response.json({ error: /Hết lượt/.test(error.message) ? 'het_luot' : error.message }, { status: 429 })
  return data as number
}

export const openaiKey = () => process.env.OPENAI_API_KEY || ''
