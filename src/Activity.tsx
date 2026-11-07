import { useEffect, useRef, useState } from 'react'
import { sb, errText, type Family, type Member, type XomData } from './supabase'
import { type Live, type Keo, type Message, type Rsvp, dayKey, streakOf } from './live'
import { STATUS, FREE, TYPES, st, ty } from './consts'
import { DOW, adultsOf, dayDiff, dm, famShort } from './util'
import { FamilyHeads, MemberHead, Sheet, useToast } from './ui'
import { notify } from './push'
import { EventAlbum } from './Album'

export type Ctx = { d: XomData; live: Live; me: Member; myFam: Family; reload: () => void; tick: number }

const hm = (t: Date) => t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0')
export function when(iso: string) {
  const t = new Date(iso), d = dayDiff(t), h = t.getHours()
  if (d === 0) return (h >= 17 ? 'Tối nay' : h >= 11 ? 'Trưa nay' : 'Sáng nay') + ', ' + hm(t)
  if (d === 1) return 'Mai, ' + hm(t)
  return DOW[t.getDay()] + ' ' + dm(t) + ', ' + hm(t)
}
const famName = (c: Ctx, f: Family) => f.id === c.myFam.id ? 'Nhà mình' : 'Nhà ' + famShort(c.d, f)
const memberById = (c: Ctx, id: string | null) => c.d.members.find(m => m.id === id)
const joinedAdults = (c: Ctx) => c.d.members.filter(m => m.role === 'adult' && m.user_id)

/* ---------- Điểm danh ---------- */
export function CheckinCard({ c }: { c: Ctx }) {
  const toast = useToast()
  const mine = c.live.today.find(x => x.member_id === c.me.id)
  const [open, setOpen] = useState(false)
  const streak = streakOf(c.live.myDays)
  async function pick(k: string) {
    const first = !mine
    const { error } = await sb.from('checkins').upsert({ xom_id: c.d.xom.id, member_id: c.me.id, day: dayKey(), status: k, updated_at: new Date().toISOString() }, { onConflict: 'member_id,day' })
    if (error) { toast(errText(error)); return }
    setOpen(false); c.reload()
    toast(first ? `Điểm danh xong! Chuỗi ${streak + (c.live.myDays.includes(dayKey()) ? 0 : 1)} ngày 🔥` : 'Đã đổi trạng thái')
  }
  if (mine && !open) return <div className="card done-strip"><span className="em" aria-hidden="true">{st(mine.status).e}</span>
    <div className="grow"><b>Đã điểm danh: {st(mine.status).t}</b><div className="meta">lúc {hm(new Date(mine.updated_at))} · <span className="streak">{streak} ngày liên tục</span></div></div>
    <button className="link" onClick={() => setOpen(true)}>Đổi</button></div>
  return <section className="card checkin" aria-label="Điểm danh">
    <h2>{mine ? 'Đổi trạng thái' : `Hôm nay ${c.me.name} thế nào?`}</h2>
    <p>{mine ? 'Chọn trạng thái mới, cả xóm sẽ thấy ngay.' : `Điểm danh để cả xóm biết ai đang rảnh.${streak ? ' Chuỗi hiện tại: ' + streak + ' ngày.' : ''}`}</p>
    <div className="chips">{STATUS.map(s => <button key={s.k} className="chip" aria-pressed={mine?.status === s.k} onClick={() => pick(s.k)}>{s.e} {s.t}</button>)}</div>
  </section>
}

