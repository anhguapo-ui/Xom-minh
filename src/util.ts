import type { Family, Member, XomData } from './supabase'
import { readLook, hash, type Look } from './chibi'

export const DOW = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
export const dm = (d: Date) => d.getDate() + '/' + (d.getMonth() + 1)
export const lookOf = (m: Member): Look => readLook(m.look, m.id, m.role)
export const hueOf = (id: string) => hash(id) % 360
export const adultsOf = (d: XomData, f: Family) => d.members.filter(m => m.family_id === f.id && m.role === 'adult')
export const kidsOf = (d: XomData, f: Family) => d.members.filter(m => m.family_id === f.id && m.role === 'kid')
export const famShort = (d: XomData, f: Family) => adultsOf(d, f).map(m => m.name).join(' & ')

export function dayDiff(t: Date) {
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(t); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 864e5)
}
function nextOcc(iso: string | null) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  const t0 = new Date(); t0.setHours(0, 0, 0, 0)
  let c = new Date(t0.getFullYear(), m - 1, d)
  if (c < t0) c = new Date(t0.getFullYear() + 1, m - 1, d)
  return { date: c, years: c.getFullYear() - y }
}
export type Ev = { date: Date; label: string; kind: string; family: Family }
export function upcoming(d: XomData, days = 45): Ev[] {
  const out: Ev[] = []
  for (const f of d.families) {
    for (const m of d.members.filter(x => x.family_id === f.id)) {
      const o = nextOcc(m.dob); if (!o) continue
      const kid = m.role === 'kid'
      out.push({ date: o.date, family: f, kind: kid && o.years === 1 ? 'Thôi nôi' : 'Sinh nhật',
        label: kid ? (o.years === 1 ? 'Thôi nôi bé ' + m.name : 'Sinh nhật bé ' + m.name + ' · tròn ' + o.years + ' tuổi') : 'Sinh nhật ' + m.name })
    }
    const w = nextOcc(f.wedding)
    if (w && w.years > 0) out.push({ date: w.date, family: f, kind: 'Ngày cưới', label: 'Kỷ niệm ' + w.years + ' năm cưới' })
  }
  return out.filter(e => dayDiff(e.date) <= days).sort((a, b) => a.date.getTime() - b.date.getTime())
}

// Trình duyệt nhúng trong app chat (Zalo, Facebook…): Google chặn đăng nhập ở đây
export function inAppBrowser(): string | null {
  const ua = navigator.userAgent || ''
  if (/Zalo/i.test(ua)) return 'Zalo'
  if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) return 'Facebook'
  if (/Instagram/i.test(ua)) return 'Instagram'
  if (/Line\//i.test(ua)) return 'Line'
  if (/TikTok|musical_ly|Bytedance/i.test(ua)) return 'TikTok'
  return null
}

export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export const inviteUrl = (code: string) => location.origin + '/moi/' + code
