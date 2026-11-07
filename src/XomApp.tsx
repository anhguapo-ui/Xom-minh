import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb, errText, loadXom, myXomIds, type Family, type Member, type XomData } from './supabase'
import { DOW, adultsOf, dayDiff, dm, famShort, inviteUrl, kidsOf, lookOf, navigate, upcoming, type Ev } from './util'
import { Brand, Chibi, FamilyHeads, MemberHead, Sheet, copyText, useToast } from './ui'
import { FamilyForm } from './FamilyForm'
import { ChibiEditor } from './ChibiEditor'
import { useLive } from './live'
import { toLunar, findLunar, lunarName } from './lunar'
import { GateCard, Temple } from './Temple'
import { AlbumTab, OnThisDay } from './Album'
import { HelpTab } from './Help'
import { NotifyCard, NotifyToggle } from './Install'
import { disablePush } from './push'
import { type Ctx, CheckinCard, FreeList, KeoCard, KeoDetail, NewKeoSheet, Hosts, NewHostSheet, ChatTab, PinSheet, PollCard, NewPollSheet, UpcomingKeos, postWish } from './Activity'

export function Main({ session }: { session: Session }) {
  const toast = useToast()
  const [xomId, setXomId] = useState<string | null | undefined>(undefined)
  const [data, setData] = useState<XomData | null>(null)

  const refresh = useCallback(async (id: string) => {
    try { setData(await loadXom(id)) } catch (e) { toast(errText(e)) }
  }, [toast])

  useEffect(() => {
    myXomIds(session.user.id).then(ids => {
      const saved = localStorage.getItem('xm-xom')
      const id = ids.includes(saved || '') ? saved! : ids[0] || null
      setXomId(id)
      if (id) refresh(id)
    }).catch(e => { toast(errText(e)); setXomId(null) })
  }, [session.user.id, refresh, toast])

  if (xomId === undefined || (xomId && !data)) return <div className="app"><header className="top"><Brand /></header><p className="sub">Đang mở xóm…</p></div>
  if (!xomId || !data) return <NoXom session={session} onCreated={id => { localStorage.setItem('xm-xom', id); setXomId(id); refresh(id) }} />
  return <XomApp session={session} d={data} reload={() => refresh(xomId)} />
}

function NoXom({ session, onCreated }: { session: Session; onCreated: (id: string) => void }) {
  const toast = useToast()
  const [link, setLink] = useState('')
  const [f, setF] = useState({ xom: 'Xóm Mình', me: '', spouse: '', kids: '' })
  const [busy, setBusy] = useState(false)
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const { data, error } = await sb.rpc('create_xom', {
      p_xom_name: f.xom.trim(), p_my_name: f.me.trim(), p_spouse_name: f.spouse.trim() || null,
      p_kids: f.kids.split(',').map(s => s.trim()).filter(Boolean),
    })
    setBusy(false)
    if (error) toast(errText(error)); else { toast('Đã tạo xóm!'); onCreated(data as string) }
  }
  function openLink(e: React.FormEvent) {
    e.preventDefault()
    const m = link.trim().match(/([A-Za-z0-9]{6,12})\/?$/)
    if (m) navigate('/moi/' + m[1].toUpperCase()); else toast('Link mời không đúng dạng, kiểm tra lại nhé')
  }
  return <div className="app"><header className="top"><Brand /></header>
    <h1>Chào bạn!</h1>
    <p className="sub">Bạn đang đăng nhập bằng {session.user.email}, nhưng chưa ở xóm nào.</p>
    <section className="section card">
      <h2>Có link mời từ bạn bè?</h2>
      <p className="sub small" style={{ margin: 0 }}>Mở đúng link đó trên máy này, hoặc dán vào đây.</p>
      <form className="composer" style={{ position: 'static', margin: 0, padding: 0 }} onSubmit={openLink}>
        <input aria-label="Link mời" placeholder="https://xom-minh.netlify.app/moi/…" value={link} onChange={e => setLink(e.target.value)} />
        <button type="submit">Mở</button>
      </form>
    </section>
    <section className="section">
      <h2>Hoặc tạo xóm mới</h2>
      <p className="sub small" style={{ margin: 0 }}>Dành cho trưởng xóm. Bạn và vợ/chồng sẽ là trưởng xóm, có quyền mời các nhà khác.</p>
      <form className="stackf" onSubmit={create}>
        <label className="f">Tên xóm<input required maxLength={60} value={f.xom} onChange={e => setF({ ...f, xom: e.target.value })} /></label>
        <div className="two">
          <label className="f">Tên của bạn<input required maxLength={40} value={f.me} onChange={e => setF({ ...f, me: e.target.value })} placeholder="VD: Anh" /></label>
          <label className="f">Tên vợ/chồng<input maxLength={40} value={f.spouse} onChange={e => setF({ ...f, spouse: e.target.value })} placeholder="Để trống nếu chưa" /></label>
        </div>
        <label className="f">Tên các bé, cách nhau bằng dấu phẩy<input maxLength={120} value={f.kids} onChange={e => setF({ ...f, kids: e.target.value })} placeholder="VD: Bin, Na" /></label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo xóm'}</button>
      </form>
    </section>
    <button className="link" style={{ marginTop: 18 }} onClick={() => sb.auth.signOut()}>Đăng xuất</button>
  </div>
}