export function FreeList({ c }: { c: Ctx }) {
  const toast = useToast()
  const ppl = joinedAdults(c)
  const by = new Map(c.live.today.map(x => [x.member_id, x]))
  const famsChecked = c.d.families.filter(f => adultsOf(c.d, f).some(a => by.has(a.id)))
  const free = famsChecked.filter(f => adultsOf(c.d, f).some(a => FREE.includes(by.get(a.id)?.status || '')))
  const busy = famsChecked.filter(f => !free.includes(f))
  const missing = ppl.filter(p => !by.has(p.id))
  async function poke() {
    const { error } = await sb.from('messages').insert({ xom_id: c.d.xom.id, member_id: c.me.id, body: `📣 ${c.me.name} ới cả xóm: hôm nay ai rảnh thì điểm danh nhé! (${missing.length} người chưa điểm danh)` })
    if (error) toast(errText(error)); else { toast('Đã ới cả xóm'); notify(c.d.xom.id, '📣 ' + c.me.name + ' ới cả xóm', 'Hôm nay ai rảnh thì điểm danh nhé!', '/', 'poke'); c.reload() }
  }
  const row = (f: Family) => <div className="row" key={f.id}><FamilyHeads d={c.d} f={f} />
    <div className="grow"><div className="name">{famName(c, f)}</div>
      <div className="people">{adultsOf(c.d, f).filter(a => by.has(a.id)).map(a => { const s = st(by.get(a.id)!.status)
        return <span key={a.id} className={'pst' + (FREE.includes(s.k) ? '' : ' off')}>{a.name}: {s.e} {s.s}</span> })}</div></div></div>
  return <section className="section">
    <div className="section-head"><h2>Đang rảnh, rủ được</h2><span className="sub small">{ppl.length - missing.length}/{ppl.length} đã điểm danh</span></div>
    <div className="list">
      {free.map(row)}
      {!free.length && <div className="row"><span className="sub">Chưa ai báo rảnh. Điểm danh trước làm gương nhé!</span></div>}
      {busy.map(row)}
      {missing.length > 0 && <div className="row"><span className="stack">{missing.slice(0, 5).map(p => <MemberHead key={p.id} m={p} sm />)}</span>
        <div className="grow meta">{missing.length} người chưa điểm danh</div><button className="link" onClick={poke}>Ới một tiếng</button></div>}
    </div>
  </section>
}

/* ---------- Kèo ---------- */
function RsvpButtons({ mine, onPick, labels = ['Đi luôn', 'Để xem', 'Không đi'] }: { mine?: string; onPick: (v: Rsvp['status'] | null) => void; labels?: string[] }) {
  const vs: Rsvp['status'][] = ['yes', 'maybe', 'no']
  return <div className="rsvp" role="group" aria-label="Trả lời">{vs.map((v, i) =>
    <button key={v} className={i === 1 ? 'maybe' : i === 2 ? 'no' : ''} aria-pressed={mine === v} onClick={() => onPick(mine === v ? null : v)}>{labels[i]}</button>)}</div>
}
async function setKeoRsvp(c: Ctx, k: Keo, v: Rsvp['status'] | null) {
  const before = c.live.keoRsvps.filter(r => r.keo_id === k.id && r.status === 'yes' && r.member_id !== c.me.id).length
  if (v === 'yes' && !k.locked_at && before + 1 >= k.min_people) notify(c.d.xom.id, '🔥 Chốt kèo: ' + k.title, when(k.at) + ' · ' + k.place + ' · đủ ' + (before + 1) + ' người', '/', 'keo-' + k.id)
  const r = v ? await sb.from('keo_rsvps').upsert({ keo_id: k.id, member_id: c.me.id, xom_id: k.xom_id, status: v, updated_at: new Date().toISOString() }, { onConflict: 'keo_id,member_id' })
    : await sb.from('keo_rsvps').delete().eq('keo_id', k.id).eq('member_id', c.me.id)
  return r.error
}
function KeoHead({ c, k }: { c: Ctx; k: Keo }) {
  const yes = c.live.keoRsvps.filter(r => r.keo_id === k.id && r.status === 'yes').length
  const ok = !!k.locked_at || yes >= k.min_people
  return <><div className="kicon" aria-hidden="true">{ty(k.type).e}</div>
    <div style={{ minWidth: 0, flex: 1 }}><div className="ktitle">{k.title}</div>
      <div className="kmeta"><span className="kwhen">{when(k.at)}</span><span>{k.place}</span><span>{memberById(c, k.host_member)?.name || 'Ai đó'} rủ</span></div></div>
    <span className={'badge ' + (ok ? 'lock' : 'wait')}>{ok ? 'Chốt kèo!' : 'Cần thêm ' + (k.min_people - yes)}</span></>
}
function Progress({ c, k }: { c: Ctx; k: Keo }) {
  const yes = c.live.keoRsvps.filter(r => r.keo_id === k.id && r.status === 'yes').length
  return <div className="progress"><div className="bar"><i style={{ width: Math.min(100, yes / k.min_people * 100) + '%' }} /></div><small>{yes}/{k.min_people} người đi</small></div>
}
export function KeoCard({ c, k, open }: { c: Ctx; k: Keo; open: (id: string) => void }) {
  const toast = useToast()
  const rs = c.live.keoRsvps.filter(r => r.keo_id === k.id)
  const yes = rs.filter(r => r.status === 'yes'), maybe = rs.filter(r => r.status === 'maybe')
  return <article className="card kcard">
    <button className="ktop" onClick={() => open(k.id)} aria-label={'Xem chi tiết ' + k.title}><KeoHead c={c} k={k} /></button>
    <Progress c={c} k={k} />
    <div className="kfoot"><div className="going">{yes.length > 0 && <span className="stack">{yes.slice(0, 6).map(r => { const m = memberById(c, r.member_id); return m && <MemberHead key={m.id} m={m} sm /> })}</span>}
      {maybe.length > 0 && <span>{maybe.length} người để xem</span>}</div>
      <button className="link" onClick={() => open(k.id)}>💬 Chi tiết</button></div>
    <RsvpButtons mine={rs.find(r => r.member_id === c.me.id)?.status} onPick={async v => { const e = await setKeoRsvp(c, k, v); if (e) toast(errText(e)); else c.reload() }} />
  </article>
}

