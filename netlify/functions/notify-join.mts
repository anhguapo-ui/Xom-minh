// Báo cho trưởng xóm "có người xin vào xóm" (người gọi phải đang có yêu cầu chờ duyệt)
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { vapidKeys } from '../lib/vapid'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvmhcoctikmnnbcfgtyl.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Cf8wufbB9Psm7KZChj6Xhw_ekYZt2dE'

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { xom_id, name } = await req.json().catch(() => ({})) as { xom_id?: string; name?: string }
  if (!token || !/^[0-9a-f-]{36}$/.test(String(xom_id))) return new Response('Bad request', { status: 400 })
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false } })
  const { data: subs } = await sb.rpc('join_push_targets', { p_xom: xom_id })
  if (!subs?.length) return Response.json({ sent: 0 })
  const vk = await vapidKeys()
  webpush.setVapidDetails('https://xom-minh.netlify.app', vk.publicKey, vk.privateKey)
  const payload = JSON.stringify({ title: '🙋 Có người xin vào xóm', body: String(name || 'Một người').slice(0, 60) + ' đang chờ trưởng xóm duyệt', url: '/', tag: 'join-req' })
  let sent = 0
  await Promise.all(subs.map((s: { endpoint: string; p256dh: string; auth: string }) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 }).then(() => { sent++ }).catch(() => {})))
  return Response.json({ sent })
}

export const config = { path: '/api/notify-join' }
