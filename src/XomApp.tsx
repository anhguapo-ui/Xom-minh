import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb, errText, loadXom, myXomIds, type Family, type XomData } from './supabase'
import { DOW, adultsOf, dayDiff, dm, famShort, inviteUrl, kidsOf, lookOf, navigate, upcoming, type Ev } from './util'
import { Brand, Chibi, FamilyHeads, MemberHead, Sheet, copyText, useToast } from './ui'
import { FamilyForm } from './FamilyForm'
import { ChibiEditor } from './ChibiEditor'

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

type SheetState = null | { k: 'me' } | { k: 'fam' } | { k: 'chibi'; id: string } | { k: 'invite' } | { k: 'link'; code: string; fam: string }

const ICONS: Record<string, string> = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>',
  keo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11v8a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 7h2a3 3 0 0 1 0 6h-2"/><path d="M6 21h10"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/></svg>',
  xom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0"/><path d="M10.5 19a5.5 5.5 0 0 1 11 0"/></svg>',
}
type Tab = 'home' | 'keo' | 'chat' | 'xom'

function XomApp({ session, d, reload }: { session: Session; d: XomData; reload: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('xm-tab') as Tab) || 'home')
  const [sheet, setSheet] = useState<SheetState>(null)
  const me = d.members.find(m => m.user_id === session.user.id)!
  const myFam = d.families.find(f => f.id === me.family_id)!
  const famName = (f: Family) => f.id === myFam.id ? 'Nhà mình' : 'Nhà ' + famShort(d, f)
  const close = useCallback(() => setSheet(null), [])
  useEffect(() => { sessionStorage.setItem('xm-tab', tab); scrollTo(0, 0) }, [tab])

  async function reissue(f: Family) {
    const { data, error } = await sb.rpc('reissue_invite', { p_family: f.id })
    if (error) toast(errText(error)); else setSheet({ k: 'link', code: data as string, fam: famShort(d, f) })
  }

  const evRow = (e: Ev) => <div className="row" key={e.label + e.family.id}>
    <div className="date"><b>{e.date.getDate()}</b><small>th {e.date.getMonth() + 1}</small></div>
    <div className="grow"><div className="name">{e.label}</div><div className="meta">{famName(e.family)} · {dayDiff(e.date) === 0 ? 'hôm nay' : 'còn ' + dayDiff(e.date) + ' ngày'}</div></div>
  </div>
  const joined = d.members.filter(m => m.role === 'adult' && m.user_id).length
  const evs = upcoming(d)
  const now = new Date()

  let view
  if (tab === 'home') view = <>
    <div><span className="demo-tag">Giai đoạn 1 · đang xây dựng</span>
      <h1>{DOW[now.getDay()]}, {now.getDate()} tháng {now.getMonth() + 1}</h1>
      <p className="sub">Chào {me.name}! {d.xom.name} có {d.families.length} gia đình, {joined} người đã vào.</p></div>
    <section className="section card">
      <h2>Bắt đầu từ đây</h2>
      <div className="list" style={{ boxShadow: 'none' }}>
        <button className="row" style={{ background: 'none', border: 0, textAlign: 'left', width: '100%' }} onClick={() => setSheet({ k: 'chibi', id: me.id })}>
          <MemberHead m={me} /><div className="grow"><div className="name">Tạo chibi cho cả nhà</div><div className="meta">Dùng ảnh thật hoặc tự chọn tóc, áo, kính</div></div></button>
        <button className="row" style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', textAlign: 'left', width: '100%' }} onClick={() => setSheet({ k: 'fam' })}>
          <FamilyHeads d={d} f={myFam} /><div className="grow"><div className="name">Hoàn thiện hồ sơ nhà mình</div><div className="meta">Ngày sinh, ngày cưới, các bé</div></div></button>
        {me.is_admin && <button className="row" style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', textAlign: 'left', width: '100%' }} onClick={() => setSheet({ k: 'invite' })}>
          <span className="av" style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>+</span><div className="grow"><div className="name">Mời các gia đình vào xóm</div><div className="meta">Tạo link mời riêng cho từng nhà</div></div></button>}
      </div>
    </section>
    {evs[0] && <section className="section"><h2>Đừng quên</h2><div className="list">{evRow(evs[0])}</div></section>}
    <section className="section">
      <h2>Sắp có</h2>
      <div className="list">
        <div className="row"><span className="pst">GĐ 2</span><div className="grow">Điểm danh, rủ kèo, đăng cai, chat</div></div>
        <div className="row"><span className="pst">GĐ 3</span><div className="grow">Miếu Thần Tài, xin xăm, thầy bói</div></div>
        <div className="row"><span className="pst">GĐ 4</span><div className="grow">Thông báo trên điện thoại</div></div>
      </div>
      <a className="btn ghost block" href="/demo/" style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>Chơi thử bản demo trong lúc chờ</a>
    </section>
  </>
  else if (tab === 'keo' || tab === 'chat') view = <>
    <h1>{tab === 'keo' ? 'Kèo của xóm' : 'Kênh chung'}</h1>
    <div className="note" style={{ marginTop: 14 }}>Phần này đang được xây ở giai đoạn 2. Trong lúc chờ, bạn có thể bấm thử ở bản demo.</div>
    <a className="btn ghost block" href="/demo/" style={{ marginTop: 14, textAlign: 'center', textDecoration: 'none', display: 'block' }}>Mở bản demo</a>
  </>
  else view = <>
    <div><h1>{d.xom.name}</h1><p className="sub">{d.families.length} gia đình · {joined} người lớn đã vào · {d.members.filter(m => m.role === 'kid').length} bạn nhỏ</p></div>
    <section className="section"><div className="section-head"><h2>Sắp tới</h2><span className="sub small">45 ngày tới</span></div>
      <div className="list">{evs.length ? evs.map(evRow) : <div className="row"><span className="sub">Chưa có ngày đặc biệt nào. Điền ngày sinh trong hồ sơ để cả xóm nhớ chúc nhé.</span></div>}</div>
    </section>
    <section className="section"><div className="section-head"><h2>Các gia đình</h2>{me.is_admin && <button className="link" onClick={() => setSheet({ k: 'invite' })}>+ Mời nhà mới</button>}</div>
      <div className="fam-grid">{[...d.families].sort((a, b) => Number(b.id === myFam.id) - Number(a.id === myFam.id)).map(f => {
        const mine = f.id === myFam.id, pend = adultsOf(d, f).filter(m => !m.user_id), kids = kidsOf(d, f)
        return <div key={f.id} className={'fam' + (mine ? ' mine' : '')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FamilyHeads d={d} f={f} sm /><div className="name">{mine ? 'Nhà mình' : famShort(d, f)}</div></div>
          {mine && <div className="meta">{famShort(d, f)}</div>}
          <div className="meta">{kids.length ? 'Bé ' + kids.map(k => k.name).join(', bé ') : 'Chưa có bé'}</div>
          {adultsOf(d, f).filter(m => m.user_id && m.phone_public && m.phone).map(m => <div key={m.id} className="meta">{m.name}: {m.phone}</div>)}
          {pend.length > 0 && <div className="pending">{pend.map(m => m.name).join(', ')} chưa vào xóm{(me.is_admin || mine) && <> · <button onClick={() => reissue(f)}>Gửi link mời</button></>}</div>}
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
      <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}><span dangerouslySetInnerHTML={{ __html: ICONS[k] }} style={{ display: 'contents' }} /><span>{l}</span></button>)}</div></nav>

    {sheet?.k === 'me' && <Sheet label="Tài khoản" onClose={close}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Chibi look={lookOf(me)} /><div><h2>{me.name}</h2><p className="sub small" style={{ margin: 0 }}>{session.user.email}</p>{me.is_admin && <span className="pst">Trưởng xóm</span>}</div></div>
      <button className="btn ghost" onClick={() => setSheet({ k: 'chibi', id: me.id })}>Sửa chibi</button>
      <button className="btn ghost" onClick={() => setSheet({ k: 'fam' })}>Sửa hồ sơ nhà mình</button>
      <button className="btn ghost" onClick={() => { localStorage.removeItem('xm-xom'); sb.auth.signOut() }}>Đăng xuất</button>
    </Sheet>}
    {sheet?.k === 'fam' && <Sheet label="Hồ sơ nhà mình" onClose={close}>
      <h2>Hồ sơ nhà mình</h2>
      <FamilyForm d={d} family={myFam} ownerId={me.id} submitLabel="Lưu hồ sơ" onDone={() => { toast('Đã lưu hồ sơ nhà mình'); close(); reload() }} />
    </Sheet>}
    {sheet?.k === 'chibi' && <Sheet label="Chibi nhà mình" onClose={close}>
      <ChibiEditor members={d.members.filter(m => m.family_id === myFam.id)} startId={sheet.id} onSaved={reload} onClose={close} />
    </Sheet>}
    {sheet?.k === 'invite' && <Sheet label="Mời gia đình mới" onClose={close}><InviteForm xomId={d.xom.id} onCode={(code, fam) => { reload(); setSheet({ k: 'link', code, fam }) }} /></Sheet>}
    {sheet?.k === 'link' && <Sheet label="Link mời" onClose={close}><LinkBox code={sheet.code} fam={sheet.fam} xom={d.xom.name} /></Sheet>}
  </div>
}