export function KeoDetail({ c, id, back }: { c: Ctx; id: string; back: () => void }) {
  const toast = useToast()
  const [ask, setAsk] = useState(false)
  const k = c.live.keos.find(x => x.id === id)
  if (!k) return <><button className="back" onClick={back}>‹ Tất cả kèo</button><p className="sub">Kèo này đã qua hoặc đã bị huỷ.</p></>
  const rs = c.live.keoRsvps.filter(r => r.keo_id === k.id)
  const canCancel = k.host_member === c.me.id || c.me.is_admin
  const lbl: Record<string, [string, string]> = { yes: ['Đi', ''], maybe: ['Để xem', 'maybe'], no: ['Không', 'off'] }
  const fams = c.d.families.filter(f => adultsOf(c.d, f).some(a => rs.some(r => r.member_id === a.id)))
  const pending = joinedAdults(c).filter(p => !rs.some(r => r.member_id === p.id)).length
  async function cancel() {
    const { error } = await sb.from('keos').update({ cancelled: true }).eq('id', k!.id)
    if (error) toast(errText(error)); else { toast('Đã huỷ kèo và báo cả xóm'); c.reload(); back() }
  }
  return <>
    <button className="back" onClick={back}>‹ Tất cả kèo</button>
    <article className="card kcard"><div className="ktop"><KeoHead c={c} k={k} /></div>
      <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(k.place)} target="_blank" rel="noopener noreferrer" className="small" style={{ fontWeight: 600 }}>Mở bản đồ: {k.place}</a>
      <Progress c={c} k={k} />
      <RsvpButtons mine={rs.find(r => r.member_id === c.me.id)?.status} onPick={async v => { const e = await setKeoRsvp(c, k, v); if (e) toast(errText(e)); else c.reload() }} />
      {canCancel && (ask
        ? <><div className="note">Huỷ kèo sẽ báo cho mọi người trong kênh chung. Chắc chưa?</div>
            <div className="two"><button className="btn ghost" onClick={() => setAsk(false)}>Giữ kèo</button><button className="btn danger" onClick={cancel}>Huỷ kèo</button></div></>
        : <button className="link" style={{ alignSelf: 'flex-start', color: 'var(--danger)' }} onClick={() => setAsk(true)}>Huỷ kèo này</button>)}
    </article>
    <section className="section"><h2>Ai đi?</h2>
      <div className="list">{fams.map(f => <div className="row" key={f.id}><FamilyHeads d={c.d} f={f} /><div className="grow"><div className="name">{famName(c, f)}</div>
        <div className="people">{adultsOf(c.d, f).filter(a => a.user_id).map(a => { const r = rs.find(x => x.member_id === a.id); const L = r ? lbl[r.status] : ['Chưa trả lời', 'none']
          return <span key={a.id} className={'pst ' + L[1]}>{a.name}: {L[0]}</span> })}</div></div></div>)}
        {pending > 0 && <div className="row"><span className="meta">{pending} người chưa trả lời</span></div>}</div>
    </section>
    <EventAlbum c={c} type="keo" id={k.id} title={k.title} />
    <section className="section"><h2>Bàn kèo</h2><ChannelThread c={c} channel={'keo:' + k.id} placeholder="Đổi giờ, đổi quán, ai đón ai…" /></section>
  </>
}