type LinkItem = { name: string; code: string }
type SheetState = null | { k: 'newKeo' } | { k: 'newHost'; open: boolean } | { k: 'poll' } | { k: 'pin' } | { k: 'me' } | { k: 'fam' } | { k: 'famEdit'; id: string } | { k: 'chibi'; id: string } | { k: 'invite' } | { k: 'link'; items: LinkItem[]; fam: string }

const ICONS: Record<string, string> = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>',
  keo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11v8a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 7h2a3 3 0 0 1 0 6h-2"/><path d="M6 21h10"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/></svg>',
  xom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0"/><path d="M10.5 19a5.5 5.5 0 0 1 11 0"/></svg>',
}
type Tab = 'home' | 'keo' | 'chat' | 'xom' | 'mieu'

function XomApp({ session, d, reload }: { session: Session; d: XomData; reload: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('xm-tab') as Tab) || 'home')
  const [sheet, setSheet] = useState<SheetState>(null)
  const me = d.members.find(m => m.user_id === session.user.id)!
  const myFam = d.families.find(f => f.id === me.family_id)!
  const famName = (f: Family) => f.id === myFam.id ? 'Nhà mình' : 'Nhà ' + famShort(d, f)
  const close = useCallback(() => setSheet(null), [])
  const [keoId, setKeoId] = useState<string | null>(null)
  const [enterMieu, setEnterMieu] = useState(false)
  const [xomSub, setXomSub] = useState<'fam' | 'help' | 'album'>('fam')
  const [keoSub, setKeoSub] = useState<'keo' | 'host'>('keo')
  useEffect(() => { sessionStorage.setItem('xm-tab', tab); scrollTo(0, 0) }, [tab, keoId])
  const onErr = useCallback((e: unknown) => toast(errText(e)), [toast])
  const { live, reload: reloadLive, tick } = useLive(d.xom.id, me.id, onErr)
  // Có người vào xóm, đổi hồ sơ, chibi: tải lại danh sách thành viên
  useEffect(() => {
    const ch = sb.channel('members-' + d.xom.id).on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: 'xom_id=eq.' + d.xom.id }, () => reload()).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [d.xom.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const openKeo = (id: string) => { setTab('keo'); setKeoSub('keo'); setKeoId(id) }

  async function personalLink(m: Member) {
    const { data, error } = await sb.rpc('make_member_invite', { p_member: m.id })
    const f = d.families.find(x => x.id === m.family_id)!
    if (error) toast(errText(error)); else setSheet({ k: 'link', items: [{ name: m.name, code: data as string }], fam: famShort(d, f) })
  }

  const evRow = (e: Ev) => <div className="row" key={e.label + e.family.id}>
    <div className="date"><b>{e.date.getDate()}</b><small>th {e.date.getMonth() + 1}</small></div>
    <div className="grow"><div className="name">{e.label}</div><div className="meta">{famName(e.family)} · {dayDiff(e.date) === 0 ? 'hôm nay' : 'còn ' + dayDiff(e.date) + ' ngày'}</div></div>
    {live && <button className="link" onClick={async () => {
      const what = e.label.split(' · ')[0].replace(/^Sinh nhật/, 'sinh nhật').replace(/^Kỷ niệm/, 'kỷ niệm').replace(/^Thôi nôi/, 'thôi nôi')
      const r = await postWish(c!, `🎉 Chúc mừng ${what} nhà ${famShort(d, e.family)}!`)
      if (r.error) toast(errText(r.error)); else { toast('Đã gửi lời chúc vào kênh chung'); reloadLive() }
    }}>Chúc</button>}
  </div>
  const joined = d.members.filter(m => m.role === 'adult' && m.user_id).length
  const evs = upcoming(d)
  const now = new Date()

  const c: Ctx | null = live ? { d, live, me, myFam, reload: reloadLive, tick } : null
  const L = toLunar(now), nextLe = findLunar(now, l => l.d === 1 || l.d === 15)
  const setupLeft = !me.look || Object.keys(me.look as object).length === 0 || (me.is_admin && d.families.length < 3)

  let view
  if (!c) view = <p className="sub">Đang tải hoạt động của xóm…</p>
  else if (tab === 'home') view = <>
    <div><h1>{DOW[now.getDay()]}, {now.getDate()} tháng {now.getMonth() + 1}</h1>
      <p className="sub">{lunarName(L)} âm lịch{nextLe ? ' · ' + (nextLe.days === 0 ? 'hôm nay là ' + (nextLe.l.d === 1 ? 'mùng 1' : 'ngày rằm') : 'còn ' + nextLe.days + ' ngày đến ' + (nextLe.l.d === 1 ? 'mùng 1' : 'rằm')) : ''}</p></div>
    <CheckinCard c={c} />
    <NotifyCard memberId={me.id} xomId={d.xom.id} />
    <GateCard c={c} enter={() => { setEnterMieu(true); setTab('mieu') }} />
    <FreeList c={c} />
    <section className="section">
      <div className="section-head"><h2>Kèo sắp tới</h2><button className="link" onClick={() => setSheet({ k: 'newKeo' })}>+ Rủ kèo</button></div>
      <UpcomingKeos c={c} open={openKeo} all={() => { setTab('keo'); setKeoId(null) }} />
    </section>
    {evs[0] && <section className="section"><h2>Đừng quên</h2><div className="list">{evRow(evs[0])}</div></section>}
    <OnThisDay c={c} />
    {setupLeft && <section className="section card">
      <h2>Việc nên làm</h2>
      <div className="list" style={{ boxShadow: 'none' }}>
        <button className="row" style={{ background: 'none', border: 0, textAlign: 'left', width: '100%' }} onClick={() => setSheet({ k: 'chibi', id: me.id })}>
          <MemberHead m={me} /><div className="grow"><div className="name">Tạo chibi cho cả nhà</div><div className="meta">Dùng ảnh thật hoặc tự chọn tóc, áo, kính</div></div></button>
        <button className="row" style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', textAlign: 'left', width: '100%' }} onClick={() => setSheet({ k: 'fam' })}>
          <FamilyHeads d={d} f={myFam} /><div className="grow"><div className="name">Hoàn thiện hồ sơ nhà mình</div><div className="meta">Ngày sinh, ngày cưới, các bé</div></div></button>
        {me.is_admin && <button className="row" style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', textAlign: 'left', width: '100%' }} onClick={() => setSheet({ k: 'invite' })}>
          <span className="av" style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>+</span><div className="grow"><div className="name">Mời các gia đình vào xóm</div><div className="meta">Tạo link mời riêng cho từng nhà</div></div></button>}
      </div>
    </section>}
  </>
  else if (tab === 'keo') view = keoId ? <KeoDetail c={c} id={keoId} back={() => setKeoId(null)} /> : <>
    <div><h1>Kèo của xóm</h1><p className="sub">{c.live.keos.length} kèo đang mở · {c.live.keos.filter(k => k.locked_at).length} kèo đã chốt</p></div>
    <div className="seg" role="group" aria-label="Chọn mục">
      <button aria-pressed={keoSub === 'keo'} onClick={() => setKeoSub('keo')}>Kèo</button>
      <button aria-pressed={keoSub === 'host'} onClick={() => setKeoSub('host')}>Đăng cai{c.live.hosts.filter(h => !h.family_id && new Date(h.at).getTime() > Date.now()).length > 0 && <span className="pipin">{c.live.hosts.filter(h => !h.family_id && new Date(h.at).getTime() > Date.now()).length}</span>}</button>
    </div>
    {keoSub === 'host' ? <Hosts c={c} newHost={open => setSheet({ k: 'newHost', open })} /> : <section className="section">
      <button className="btn sun block" onClick={() => setSheet({ k: 'newKeo' })}>+ Rủ một kèo mới</button>
      {c.live.keos.map(k => <KeoCard key={k.id} c={c} k={k} open={openKeo} />)}
      {!c.live.keos.length && <div className="note">Chưa có kèo nào. Rủ một kèo đầu tiên đi!</div>}
      <p className="sub small">Kèo tự chuyển sang "Chốt kèo!" khi đủ số người tối thiểu. Bấm vào kèo để xem ai đi và bàn thêm.</p>
    </section>}
  </>
  else if (tab === 'mieu') view = <Temple c={c} enter={enterMieu} back={() => { setEnterMieu(false); setTab('home') }} />
  else if (tab === 'chat') view = <ChatTab c={c} pin={() => setSheet({ k: 'pin' })} />
  else if (xomSub !== 'fam') view = <>
    <div><h1>{d.xom.name}</h1></div>
    <XomSeg sub={xomSub} set={setXomSub} />
    {xomSub === 'help' ? <HelpTab c={c} /> : <AlbumTab c={c} />}
  </>
  else view = <>
    <div><h1>{d.xom.name}</h1><p className="sub">{d.families.length} gia đình · {joined} người lớn đã vào · {d.members.filter(m => m.role === 'kid').length} bạn nhỏ</p></div>
    <XomSeg sub={xomSub} set={setXomSub} />
    <section className="section"><div className="section-head"><h2>Sắp tới</h2><span className="sub small">45 ngày tới</span></div>
      <div className="list">{evs.length ? evs.map(evRow) : <div className="row"><span className="sub">Chưa có ngày đặc biệt nào. Điền ngày sinh trong hồ sơ để cả xóm nhớ chúc nhé.</span></div>}</div>
    </section>
    <PollCard c={c} create={() => setSheet({ k: 'poll' })} />
    <section className="section"><div className="section-head"><h2>Các gia đình</h2>{me.is_admin && <button className="link" onClick={() => setSheet({ k: 'invite' })}>+ Mời nhà mới</button>}</div>
      <div className="fam-grid">{[...d.families].sort((a, b) => Number(b.id === myFam.id) - Number(a.id === myFam.id)).map(f => {
        const mine = f.id === myFam.id, pend = adultsOf(d, f).filter(m => !m.user_id), kids = kidsOf(d, f)
        return <div key={f.id} className={'fam' + (mine ? ' mine' : '')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FamilyHeads d={d} f={f} sm /><div className="name">{mine ? 'Nhà mình' : famShort(d, f)}</div></div>
          {mine && <div className="meta">{famShort(d, f)}</div>}
          <div className="meta">{kids.length ? 'Bé ' + kids.map(k => k.name).join(', bé ') : 'Chưa có bé'}</div>
          {adultsOf(d, f).filter(m => m.user_id && m.phone_public && m.phone).map(m => <div key={m.id} className="meta">{m.name}: {m.phone}</div>)}
          {pend.map(m => <div key={m.id} className="pending">{m.name} chưa vào xóm{(me.is_admin || mine) && <> · <button onClick={() => personalLink(m)}>Gửi link cho {m.name}</button></>}</div>)}
          {!mine && me.is_admin && <button className="btn ghost" style={{ minHeight: 44, fontSize: 15 }} onClick={() => setSheet({ k: 'famEdit', id: f.id })}>Sửa hồ sơ</button>}
          {mine && <><button className="btn ghost" style={{ minHeight: 44, fontSize: 15 }} onClick={() => setSheet({ k: 'fam' })}>Sửa hồ sơ</button>
            <button className="btn ghost" style={{ minHeight: 44, fontSize: 15 }} onClick={() => setSheet({ k: 'chibi', id: me.id })}>Chibi cả nhà</button></>}
        </div>
      })}</div>
    </section>
  </>

  return <div className="app">
    <header className="top"><Brand />
      <button className="who" onClick={() => setSheet({ k: 'me' })} aria-label="Tài khoản của bạn"><MemberHead m={me} sm /><span>{me.name}</span></button>
    </header>
    <main className="view">{view}</main>
    <nav className="tabs" aria-label="Điều hướng"><div className="in">{([['home', 'Hôm nay'], ['keo', 'Kèo'], ['chat', 'Chat'], ['xom', 'Xóm']] as [Tab, string][]).map(([k, l]) =>
      <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => { setTab(k); setKeoId(null) }}><span dangerouslySetInnerHTML={{ __html: ICONS[k] }} style={{ display: 'contents' }} /><span>{l}</span></button>)}</div></nav>

    {c && sheet?.k === 'newKeo' && <NewKeoSheet c={c} onClose={close} onCreated={id => { close(); openKeo(id) }} />}
    {c && sheet?.k === 'newHost' && <NewHostSheet c={c} open={sheet.open} onClose={close} />}
    {c && sheet?.k === 'poll' && <NewPollSheet c={c} onClose={close} />}
    {c && sheet?.k === 'pin' && <PinSheet c={c} onClose={close} />}
    {sheet?.k === 'me' && <Sheet label="Tài khoản" onClose={close}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Chibi look={lookOf(me)} /><div><h2>{me.name}</h2><p className="sub small" style={{ margin: 0 }}>{session.user.email}</p>{me.is_admin && <span className="pst">Trưởng xóm</span>}</div></div>
      <button className="btn ghost" onClick={() => setSheet({ k: 'chibi', id: me.id })}>Sửa chibi</button>
      <button className="btn ghost" onClick={() => setSheet({ k: 'fam' })}>Sửa hồ sơ nhà mình</button>
      <NotifyToggle memberId={me.id} xomId={d.xom.id} />
      <button className="btn ghost" onClick={async () => { await disablePush().catch(() => {}); localStorage.removeItem('xm-xom'); sb.auth.signOut() }}>Đăng xuất</button>
    </Sheet>}
    {sheet?.k === 'fam' && <Sheet label="Hồ sơ nhà mình" onClose={close}>
      <h2>Hồ sơ nhà mình</h2>
      <FamilyForm d={d} family={myFam} ownerId={me.id} submitLabel="Lưu hồ sơ" onDone={() => { toast('Đã lưu hồ sơ nhà mình'); close(); reload() }} />
    </Sheet>}
    {sheet?.k === 'chibi' && <Sheet label="Chibi nhà mình" onClose={close}>
      <ChibiEditor members={d.members.filter(m => m.family_id === myFam.id)} startId={sheet.id} onSaved={reload} onClose={close} />
    </Sheet>}
    {sheet?.k === 'famEdit' && (() => { const f = d.families.find(x => x.id === sheet.id); return f && <Sheet label="Sửa hồ sơ gia đình" onClose={close}>
      <h2>Hồ sơ nhà {famShort(d, f)}</h2>
      <p className="sub small" style={{ margin: 0 }}>Trưởng xóm sửa giúp khi nhà này gõ sai tên hoặc chưa kịp điền.</p>
      <FamilyForm d={d} family={f} ownerId="" submitLabel="Lưu hồ sơ" onDone={() => { toast('Đã lưu hồ sơ nhà ' + famShort(d, f)); close(); reload() }} />
      <Unclaim d={d} f={f} onDone={reload} />
    </Sheet> })()}
    {sheet?.k === 'invite' && <Sheet label="Mời gia đình mới" onClose={close}><InviteForm xomId={d.xom.id} onDone={(items, fam) => { reload(); setSheet({ k: 'link', items, fam }) }} /></Sheet>}
    {sheet?.k === 'link' && <Sheet label="Link mời" onClose={close}><LinkBox items={sheet.items} fam={sheet.fam} xom={d.xom.name} /></Sheet>}
  </div>
}

