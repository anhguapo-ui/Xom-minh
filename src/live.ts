import { useCallback, useEffect, useRef, useState } from 'react'
import { sb } from './supabase'

export type Checkin = { id: string; xom_id: string; member_id: string; day: string; status: string; updated_at: string }
export type Keo = { id: string; xom_id: string; host_member: string; type: string; title: string; at: string; place: string; min_people: number; cancelled: boolean; locked_at: string | null; created_at: string }
export type Rsvp = { member_id: string; status: 'yes' | 'maybe' | 'no' }
export type KeoRsvp = Rsvp & { keo_id: string }
export type Host = { id: string; xom_id: string; family_id: string | null; title: string; at: string; note: string | null; created_by: string | null; created_at: string }
export type HostRsvp = Rsvp & { host_id: string }
export type Message = { id: string; xom_id: string; channel: string; member_id: string | null; kind: 'text' | 'system'; body: string; created_at: string }
export type Poll = { id: string; question: string; options: string[]; created_by: string | null; closed: boolean; created_at: string }
export type PollVote = { poll_id: string; member_id: string; option: number }
export type Offering = { id: string; member_id: string; offerings: string[]; created_at: string }
export type Wish = { offering_id: string; member_id: string; wish: string; private: boolean }
export type XamDraw = { id: string; n: number; topic: string; shared: boolean; day: string }
export type Live = {
  altar: Offering[]; wishes: Wish[]; myXam: XamDraw | null
  today: Checkin[]; myDays: string[]; keos: Keo[]; keoRsvps: KeoRsvp[]; hosts: Host[]; hostRsvps: HostRsvp[]
  messages: Message[]; poll: Poll | null; votes: PollVote[]; pin: { text: string; member: string | null } | null
}

export const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

async function fetchLive(xomId: string, meId: string): Promise<Live> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()
  const since = new Date(Date.now() - 6 * 3600e3).toISOString()
  const d90 = dayKey(new Date(Date.now() - 90 * 864e5))
  const [today, mine, keos, hosts, msgs, polls, xom, altar, xam] = await Promise.all([
    sb.from('checkins').select('*').eq('xom_id', xomId).eq('day', dayKey()),
    sb.from('checkins').select('day').eq('member_id', meId).gte('day', d90),
    sb.from('keos').select('*').eq('xom_id', xomId).eq('cancelled', false).gte('at', since).order('at'),
    sb.from('hosts').select('*').eq('xom_id', xomId).gte('at', yearStart).order('at'),
    sb.from('messages').select('*').eq('xom_id', xomId).eq('channel', 'general').order('created_at', { ascending: false }).limit(150),
    sb.from('polls').select('*').eq('xom_id', xomId).eq('closed', false).order('created_at', { ascending: false }).limit(1),
    sb.from('xoms').select('pin_text,pin_member').eq('id', xomId).single(),
    sb.from('altar_offerings').select('id,member_id,offerings,created_at').eq('xom_id', xomId).eq('day', dayKey()).order('created_at'),
    sb.from('xam_draws').select('id,n,topic,shared,day').eq('member_id', meId).eq('day', dayKey()).maybeSingle(),
  ])
  for (const r of [today, mine, keos, hosts, msgs, polls]) if (r.error) throw r.error
  const keoIds = (keos.data || []).map(k => k.id), hostIds = (hosts.data || []).map(h => h.id)
  const altarRows = (altar.data || []) as Offering[]
  const wishes = altarRows.length ? await sb.from('altar_wishes').select('offering_id,member_id,wish,private').in('offering_id', altarRows.map(a => a.id)) : { data: [] }
  const poll = (polls.data || [])[0] || null
  const [kr, hr, pv] = await Promise.all([
    keoIds.length ? sb.from('keo_rsvps').select('keo_id,member_id,status').in('keo_id', keoIds) : Promise.resolve({ data: [], error: null }),
    hostIds.length ? sb.from('host_rsvps').select('host_id,member_id,status').in('host_id', hostIds) : Promise.resolve({ data: [], error: null }),
    poll ? sb.from('poll_votes').select('poll_id,member_id,option').eq('poll_id', poll.id) : Promise.resolve({ data: [], error: null }),
  ])
  return {
    today: today.data as Checkin[], myDays: (mine.data || []).map(r => r.day as string),
    keos: keos.data as Keo[], keoRsvps: (kr.data || []) as KeoRsvp[],
    hosts: hosts.data as Host[], hostRsvps: (hr.data || []) as HostRsvp[],
    messages: ((msgs.data || []) as Message[]).reverse(), poll: poll as Poll | null, votes: (pv.data || []) as PollVote[],
    altar: altarRows, wishes: (wishes.data || []) as Wish[], myXam: (xam.data || null) as XamDraw | null,
    pin: xom.data?.pin_text ? { text: xom.data.pin_text, member: xom.data.pin_member } : null,
  }
}

const TABLES = ['altar_offerings', 'checkins', 'keos', 'keo_rsvps', 'hosts', 'host_rsvps', 'messages', 'polls', 'poll_votes']

// Dữ liệu hoạt động của xóm, tự cập nhật khi có thay đổi (Supabase Realtime)
export function useLive(xomId: string, meId: string, onError: (e: unknown) => void) {
  const [live, setLive] = useState<Live | null>(null)
  const [tick, setTick] = useState(0) // tăng mỗi khi có thay đổi, để màn chat kèo tự tải lại
  const timer = useRef<number>()
  const reload = useCallback(() => fetchLive(xomId, meId).then(setLive).catch(onError), [xomId, meId, onError])
  useEffect(() => {
    reload()
    const ch = sb.channel('xom-' + xomId)
    for (const t of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: 'xom_id=eq.' + xomId }, () => {
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => { reload(); setTick(x => x + 1) }, 350)
    })
    ch.subscribe()
    const vis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', vis)
    return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); clearTimeout(timer.current) }
  }, [xomId, reload])
  return { live, reload, tick }
}

export function streakOf(days: string[]) {
  const set = new Set(days)
  const d = new Date()
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