export function NewKeoSheet({ c, onClose, onCreated }: { c: Ctx; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast()
  const t = new Date(Date.now() + 864e5); t.setHours(19, 0, 0, 0)
  const [f, setF] = useState({ type: 'cafe', title: '', at: new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16), place: '', min: 3 })
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const { data, error } = await sb.from('keos').insert({ xom_id: c.d.xom.id, host_member: c.me.id, type: f.type, title: f.title.trim(), at: new Date(f.at).toISOString(), place: f.place.trim(), min_people: f.min }).select('id').single()
    if (!error) await sb.from('keo_rsvps').insert({ keo_id: data.id, member_id: c.me.id, xom_id: c.d.xom.id, status: 'yes' })
    setBusy(false)
    if (error) toast(errText(error)); else { toast('Đã đăng kèo, chờ cả xóm hưởng ứng!'); notify(c.d.xom.id, ty(f.type).e + ' ' + c.me.name + ' rủ kèo: ' + f.title.trim(), when(new Date(f.at).toISOString()) + ' · ' + f.place.trim(), '/', 'keo-new'); c.reload(); onCreated(data.id) }
  }
  return <Sheet label="Rủ kèo mới" onClose={onClose}><h2>Rủ một kèo mới</h2>
    <form className="stackf" onSubmit={submit}>
      <div className="chips" role="radiogroup" aria-label="Loại kèo">{TYPES.map(x => <button type="button" key={x.k} className="chip" aria-pressed={f.type === x.k} onClick={() => setF({ ...f, type: x.k })}>{x.e} {x.t}</button>)}</div>
      <label className="f">Tên kèo<input required maxLength={60} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="VD: Cafe sáng chủ nhật" /></label>
      <div className="two"><label className="f">Khi nào<input type="datetime-local" required value={f.at} onChange={e => setF({ ...f, at: e.target.value })} /></label>
        <label className="f">Tối thiểu<select value={f.min} onChange={e => setF({ ...f, min: +e.target.value })}>{[2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n} người</option>)}</select></label></div>
      <label className="f">Ở đâu<input required maxLength={100} value={f.place} onChange={e => setF({ ...f, place: e.target.value })} placeholder="Tên quán hoặc địa chỉ" /></label>
      <div className="two"><button type="button" className="btn ghost" onClick={onClose}>Huỷ</button><button className="btn" type="submit" disabled={busy}>Đăng kèo</button></div>
    </form></Sheet>
}

