// Gửi thông báo đẩy cho các thành viên khác trong xóm.
// Người gọi phải đăng nhập (gửi kèm access token); chỉ gửi được trong xóm của chính mình.
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { vapidKeys } from '../lib/vapid'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvmhcoctikmnnbcfgtyl.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Cf8wufbB9Psm7KZChj6Xhw_ekYZt2dE'

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return new Response('Unauthorized', { status: 401 })
  let body: { xom_id?: string; title?: string; body?: string; url?: string; tag?: string }
  try { body = await req.json() } catch { return new Response('Bad request', { status: 400 }) }
  const xom = String(body.xom_id || '')
  if (!/^[0-9a-f-]{36}$/.test(xom)) return new Response('Bad request', { status: 400 })

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false } })
  const { data: u, error: ue } = await sb.auth.getUser(token)
  if (ue || !u.user) return new Response('Unauthorized', { status: 401 })
  const { data: me } = await sb.from('members').select('id').eq('xom_id', xom).eq('user_id', u.user.id).maybeSingle()
  if (!me) return new Response('Forbidden', { status: 403 })

  const { data: subs } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth,user_id').eq('xom_id', xom).neq('user_id', u.user.id)
  const vk = await vapidKeys()
  webpush.setVapidDetails('https://xom-minh.netlify.app', vk.publicKey, vk.privateKey)
  const payload = JSON.stringify({
    title: String(body.title || 'Xóm Mình').slice(0, 80),
    body: String(body.body || '').slice(0, 200),
    url: String(body.url || '/').startsWith('/') ? String(body.url || '/').slice(0, 200) : '/',
    tag: String(body.tag || 'xom').slice(0, 40),
  })
  const dead: string[] = []
  let sent = 0
  await Promise.all((subs || []).map(async s => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 }); sent++ }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) dead.push(s.endpoint) }
  }))
  if (dead.length) await sb.rpc('prune_push', { p_endpoints: dead })
  return Response.json({ sent })
}

export const config = { path: '/api/notify' }
