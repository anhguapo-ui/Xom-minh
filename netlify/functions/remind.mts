// Nhắc hằng ngày lúc 19:00 giờ Việt Nam: mai là mùng 1/rằm, mai có sinh nhật/kỷ niệm cưới.
// Cần biến môi trường SUPABASE_SERVICE_ROLE_KEY trên Netlify (anh tự dán trong Netlify, không gửi qua chat).
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { vapidKeys } from '../lib/vapid'
import { toLunar } from '../../src/lunar'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvmhcoctikmnnbcfgtyl.supabase.co'

export default async () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) { console.log('remind: chưa có SUPABASE_SERVICE_ROLE_KEY, bỏ qua'); return }
  const vk = await vapidKeys()
  webpush.setVapidDetails('https://xom-minh.netlify.app', vk.publicKey, vk.privateKey)
  const sb = createClient(SUPABASE_URL, key, { auth: { persistSession: false } })

  // "Ngày mai" theo giờ Việt Nam
  const vn = new Date(Date.now() + 7 * 3600e3), tmr = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1))
  const tl = toLunar(new Date(tmr.getUTCFullYear(), tmr.getUTCMonth(), tmr.getUTCDate(), 12))
  const md = (iso: string | null) => iso ? iso.slice(5) : ''
  const tmd = String(tmr.getUTCMonth() + 1).padStart(2, '0') + '-' + String(tmr.getUTCDate()).padStart(2, '0')

  const { data: xoms } = await sb.from('xoms').select('id')
  for (const x of xoms || []) {
    const msgs: { title: string; body: string; tag: string }[] = []
    if (tl.d === 1 || tl.d === 15) msgs.push({ title: '🪔 Mai là ' + (tl.d === 1 ? 'mùng 1' : 'ngày rằm'), body: 'Nhớ ghé Miếu Thần Tài của xóm thắp hương nhé!', tag: 'le' })
    if (tl.d === 10 && tl.m === 1) msgs.push({ title: '🪔 Mai là ngày vía Thần Tài', body: 'Cả xóm cùng thắp hương cầu tài lộc nhé!', tag: 'le' })
    const { data: mem } = await sb.from('members').select('name,role,dob,family_id').eq('xom_id', x.id)
    for (const m of mem || []) if (md(m.dob) === tmd) msgs.push({ title: '🎂 Mai là sinh nhật ' + (m.role === 'kid' ? 'bé ' : '') + m.name, body: 'Vào Xóm Mình gửi lời chúc nhé!', tag: 'bd-' + m.name })
    const { data: fams } = await sb.from('families').select('id,wedding').eq('xom_id', x.id)
    for (const f of fams || []) if (md(f.wedding) === tmd) {
      const names = (mem || []).filter(m => m.family_id === f.id && m.role === 'adult').map(m => m.name).join(' & ')
      msgs.push({ title: '💍 Mai là kỷ niệm ngày cưới nhà ' + names, body: 'Vào Xóm Mình gửi lời chúc nhé!', tag: 'wd-' + f.id })
    }
    if (!msgs.length) continue
    const { data: subs } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth').eq('xom_id', x.id)
    const dead: string[] = []
    for (const m of msgs) await Promise.all((subs || []).map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...m, url: '/' }), { TTL: 6 * 3600 })
        .catch(e => { if ([404, 410].includes(e.statusCode)) dead.push(s.endpoint) })))
    if (dead.length) await sb.from('push_subscriptions').delete().in('endpoint', dead)
  }
}

export const config = { schedule: '0 12 * * *' }