/* ---------- Đăng cai ---------- */
export function Hosts({ c, newHost }: { c: Ctx; newHost: (open: boolean) => void }) {
  const toast = useToast()
  const [album, setAlbum] = useState<string | null>(null)
  const now = Date.now() - 864e5
  const list = c.live.hosts.filter(h => new Date(h.at).getTime() > now)
  const year = new Date().getFullYear()
  const gold = new Map<string, number>()
  for (const h of c.live.hosts) if (h.family_id && new Date(h.at).getFullYear() === year) gold.set(h.family_id, (gold.get(h.family_id) || 0) + 1)
  const rpc = async (id: string, take: boolean) => {
    const { error } = await sb.rpc('volunteer_host', { p_host: id, p_take: take })
    if (error) toast(errText(error)); else { toast(take ? 'Cảm ơn nhà mình đã xung phong!' : 'Đã mở lại cho nhà khác xung phong'); const h = c.live.hosts.find(x => x.id === id); if (h) notify(c.d.xom.id, take ? '🏡 Có nhà nhận đăng cai' : '🏠 Buổi đăng cai cần nhà mới', (take ? 'Nhà ' + famShort(c.d, c.myFam) + ' xung phong đăng cai: ' : 'Ai nhận đăng cai giúp: ') + h.title, '/', 'host-' + id); c.reload() }
  }
  async function rsvp(hid: string, v: Rsvp['status'] | null) {
    const r = v ? await sb.from('host_rsvps').upsert({ host_id: hid, member_id: c.me.id, xom_id: c.d.xom.id, status: v }, { onConflict: 'host_id,member_id' })
      : await sb.from('host_rsvps').delete().eq('host_id', hid).eq('member_id', c.me.id)
    if (r.error) toast(errText(r.error)); else c.reload()
  }
  return <>
    <p className="sub" style={{ marginTop: 14 }}>Nhà nào tiện thì xung phong làm chủ nhà, cả xóm kéo đến. Không ép, không xếp lịch.</p>
    <section className="section">
      {list.map(h => {
        if (!h.family_id) return <article key={h.id} className="card kcard host-open">
          <div className="ktop"><div className="kicon" aria-hidden="true">🏠</div><div style={{ flex: 1, minWidth: 0 }}><div className="ktitle">{h.title}</div>
            <div className="kmeta"><span className="kwhen">{when(h.at)}</span><span>Chưa có nhà nhận đăng cai</span></div></div></div>
          {h.note && <p className="note">{h.note}</p>}
          <button className="btn sun block" onClick={() => rpc(h.id, true)}>Nhà mình xung phong!</button></article>
        const f = c.d.families.find(x => x.id === h.family_id); if (!f) return null
        const rs = c.live.hostRsvps.filter(r => r.host_id === h.id), yes = rs.filter(r => r.status === 'yes')
        return <article key={h.id} className="card kcard">
          <div className="ktop"><div className="kicon" aria-hidden="true">🏡</div><div style={{ flex: 1, minWidth: 0 }}><div className="ktitle">{h.title}</div>
            <div className="kmeta"><span className="kwhen">{when(h.at)}</span></div></div><span className="badge lock">{yes.length} người đến</span></div>
          <div className="hostline"><FamilyHeads d={c.d} f={f} /><span><b>{famName(c, f)}</b> làm chủ nhà</span></div>
          {h.note && <p className="note">{h.note}</p>}
          <div className="going"><span className="stack">{yes.slice(0, 8).map(r => { const m = memberById(c, r.member_id); return m && <MemberHead key={m.id} m={m} sm /> })}</span></div>
          <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setAlbum(h.id)}>📸 Album buổi này</button>
          {f.id === c.myFam.id ? <button className="btn ghost block" onClick={() => rpc(h.id, false)}>Nhường lại cho nhà khác</button>
            : <RsvpButtons labels={['Đến', 'Để xem', 'Bận']} mine={rs.find(r => r.member_id === c.me.id)?.status} onPick={v => rsvp(h.id, v)} />}
        </article>
      })}
      {!list.length && <div className="note">Chưa có buổi nào. Nhà nào xung phong trước nhé!</div>}
      <button className="btn ghost block" onClick={() => newHost(false)}>+ Đề xuất buổi mới, nhà mình đăng cai</button>
      {c.me.is_admin && <button className="btn ghost block" onClick={() => newHost(true)}>+ Mở buổi chờ nhà xung phong</button>}
    </section>
    {album && (() => { const h = c.live.hosts.find(x => x.id === album); return h && <Sheet label="Album" onClose={() => setAlbum(null)}><h2>{h.title}</h2><EventAlbum c={c} type="host" id={h.id} title={h.title} /></Sheet> })()}
    {gold.size > 0 && <section className="section gold"><div className="section-head"><h2>Bảng vàng chủ nhà</h2><span className="sub small">năm {year}</span></div>
      <div className="list">{[...gold.entries()].sort((a, b) => b[1] - a[1]).map(([fid, n], i) => { const f = c.d.families.find(x => x.id === fid); return f &&
        <div className="row" key={fid}><span className="rank">{i + 1}</span><FamilyHeads d={c.d} f={f} /><div className="grow name">{famName(c, f)}</div><span className="pst">{n} lần</span></div> })}</div></section>}
  </>
}