function XomSeg({ sub, set }: { sub: 'fam' | 'help' | 'album'; set: (s: 'fam' | 'help' | 'album') => void }) {
  return <div className="seg seg3" style={{ marginTop: 14 }} role="group" aria-label="Chọn mục">
    {([['fam', 'Gia đình'], ['help', 'Tương trợ'], ['album', 'Album']] as const).map(([k, t]) => <button key={k} aria-pressed={sub === k} onClick={() => set(k)}>{t}</button>)}</div>
}

function InviteForm({ xomId, onDone }: { xomId: string; onDone: (items: LinkItem[], fam: string) => void }) {
  const toast = useToast()
  const [a, setA] = useState(''), [b, setB] = useState(''), [wed, setWed] = useState('')
  const [kids, setKids] = useState<{ key: string; name: string; dob: string }[]>([])
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const adults = [a.trim(), b.trim()].filter(Boolean)
    const { data, error } = await sb.rpc('invite_family2', {
      p_xom: xomId, p_adults: adults, p_wedding: wed || null,
      p_kids: kids.filter(k => k.name.trim()).map(k => ({ name: k.name.trim(), dob: k.dob || null })),
    })
    setBusy(false)
    if (error) toast(errText(error))
    else onDone((data as { name: string; code: string }[]).map(x => ({ name: x.name, code: x.code })), adults.join(' & '))
  }
  return <form className="stackf" onSubmit={submit}>
    <h2>Mời một gia đình mới</h2>
    <p className="sub small" style={{ margin: 0 }}>Điền sẵn những gì bạn biết về nhà bạn bè. Mỗi người lớn sẽ có một link riêng, mở ra là đúng tên mình, không thể nhầm.</p>
    <div className="two"><label className="f">Tên chồng<input required maxLength={40} value={a} onChange={e => setA(e.target.value)} placeholder="VD: Hùng" /></label>
      <label className="f">Tên vợ<input maxLength={40} value={b} onChange={e => setB(e.target.value)} placeholder="VD: Lan" /></label></div>
    <label className="f">Ngày cưới (nếu biết)<input type="date" value={wed} onChange={e => setWed(e.target.value)} /></label>
    <div className="group-title">Các bé</div>
    {kids.map((k, i) => <div className="kid-row" key={k.key}>
      <input aria-label="Tên bé" placeholder="Tên bé" maxLength={40} value={k.name} onChange={e => setKids(kids.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
      <input aria-label="Ngày sinh của bé (nếu biết)" type="date" value={k.dob} onChange={e => setKids(kids.map((x, j) => j === i ? { ...x, dob: e.target.value } : x))} />
      <button type="button" aria-label="Bỏ bé này" onClick={() => setKids(kids.filter((_, j) => j !== i))}>×</button>
    </div>)}
    <button type="button" className="btn ghost" onClick={() => setKids([...kids, { key: 'k' + Date.now(), name: '', dob: '' }])}>+ Thêm bé</button>
    <button className="btn" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo link mời'}</button>
  </form>
}

function LinkBox({ items, fam, xom }: { items: LinkItem[]; fam: string; xom: string }) {
  const toast = useToast()
  const msgOf = (it: LinkItem) => `Chào ${it.name}! Mời ${it.name} vào ${xom} của hội mình nhé. Bấm link, đăng nhập là xong: ${inviteUrl(it.code)}`
  async function share(it: LinkItem) {
    const msg = msgOf(it)
    if (navigator.share) { try { await navigator.share({ text: msg }); return } catch { /* người dùng huỷ */ } }
    toast(await copyText(msg) ? `Đã sao chép, dán vào Zalo của ${it.name} là xong` : 'Bấm giữ đoạn chữ để sao chép')
  }
  return <>
    <h2>{items.length > 1 ? 'Link mời nhà ' + fam : 'Link mời ' + items[0]?.name}</h2>
    <p className="sub small" style={{ margin: 0 }}>Mỗi link chỉ dành cho đúng một người, dùng một lần, hết hạn ngày {dm(new Date(Date.now() + 7 * 864e5))}. Gửi đúng link cho đúng người nhé.</p>
    {items.map(it => <div key={it.code} className="stackf" style={{ gap: 8 }}>
      <div className="group-title">Link của {it.name}</div>
      <div className="linkbox">{msgOf(it)}</div>
      <div className="two">
        <button className="btn" onClick={() => share(it)}>Gửi cho {it.name}</button>
        <button className="btn ghost" onClick={async () => toast(await copyText(inviteUrl(it.code)) ? 'Đã sao chép link của ' + it.name : 'Bấm giữ link để sao chép')}>Chép link</button>
      </div>
    </div>)}
  </>
}

function Unclaim({ d, f, onDone }: { d: XomData; f: Family; onDone: () => void }) {
  const toast = useToast()
  const [ask, setAsk] = useState<string | null>(null)
  const claimed = adultsOf(d, f).filter(m => m.user_id)
  if (!claimed.length) return null
  async function go(id: string) {
    const { error } = await sb.rpc('unclaim_member', { p_member: id })
    setAsk(null)
    if (error) toast(errText(error)); else { toast('Đã gỡ. Gửi link mới cho đúng người nhé'); onDone() }
  }
  return <div className="stackf" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
    <div className="group-title">Nhận nhầm tên?</div>
    <p className="sub small" style={{ margin: 0 }}>Nếu ai đó vào nhầm tên, gỡ tài khoản khỏi tên đó rồi gửi link mới cho đúng người.</p>
    {claimed.map(m => ask === m.id
      ? <div key={m.id} className="stackf" style={{ gap: 8 }}><div className="note">Gỡ tài khoản đang dùng tên <b>{m.name}</b>? Người đó sẽ ra khỏi xóm cho đến khi nhận lại bằng link mới.</div>
          <div className="two"><button className="btn ghost" onClick={() => setAsk(null)}>Thôi</button><button className="btn danger" onClick={() => go(m.id)}>Gỡ</button></div></div>
      : <button key={m.id} className="btn ghost" onClick={() => setAsk(m.id)}>Gỡ tài khoản khỏi tên {m.name}</button>)}
  </div>
}