function InviteForm({ xomId, onCode }: { xomId: string; onCode: (code: string, fam: string) => void }) {
  const toast = useToast()
  const [a, setA] = useState(''), [b, setB] = useState(''), [k, setK] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const { data, error } = await sb.rpc('invite_family', { p_xom: xomId, p_adults: [a.trim(), b.trim()].filter(Boolean), p_kids: k.split(',').map(s => s.trim()).filter(Boolean) })
    setBusy(false)
    if (error) toast(errText(error)); else onCode(data as string, [a.trim(), b.trim()].filter(Boolean).join(' & '))
  }
  return <form className="stackf" onSubmit={submit}>
    <h2>Mời một gia đình mới</h2>
    <p className="sub small" style={{ margin: 0 }}>Điền những gì bạn biết. Vợ chồng nhà đó sẽ tự sửa và bổ sung khi vào bằng link.</p>
    <div className="two"><label className="f">Tên chồng<input required maxLength={40} value={a} onChange={e => setA(e.target.value)} placeholder="VD: Hùng" /></label>
      <label className="f">Tên vợ<input maxLength={40} value={b} onChange={e => setB(e.target.value)} placeholder="VD: Lan" /></label></div>
    <label className="f">Tên các bé, cách nhau bằng dấu phẩy<input maxLength={120} value={k} onChange={e => setK(e.target.value)} placeholder="VD: Su" /></label>
    <button className="btn" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo link mời'}</button>
  </form>
}

function LinkBox({ code, fam, xom }: { code: string; fam: string; xom: string }) {
  const toast = useToast()
  const url = inviteUrl(code)
  const msg = `Mời nhà ${fam} vào ${xom} của hội mình nhé! Bấm link, chọn tên mình là xong: ${url}`
  async function share() {
    if (navigator.share) { try { await navigator.share({ text: msg }); return } catch { /* người dùng huỷ */ } }
    toast(await copyText(msg) ? 'Đã sao chép, dán vào Zalo là xong' : 'Bấm giữ đoạn chữ để sao chép')
  }
  return <>
    <h2>Link mời nhà {fam}</h2>
    <p className="sub small" style={{ margin: 0 }}>Link riêng cho nhà này, dùng được cho 2 người lớn, hết hạn sau 7 ngày ({dm(new Date(Date.now() + 7 * 864e5))}).</p>
    <div className="linkbox">{msg}</div>
    <button className="btn" onClick={share}>Gửi lời mời</button>
    <button className="btn ghost" onClick={async () => toast(await copyText(url) ? 'Đã sao chép link' : 'Bấm giữ link để sao chép')}>Chỉ sao chép link</button>
  </>
}