export function NewHostSheet({ c, open, onClose }: { c: Ctx; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const t = new Date(Date.now() + 14 * 864e5); t.setHours(18, 0, 0, 0)
  const [f, setF] = useState({ title: '', at: new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16), note: '' })
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await sb.from('hosts').insert({ xom_id: c.d.xom.id, title: f.title.trim(), at: new Date(f.at).toISOString(), note: f.note.trim() || null, created_by: c.me.id, family_id: open ? null : c.myFam.id }).select('id').single()
    if (error) { toast(errText(error)); return }
    if (!open) await sb.from('host_rsvps').insert(adultsOf(c.d, c.myFam).filter(m => m.user_id).map(m => ({ host_id: data.id, member_id: m.id, xom_id: c.d.xom.id, status: 'yes' })))
    toast(open ? 'Đã mở buổi, chờ nhà xung phong' : 'Đã đăng buổi mới, nhà mình làm chủ nhà!')
    notify(c.d.xom.id, open ? '🏠 Buổi mới chờ xung phong đăng cai' : '🏡 Nhà ' + famShort(c.d, c.myFam) + ' mời cả xóm', f.title.trim() + ' · ' + when(new Date(f.at).toISOString()), '/', 'host-new')
    c.reload(); onClose()
  }
  return <Sheet label="Buổi đăng cai mới" onClose={onClose}><h2>{open ? 'Mở buổi chờ xung phong' : 'Nhà mình đăng cai'}</h2>
    <form className="stackf" onSubmit={submit}>
      <label className="f">Buổi gì<input required maxLength={60} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder={open ? 'VD: Tất niên của xóm' : 'VD: Bánh xèo tại gia'} /></label>
      <label className="f">Khi nào<input type="datetime-local" required value={f.at} onChange={e => setF({ ...f, at: e.target.value })} /></label>
      <label className="f">Lời nhắn cho cả xóm<textarea rows={3} maxLength={300} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="VD: Mỗi nhà mang một món nhé" /></label>
      <div className="two"><button type="button" className="btn ghost" onClick={onClose}>Huỷ</button><button className="btn sun" type="submit">{open ? 'Mở buổi' : 'Xung phong'}</button></div>
    </form></Sheet>
}

/* ---------- Chat ---------- */
function Thread({ c, msgs }: { c: Ctx; msgs: Message[] }) {
  if (!msgs.length) return <p className="sub small" style={{ textAlign: 'center' }}>Chưa có tin nhắn nào. Mở lời trước nhé!</p>
  let last = ''
  return <div className="thread">{msgs.map(m => {
    const t = new Date(m.created_at), k = dayKey(t), out = []
    if (k !== last) { last = k; const dd = dayDiff(t); out.push(<div key={'d' + m.id} className="day-sep">{dd === 0 ? 'Hôm nay' : dd === -1 ? 'Hôm qua' : dm(t)}</div>) }
    if (m.kind === 'system') out.push(<div key={m.id} className="sys">{m.body} · {hm(t)}</div>)
    else { const p = memberById(c, m.member_id), mine = m.member_id === c.me.id
      out.push(<div key={m.id} className={'msg' + (mine ? ' me' : '')}>{!mine && p && <MemberHead m={p} sm />}
        <div className="bubble">{!mine && <span className="by">{p?.name || 'Người cũ'}</span>}{m.body}<span className="tm">{hm(t)}</span></div></div>) }
    return out
  })}</div>
}
function Composer({ c, channel, placeholder, after }: { c: Ctx; channel: string; placeholder: string; after: () => void }) {
  const toast = useToast()
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault(); const body = v.trim(); if (!body) return
    setBusy(true)
    const { error } = await sb.from('messages').insert({ xom_id: c.d.xom.id, channel, member_id: c.me.id, body })
    setBusy(false)
    if (error) toast(errText(error)); else { setV(''); notify(c.d.xom.id, channel === 'general' ? '💬 ' + c.me.name : '💬 ' + c.me.name + ' (bàn kèo)', body, '/', channel === 'general' ? 'chat' : channel); after() }
  }
  return <form className="composer" onSubmit={send}><input aria-label="Tin nhắn" autoComplete="off" maxLength={500} placeholder={placeholder} value={v} onChange={e => setV(e.target.value)} />
    <button type="submit" disabled={busy}>Gửi</button></form>
}
function ChannelThread({ c, channel, placeholder }: { c: Ctx; channel: string; placeholder: string }) {
  const [msgs, setMsgs] = useState<Message[]>([])
  const load = () => sb.from('messages').select('*').eq('xom_id', c.d.xom.id).eq('channel', channel).order('created_at').limit(300).then(({ data }) => setMsgs((data || []) as Message[]))
  useEffect(() => { load() }, [channel, c.tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return <><Thread c={c} msgs={msgs} /><Composer c={c} channel={channel} placeholder={placeholder} after={load} /></>
}
export function ChatTab({ c, pin }: { c: Ctx; pin: () => void }) {
  const end = useRef<HTMLDivElement>(null)
  const n = c.live.messages.length
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [n])
  const by = c.live.pin && memberById(c, c.live.pin.member)
  return <>
    <div className="section-head" style={{ alignItems: 'flex-end' }}><div><h1>Kênh chung</h1><p className="sub">{c.d.families.length} gia đình · {joinedAdults(c).length} người</p></div>
      {c.me.is_admin && <button className="link" onClick={pin}>📌 {c.live.pin ? 'Sửa ghim' : 'Ghim tin'}</button>}</div>
    {c.live.pin && <div className="pin" style={{ marginTop: 14 }}><span aria-hidden="true">📌</span><div><b>Ghim{by ? ' bởi ' + by.name : ''}</b>{c.live.pin.text}</div></div>}
    <section className="section"><Thread c={c} msgs={c.live.messages} /></section>
    <div ref={end} />
    <Composer c={c} channel="general" placeholder="Nhắn cả xóm…" after={c.reload} />
  </>
}
export function PinSheet({ c, onClose }: { c: Ctx; onClose: () => void }) {
  const toast = useToast()
  const [v, setV] = useState(c.live.pin?.text || '')
  async function save(text: string | null) {
    const { error } = await sb.from('xoms').update({ pin_text: text, pin_member: text ? c.me.id : null }).eq('id', c.d.xom.id)
    if (error) toast(errText(error)); else { toast(text ? 'Đã ghim tin' : 'Đã bỏ ghim'); c.reload(); onClose() }
  }
  return <Sheet label="Ghim tin" onClose={onClose}><h2>Ghim tin cho cả xóm</h2>
    <form className="stackf" onSubmit={e => { e.preventDefault(); save(v.trim() || null) }}>
      <label className="f">Nội dung<textarea rows={3} maxLength={300} value={v} onChange={e => setV(e.target.value)} placeholder="VD: Quỹ du lịch Tết, mỗi nhà góp 500k/tháng…" /></label>
      <button className="btn" type="submit">Ghim</button>
      {c.live.pin && <button type="button" className="btn ghost" onClick={() => save(null)}>Bỏ ghim</button>}
    </form></Sheet>
}

/* ---------- Bình chọn ---------- */
export function PollCard({ c, create }: { c: Ctx; create: () => void }) {
  const toast = useToast()
  const p = c.live.poll
  if (!p) return <section className="section"><div className="section-head"><h2>Bình chọn</h2></div>
    <button className="btn ghost block" onClick={create}>+ Tạo bình chọn cho cả xóm</button></section>
  const votes = c.live.votes, mine = votes.find(v => v.member_id === c.me.id)?.option
  async function vote(i: number) {
    const r = mine === i ? await sb.from('poll_votes').delete().eq('poll_id', p!.id).eq('member_id', c.me.id)
      : await sb.from('poll_votes').upsert({ poll_id: p!.id, member_id: c.me.id, xom_id: c.d.xom.id, option: i }, { onConflict: 'poll_id,member_id' })
    if (r.error) toast(errText(r.error)); else c.reload()
  }
  async function close() { const { error } = await sb.from('polls').update({ closed: true }).eq('id', p!.id); if (error) toast(errText(error)); else c.reload() }
  return <section className="section card poll"><h2>{p.question}</h2><p className="sub small">{votes.length} người đã bình chọn</p>
    {p.options.map((o, i) => { const n = votes.filter(v => v.option === i).length, pc = votes.length ? Math.round(n / votes.length * 100) : 0
      return <button key={i} aria-pressed={mine === i} onClick={() => vote(i)}><span className="fill" style={{ width: pc + '%' }} /><span className="lbl"><span>{o}</span><small>{n} người</small></span></button> })}
    {(p.created_by === c.me.id || c.me.is_admin) && <button className="link poll-end" onClick={close}>Kết thúc bình chọn</button>}
  </section>
}
export function NewPollSheet({ c, onClose }: { c: Ctx; onClose: () => void }) {
  const toast = useToast()
  const [q, setQ] = useState(''), [opts, setOpts] = useState(['', ''])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const o = opts.map(s => s.trim()).filter(Boolean)
    if (o.length < 2) { toast('Cần ít nhất 2 lựa chọn'); return }
    const { error } = await sb.from('polls').insert({ xom_id: c.d.xom.id, question: q.trim(), options: o, created_by: c.me.id })
    if (error) toast(errText(error)); else { toast('Đã tạo bình chọn'); notify(c.d.xom.id, '🗳️ ' + c.me.name + ' mở bình chọn', q.trim(), '/', 'poll'); c.reload(); onClose() }
  }
  return <Sheet label="Tạo bình chọn" onClose={onClose}><h2>Tạo bình chọn</h2>
    <form className="stackf" onSubmit={submit}>
      <label className="f">Câu hỏi<input required maxLength={120} value={q} onChange={e => setQ(e.target.value)} placeholder="VD: Tết Dương lịch cả xóm đi đâu?" /></label>
      {opts.map((o, i) => <label key={i} className="f">Lựa chọn {i + 1}<input maxLength={60} value={o} onChange={e => setOpts(opts.map((x, j) => j === i ? e.target.value : x))} /></label>)}
      {opts.length < 6 && <button type="button" className="btn ghost" onClick={() => setOpts([...opts, ''])}>+ Thêm lựa chọn</button>}
      <button className="btn" type="submit">Tạo bình chọn</button>
    </form></Sheet>
}

export function UpcomingKeos({ c, open, all }: { c: Ctx; open: (id: string) => void; all: () => void }) {
  const list = c.live.keos.slice(0, 2)
  return <>{list.map(k => <KeoCard key={k.id} c={c} k={k} open={open} />)}
    {!list.length && <div className="note">Chưa có kèo nào sắp tới. Rủ một kèo đi!</div>}
    <button className="btn ghost block" onClick={all}>Xem tất cả kèo</button></>
}

export async function postWish(c: Ctx, text: string) {
  notify(c.d.xom.id, '💬 ' + c.me.name, text, '/', 'chat')
  return sb.from('messages').insert({ xom_id: c.d.xom.id, member_id: c.me.id, body: text })
}
