import { useEffect, useMemo, useRef, useState } from 'react'
import { sb, errText } from './supabase'
import { dayKey } from './live'
import { lookOf, adultsOf, kidsOf, DOW, dm } from './util'
import { toLunar, findLunar, lunarName } from './lunar'
import { MemberHead, Sheet, useToast } from './ui'
import { ty } from './consts'
import type { Ctx } from './Activity'
import {
  gateSVG, altarGroup, sceneHTML, sceneCast, gx, showSay, startChatter, npcSVG, isLe, LV, XAM, TOPICS, TPOOL, tubeSVG,
  CHI, MAU, HUONG, tuoi, VAN, NEN, TRANH, THANG, dayInfo, hourChi, relate, PRAYER, setTempleData, type Off,
} from './temple'
import { hash, chibiSVG, chibiBackSVG } from './chibi'
import { callAI } from './ai'

const OFFER = [{ k: 'hoa', t: 'Hoa tươi' }, { k: 'qua', t: 'Mâm ngũ quả' }, { k: 'nuoc', t: 'Chén trà' }, { k: 'vang', t: 'Thỏi vàng' }]
const hm = (t: Date) => t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0')

function litFamilies(c: Ctx) {
  const famOf = new Map(c.d.members.map(m => [m.id, m.family_id]))
  return [...new Set(c.live.altar.map(a => famOf.get(a.member_id)).filter(Boolean))] as string[]
}

export function GateCard({ c, enter }: { c: Ctx; enter: () => void }) {
  const now = new Date(), n = findLunar(now, l => l.d === 1 || l.d === 15)
  const fest = !!n && n.days <= 1, iLit = c.live.altar.some(a => a.member_id === c.me.id)
  const lbl = (x: number) => x === 1 ? 'mùng 1' : 'rằm'
  const when = !n ? '' : n.days === 0 ? 'Hôm nay là ' + lbl(n.l.d) : n.days === 1 ? 'Mai là ' + lbl(n.l.d) : 'Còn ' + n.days + ' ngày đến ' + lbl(n.l.d)
  return <button className={'gate' + (fest ? ' fest' : '')} onClick={enter}>
    <span dangerouslySetInnerHTML={{ __html: gateSVG() }} style={{ display: 'contents' }} />
    <span className="grow"><b>Miếu Thần Tài của Xóm</b>
      <span className="g-meta">{litFamilies(c).length}/{c.d.families.length} nhà đã thắp hương hôm nay · {when}</span>
      <span className="g-thay">Thầy phán: {THANG[toLunar(now).m]}</span>
      <span className="go">{iLit ? 'Vào miếu' : 'Vào thắp hương'} ›</span></span>
  </button>
}

export function Temple({ c, enter, back }: { c: Ctx; enter: boolean; back: () => void }) {
  const toast = useToast()
  const host = useRef<HTMLDivElement>(null)
  const anim = useRef<string[] | null>(null)
  const [doors, setDoors] = useState(enter)
  const [sheet, setSheet] = useState<null | 'light' | 'xam' | 'thay'>(null)
  const famOf = useMemo(() => new Map(c.d.members.map(m => [m.id, m.family_id])), [c.d.members])

  // Dữ liệu cho phần vẽ sân miếu
  const offs: Off[] = c.live.altar.filter(a => famOf.has(a.member_id)).map(a => ({ member_id: a.member_id, family_id: famOf.get(a.member_id)!, offerings: a.offerings }))
  setTempleData(offs, new Map(c.d.families.map(f => [f.id, kidsOf(c.d, f).map(k => k.id)])), new Map(c.d.members.map(m => [m.id, { name: m.name, look: lookOf(m) }])))

  const paint = () => {
    const el = host.current; if (!el) return
    const prev = el.querySelector<HTMLElement>('#scene-scroll')?.scrollLeft
    el.innerHTML = sceneHTML(anim.current || [], doors)
    const scr = el.querySelector<HTMLElement>('#scene-scroll')!
    scr.scrollLeft = prev ?? (scr.scrollWidth - scr.clientWidth) / 2
    startChatter()
  }
  // Vẽ lại sân khi có người thắp hương (trừ lúc đang diễn hoạt cảnh của mình)
  useEffect(() => { if (!anim.current) paint() }, [c.live.altar, c.d.members]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (doors) { const t = setTimeout(() => setDoors(false), 1600); return () => clearTimeout(t) } }, [doors])

  function onSceneClick(e: React.MouseEvent) {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return
    const act = b.dataset.act
    if (act === 'pan') { const scr = host.current!.querySelector<HTMLElement>('#scene-scroll')!; scr.scrollTo({ left: b.dataset.x === '0' ? 0 : scr.scrollWidth, behavior: 'smooth' }) }
    else if (act === 'npc') setSheet(b.dataset.k === 'tu' ? 'xam' : 'thay')
    else if (act === 'char') {
      const m = c.d.members.find(x => x.id === b.dataset.p); if (!m) return
      const off = c.live.altar.find(a => a.member_id === m.id), w = off && c.live.wishes.find(x => x.offering_id === off.id)
      showSay(b, m.role === 'kid' ? 'Bé ' + m.name + ' đi lễ cùng bố mẹ' : w ? m.name + ': "' + w.wish + '"' : m.name + (off ? ' đã thắp hương lúc ' + hm(new Date(off.created_at)) : ''))
    }
  }

  // Hoạt cảnh: mình (và các bé) đi vào, vái 3 vái, cắm hương, lùi về sân
  function playLight(ids: string[], _offs?: string[]) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { anim.current = null; paint(); return }
    anim.current = ids; paint(); scrollTo(0, 0)
    const scr = host.current!.querySelector<HTMLElement>('#scene-scroll')!
    scr.scrollLeft = (scr.scrollWidth - scr.clientWidth) / 2
    const sc = host.current!.querySelector<HTMLElement>('#scene')!
    const els = ids.map((id, i) => {
      const m = c.d.members.find(x => x.id === id)!, d = document.createElement('div')
      d.className = 'ch walking moving' + (i > 0 ? ' kid' : ''); d.style.left = gx(-8 - i * 7) + '%'; d.style.bottom = (i ? 5 : 8) + '%'; d.style.zIndex = String(150 - i)
      d.innerHTML = chibiSVG(lookOf(m)); sc.appendChild(d); return d
    })
    const alive = () => host.current?.querySelector('#scene') === sc
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((d, i) => { d.style.setProperty('--t', '2.4s'); d.style.left = gx(i === 0 ? 50 : i % 2 ? 41 - i : 59 + i) + '%'; d.style.bottom = (i === 0 ? 27 : 24) + '%' })))
    const looks = ids.map(id => lookOf(c.d.members.find(x => x.id === id)!))
    // Quay mặt vào ban thờ: đổi sang dáng sau lưng, cầm hương, vái 3 vái
    setTimeout(() => { if (!alive()) return; els.forEach((d, i) => { d.classList.remove('walking'); d.innerHTML = chibiBackSVG(looks[i]); d.classList.add('bowing', 'back') }) }, 2500)
    setTimeout(() => { if (!alive()) return; els.forEach((d, i) => { d.classList.remove('bowing', 'back'); d.innerHTML = chibiSVG(looks[i]) }); const g = sc.querySelector('#altar-g'); if (g) g.innerHTML = altarGroup([]); toast('🙏 Nén hương đã thắp. Cầu cho nhà mình bình an, may mắn!') }, 5000)
    setTimeout(() => { if (!alive()) return; const cast = sceneCast([]); els.forEach((d, i) => { const ct = cast.find((x: { pid: string }) => x.pid === ids[i]); if (!ct) return; d.style.setProperty('--t', '1.4s'); d.classList.add('walking'); d.style.left = ct.x + '%'; d.style.bottom = ct.b + '%' }) }, 5400)
    setTimeout(() => { anim.current = null; if (alive()) paint() }, 6900)
  }

  const now = new Date(), L = toLunar(now)
  const myOff = c.live.altar.find(a => a.member_id === c.me.id)
  const spouseOff = !myOff && c.live.altar.find(a => famOf.get(a.member_id) === c.myFam.id)
  const n1 = findLunar(now, l => l.d === 1), n15 = findLunar(now, l => l.d === 15), ntt = findLunar(now, l => l.d === 10 && l.m === 1 && !l.leap)
  const fests = ([['Mùng 1 tháng ' + n1?.l.m, n1], ['Rằm tháng ' + n15?.l.m, n15], ['Vía Thần Tài (mùng 10 tháng Giêng)', ntt]] as const).filter(f => f[1]).sort((a, b) => a[1]!.days - b[1]!.days)
  const litPeople = c.live.altar.map(a => c.d.members.find(m => m.id === a.member_id)).filter(Boolean)
  const wishes = c.live.wishes.filter(w => c.d.members.some(m => m.id === w.member_id))

  return <>
    <button className="back" onClick={back}>‹ Ra khỏi miếu</button>
    <div><h1>Miếu Thần Tài</h1><p className="sub">Miếu chung của cả xóm. Ai thắp hương hôm nay sẽ đứng trong sân, bấm vào từng người để xem lời nguyện. Vuốt ngang để gặp Ông Từ và Thầy Lộc.</p></div>
    <div style={{ position: 'relative' }}>
      <div ref={host} onClick={onSceneClick} />
      {doors && <div className="doors" aria-hidden="true" style={{ borderRadius: 20, top: 14 }}><i /><i /></div>}
    </div>
    <div className="lunar"><div className="moon">{L.d}</div><div><b>{lunarName(L)} âm lịch</b>
      {fests[0] && <div className="meta">{fests[0][1]!.days === 0 ? 'Hôm nay là ' + fests[0][0].toLowerCase() : 'Còn ' + fests[0][1]!.days + ' ngày đến ' + fests[0][0].toLowerCase()}</div>}</div></div>
    <section className="section">
      {myOff ? <div className="note">🙏 {c.me.name} đã thắp hương lúc {hm(new Date(myOff.created_at))}. Thành tâm là đủ, mai lại thắp tiếp nhé.</div>
        : <>{spouseOff && <div className="note">{c.d.members.find(m => m.id === spouseOff.member_id)?.name} đã thắp cho nhà mình lúc {hm(new Date(spouseOff.created_at))}. {c.me.name} vẫn có thể thắp thêm.</div>}
          <button className="btn sun block" onClick={() => setSheet('light')}>Thắp hương</button></>}
      <div className="two"><button className="btn ghost" onClick={() => setSheet('xam')}>🎋 Xin xăm</button><button className="btn ghost" onClick={() => setSheet('thay')}>🔮 Thầy Lộc</button></div>
      <div className="list"><div className="row"><span className="stack">{litPeople.slice(0, 7).map(m => <MemberHead key={m!.id} m={m!} sm />)}</span>
        <div className="grow"><b>{litFamilies(c).length}/{c.d.families.length} nhà</b> <span className="meta">đã thắp hương hôm nay</span></div></div></div>
    </section>
    <section className="section"><h2>Lời nguyện hôm nay</h2>
      <div className="list">{wishes.length ? wishes.map(w => { const m = c.d.members.find(x => x.id === w.member_id)!
        return <div className="row" key={w.offering_id}><MemberHead m={m} sm /><div className="grow"><div>{w.wish}</div><div className="meta">{m.name}{w.private ? ' · chỉ mình bạn thấy' : ''}</div></div></div> })
        : <div className="row"><span className="sub">Chưa có lời nguyện nào được chia sẻ.</span></div>}</div>
    </section>
    <section className="section"><h2>Ngày lễ sắp tới</h2>
      <div className="list">{fests.map(([name, x]) => <div className="row" key={name}><div className="date"><b>{x!.date.getDate()}</b><small>th {x!.date.getMonth() + 1}</small></div>
        <div className="grow"><div className="name">{name}</div><div className="meta">{DOW[x!.date.getDay()]} · {x!.days === 0 ? 'hôm nay' : 'còn ' + x!.days + ' ngày'}</div></div></div>)}</div>
    </section>
    <section className="section"><details className="prayer"><summary>Văn khấn Thần Tài – Thổ Địa (tham khảo)</summary><p>{PRAYER}</p></details>
      <p className="sub small">Xóm Mình chỉ là nơi kết nối tinh thần, không nhận bất kỳ khoản công đức hay tiền lễ nào.</p></section>

    {sheet === 'light' && <LightSheet c={c} onClose={() => setSheet(null)} onLit={offs => {
      setSheet(null)
      const already = c.live.altar.some(a => a.member_id !== c.me.id && famOf.get(a.member_id) === c.myFam.id)
      playLight([c.me.id, ...(already ? [] : kidsOf(c.d, c.myFam).map(k => k.id))], offs); c.reload()
    }} />}
    {sheet === 'xam' && <XamSheet c={c} onClose={() => setSheet(null)} />}
    {sheet === 'thay' && <ThaySheet c={c} onClose={() => setSheet(null)} />}
  </>
}

function LightSheet({ c, onClose, onLit }: { c: Ctx; onClose: () => void; onLit: (offerings: string[]) => void }) {
  const toast = useToast()
  const [off, setOff] = useState(['hoa', 'qua']), [wish, setWish] = useState(''), [priv, setPriv] = useState(false), [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const { data, error } = await sb.from('altar_offerings').insert({ xom_id: c.d.xom.id, member_id: c.me.id, day: dayKey(), offerings: off }).select('id').single()
    if (!error && wish.trim()) await sb.from('altar_wishes').insert({ offering_id: data.id, xom_id: c.d.xom.id, member_id: c.me.id, wish: wish.trim(), private: priv })
    setBusy(false)
    if (error) toast(/duplicate|unique/i.test(error.message) ? 'Hôm nay bạn đã thắp hương rồi' : errText(error)); else onLit(off)
  }
  return <Sheet label="Thắp hương" onClose={onClose}><h2>Thắp hương</h2><p className="sub small" style={{ margin: 0 }}>Nén hương của {c.me.name} sẽ cắm lên ban thờ chung của xóm.</p>
    <form className="stackf" onSubmit={submit}>
      <div><div className="group-title" style={{ marginBottom: 8 }}>Dâng lễ</div>
        <div className="chips">{OFFER.map(o => <button type="button" key={o.k} className="chip" aria-pressed={off.includes(o.k)} onClick={() => setOff(off.includes(o.k) ? off.filter(x => x !== o.k) : [...off, o.k])}>{o.t}</button>)}</div></div>
      <label className="f">Lời nguyện (không bắt buộc)<textarea rows={3} maxLength={200} value={wish} onChange={e => setWish(e.target.value)} placeholder="VD: Cầu cho cả nhà mạnh khoẻ, công việc thuận lợi" /></label>
      <label className="check"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} /> Chỉ mình tôi thấy lời nguyện này</label>
      <button className="btn sun" type="submit" disabled={busy}>🙏 Thắp hương</button>
    </form></Sheet>
}

function NpcHead({ k, name, line }: { k: 'tu' | 'thay'; name: string; line: string }) {
  return <div className="npc-head"><div className="npc-face" dangerouslySetInnerHTML={{ __html: npcSVG(k) }} /><div><b>{name}</b><div className="npc-line">{line}</div></div></div>
}
function LaXam({ n, topic }: { n: number; topic: string }) {
  const q = XAM[n - 1], lv = q[0] as number, tp = TOPICS.find((t: string[]) => t[0] === topic) || TOPICS[0]
  return <div className={'lx lv' + lv}><div className="lx-h"><span>Quẻ số {n}</span><b>{LV[lv]}</b></div>
    <div className="lx-poem">{(q[1] as string[]).map((l, i) => <span key={i}>{l}<br /></span>)}</div>
    <dl><dt>Ý quẻ</dt><dd>{q[2]}</dd>{topic !== 'chung' && <><dt>Về {tp[1].toLowerCase()}</dt><dd>{(TPOOL as Record<string, string[][]>)[topic][lv][n % 3]}</dd></>}<dt>Lời khuyên</dt><dd>{q[3]}</dd></dl>
    <p className="lx-note">Xin xăm cho vui, tham khảo thôi nhé.</p></div>
}

function XamSheet({ c, onClose }: { c: Ctx; onClose: () => void }) {
  const toast = useToast()
  const done = c.live.myXam
  const [step, setStep] = useState<'intro' | 'ask' | 'shake' | 'fell' | 'keo' | 'result'>(done ? 'result' : isLe() ? 'ask' : 'intro')
  const [topic, setTopic] = useState(done?.topic || 'chung')
  const [n, setN] = useState<number>(done?.n || 0)
  const [keo, setKeo] = useState<null | 'flip' | 'ok' | 'cuoi' | 'am'>(null)
  const tries = useRef(0)
  const [shared, setShared] = useState(!!done?.shared)
  const next = findLunar(new Date(), l => l.d === 1 || l.d === 15)
  function shake() { setStep('shake'); setTimeout(() => { setN(1 + Math.floor(Math.random() * XAM.length)); setStep('fell') }, 1900) }
  function gieo() { setStep('keo'); setKeo('flip'); setTimeout(() => { tries.current++; const r = Math.random(); setKeo(tries.current >= 3 || r < .5 ? 'ok' : r < .75 ? 'cuoi' : 'am') }, 1100) }
  async function read() {
    const { error } = await sb.from('xam_draws').insert({ xom_id: c.d.xom.id, member_id: c.me.id, day: dayKey(), n, topic })
    if (error && !/duplicate|unique/i.test(error.message)) { toast(errText(error)); return }
    setStep('result'); c.reload()
  }
  async function share() {
    const q = XAM[n - 1]
    const r = await sb.from('messages').insert({ xom_id: c.d.xom.id, member_id: c.me.id, body: `🎋 Mình vừa xin được quẻ số ${n} · ${LV[q[0] as number]}: "${(q[1] as string[])[0]}…"` })
    if (r.error) { toast(errText(r.error)); return }
    await sb.from('xam_draws').update({ shared: true }).eq('member_id', c.me.id).eq('day', dayKey())
    setShared(true); toast('Đã khoe quẻ lên kênh chung'); c.reload()
  }
  const coin = (i: number) => <span className={'coin ' + (keo === 'ok' ? (i ? 'up' : 'down') : keo === 'am' ? 'down' : 'up')}><i /></span>
  const keoLine = keo === 'ok' ? 'Một sấp một ngửa: Thần đã đồng ý. Ông đọc quẻ cho con nhé!' : keo === 'cuoi' ? 'Hai mặt ngửa: Thần đang cười, con gieo lại nhé.' : keo === 'am' ? 'Hai mặt sấp: chưa được, con thành tâm gieo lại.' : 'Đồng xu đang lật…'
  let body
  if (step === 'intro') body = <><NpcHead k="tu" name="Ông Từ" line={`Xin xăm nên đợi ${next?.l.d === 1 ? 'mùng 1' : 'ngày rằm'} cho linh con ạ. Còn ${next?.days} ngày nữa, ${next ? DOW[next.date.getDay()] + ' ' + dm(next.date) : ''}.`} />
    <button className="btn ghost" onClick={() => setStep('ask')}>Con vẫn muốn xin hôm nay</button><button className="btn ghost" onClick={onClose}>Để hôm khác</button></>
  else if (step === 'ask') body = <><NpcHead k="tu" name="Ông Từ" line="Con muốn hỏi chuyện gì? Chọn rồi thành tâm khấn trong lòng nhé." />
    <div className="chips">{TOPICS.map(([k, t]: string[]) => <button key={k} className="chip" aria-pressed={topic === k} onClick={() => setTopic(k)}>{t}</button>)}</div>
    <div className="tube-box" dangerouslySetInnerHTML={{ __html: tubeSVG() }} /><button className="btn sun" onClick={shake}>Lắc ống xăm</button></>
  else if (step === 'shake') body = <><NpcHead k="tu" name="Ông Từ" line="Lắc đều tay… que nào tự rơi ra là quẻ của con." /><div className="tube-box"><div className="shaking" dangerouslySetInnerHTML={{ __html: tubeSVG() }} /></div></>
  else if (step === 'fell' || step === 'keo') body = <><NpcHead k="tu" name="Ông Từ" line={step === 'fell' ? `Que số ${n} rơi ra rồi! Giờ gieo keo xem Thần có đồng ý không.` : keoLine} />
    <div className="tube-box"><div className="stick-fell"><span>{n}</span></div><div className={'coins' + (keo === 'flip' ? ' flip' : '')}>{coin(0)}{coin(1)}</div></div>
    {keo === 'ok' ? <button className="btn sun" onClick={read}>Xem lá xăm</button> : keo === 'flip' ? null : <button className="btn sun" onClick={gieo}>{keo ? 'Gieo lại' : 'Gieo keo'}</button>}</>
  else body = <><NpcHead k="tu" name="Ông Từ" line={done ? 'Hôm nay con đã xin quẻ rồi, mỗi ngày một quẻ thôi nhé. Đây là quẻ của con:' : 'Quẻ của con đây, ông giải cho nghe:'} />
    <LaXam n={n} topic={topic} />
    {shared ? <p className="sub small" style={{ margin: 0 }}>Đã khoe lên kênh chung.</p> : <button className="btn" onClick={share}>Khoe quẻ lên kênh chung</button>}
    <button className="btn ghost" onClick={onClose}>Xong</button></>
  return <Sheet label="Xin xăm" onClose={onClose}><div className="npc-sheet">{body}</div></Sheet>
}

function ThaySheet({ c, onClose }: { c: Ctx; onClose: () => void }) {
  const toast = useToast()
  const spouse = adultsOf(c.d, c.myFam).find(m => m.id !== c.me.id)
  const [tab, setTab] = useState<'van' | 'tuoi' | 'ngay' | 'hoi'>('van')
  const [a, setA] = useState(c.me.id), [b, setB] = useState(spouse?.id || ''), [shown, setShown] = useState(false)
  const [keoId, setKeoId] = useState<string | null>(null), [date, setDate] = useState(dayKey())
  const tabs = <div className="seg seg4" role="group" aria-label="Chọn việc nhờ thầy">{([['hoi', 'Hỏi thầy'], ['van', 'Vận'], ['tuoi', 'Tuổi'], ['ngay', 'Ngày']] as const).map(([k, t]) =>
    <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setShown(false) }}>{t}</button>)}</div>
  let body
  if (tab === 'hoi') body = <><NpcHead k="thay" name="Thầy Lộc" line="Con muốn hỏi chuyện gì? Công việc, gia đạo, chọn quà, đặt tên con… cứ hỏi, thầy phán cho vui!" />{tabs}<AskThay c={c} /></>
  else if (tab === 'van') {
    const t = tuoi(c.me.dob)
    if (!t) body = <><NpcHead k="thay" name="Thầy Lộc" line={`${c.me.name} chưa khai ngày sinh, thầy chưa xem được. Điền vào hồ sơ nhà mình nhé.`} />{tabs}</>
    else { const hs = hash(c.me.id + dayKey()), star = [2, 3, 3, 4, 4, 4, 5, 5][hs % 8]
      body = <><NpcHead k="thay" name="Thầy Lộc" line={`${c.me.name} tuổi ${t.can} ${t.chi} (tuổi con ${t.con.toLowerCase()}), mệnh ${t.menh}. Để thầy bấm đốt ngón tay…`} />{tabs}
        <div className="lx"><div className="lx-h"><span>Vận hôm nay · {dm(new Date())}</span><b className="stars" aria-label={star + ' trên 5 sao'}>{'★'.repeat(star)}{'☆'.repeat(5 - star)}</b></div>
          <p className="lx-say">“{(VAN as Record<number, string[]>)[star][(hs >> 3) % 3]}”</p>
          <dl><dt>Màu may mắn</dt><dd>{(MAU as Record<string, string[]>)[t.menh][hs % 3]}</dd><dt>Số may mắn</dt><dd>{(hs >> 5) % 90 + 10}</dd><dt>Hướng tốt</dt><dd>{(HUONG as Record<string, string>)[t.menh]}</dd>
            <dt>Nên</dt><dd>{NEN[(hs >> 7) % NEN.length]}</dd><dt>Tránh</dt><dd>{TRANH[(hs >> 9) % TRANH.length]}</dd></dl>
          <p className="lx-note">Thầy phán cho vui, tham khảo thôi nhé. Mai xem lại sẽ khác.</p></div></> }
  } else if (tab === 'tuoi') {
    const ppl = c.d.members.filter(m => m.dob && (m.role === 'kid' || m.user_id))
    const opt = ppl.map(p => <option key={p.id} value={p.id}>{p.role === 'kid' ? 'Bé ' + p.name : p.name}</option>)
    const pa = c.d.members.find(m => m.id === a), pb = c.d.members.find(m => m.id === b), ta = pa && tuoi(pa.dob), tb = pb && tuoi(pb.dob)
    const r = shown && ta && tb && a !== b ? relate(ta, tb) : null
    body = <><NpcHead k="thay" name="Thầy Lộc" line="Chọn hai người, thầy xem có hợp tuổi không. Vợ chồng, bạn nhậu hay thông gia tương lai đều được!" />{tabs}
      {ppl.length < 2 ? <p className="sub small">Cần ít nhất 2 người đã điền ngày sinh trong hồ sơ.</p> : <>
        <div className="two"><label className="f">Người thứ nhất<select value={a} onChange={e => { setA(e.target.value); setShown(false) }}><option value="">Chọn…</option>{opt}</select></label>
          <label className="f">Người thứ hai<select value={b} onChange={e => { setB(e.target.value); setShown(false) }}><option value="">Chọn…</option>{opt}</select></label></div>
        <button className="btn" onClick={() => setShown(true)}>Nhờ thầy xem</button>
        {shown && !r && <p className="sub small">Chọn hai người khác nhau, đã có ngày sinh nhé.</p>}
        {r && pa && pb && ta && tb && <><div className="lx"><div className="lx-h"><span>{pa.name} & {pb.name}</span><b>{r.s >= 2 ? 'Hợp' : r.s >= 0 ? 'Bình hoà' : 'Hơi khắc'}</b></div>
          <dl><dt>{pa.name}</dt><dd>{ta.can} {ta.chi} · mệnh {ta.menh}</dd><dt>{pb.name}</dt><dd>{tb.can} {tb.chi} · mệnh {tb.menh}</dd><dt>Địa chi</dt><dd>{r.c}</dd><dt>Ngũ hành</dt><dd>{r.m}</dd></dl>
          <p className="lx-say">“{r.v}”</p><p className="lx-note">Xem tuổi cho vui, tình cảm là do mình vun đắp.</p></div>
          <button className="btn ghost" onClick={async () => { const x = await sb.from('messages').insert({ xom_id: c.d.xom.id, member_id: c.me.id, body: `🔮 Thầy Lộc phán: ${pa.name} & ${pb.name} ${r.c}, mệnh ${r.m}. ${r.v}` }); if (x.error) toast(errText(x.error)); else { toast('Đã khoe lên kênh chung'); c.reload() } }}>Khoe lên kênh chung</button></>}
      </>}</>
  } else {
    const [y, mo, dd] = date.split('-').map(Number), dt = new Date(y, mo - 1, dd, 12), I = dayInfo(dt), k = keoId ? c.live.keos.find(x => x.id === keoId) : null
    const kh = k && new Date(k.at).getHours()
    body = <><NpcHead k="thay" name="Thầy Lộc" line="Hẹn kèo ngày nào, thầy xem ngày tốt giờ đẹp cho." />{tabs}
      {c.live.keos.length > 0 && <div className="chips">{c.live.keos.map(x => <button key={x.id} className="chip" aria-pressed={keoId === x.id} onClick={() => { setKeoId(x.id); setDate(dayKey(new Date(x.at))) }}>{ty(x.type).e} {x.title}</button>)}</div>}
      <label className="f">Hoặc chọn ngày<input type="date" value={date} onChange={e => { if (e.target.value) { setDate(e.target.value); setKeoId(null) } }} /></label>
      <div className="lx"><div className="lx-h"><span>{DOW[dt.getDay()]} {dm(dt)} · {lunarName(I.l).replace('Ngày ', '')} âm</span><b>{I.good ? 'Hoàng đạo' : 'Hắc đạo'}</b></div>
        <dl><dt>Ngày</dt><dd>{I.can} {I.chi} · sao {I.than}</dd><dt>Giờ đẹp</dt><dd>{I.hours.filter((x: { good: boolean }) => x.good).map((x: { c: string; from: number; to: number }) => `${x.c} (${x.from}–${x.to}h)`).join(', ')}</dd>
          {k && kh != null && <><dt>Giờ hẹn</dt><dd>{hm(new Date(k.at))} là giờ {CHI[hourChi(kh)]}: {I.hours[hourChi(kh)].good ? 'giờ hoàng đạo, đẹp!' : 'không phải giờ hoàng đạo, nhưng đi cafe thì thầy cho qua.'}</dd></>}</dl>
        <p className="lx-say">“{I.good ? 'Ngày đẹp, hẹn hò gặp gỡ đều thuận. Chốt kèo đi!' : 'Ngày hắc đạo, việc lớn để hôm khác, còn đi cà phê với bạn thì cứ chọn giờ đẹp là ổn.'}”</p>
        <p className="lx-note">Tính theo lịch âm và cách xem ngày truyền thống, tham khảo cho vui.</p></div></>
  }
  return <Sheet label="Thầy Lộc" onClose={onClose}><div className="npc-sheet">{body}</div></Sheet>
}

type Chat = { role: 'user' | 'assistant'; content: string }
function AskThay({ c }: { c: Ctx }) {
  const key = 'xm-thay-' + c.me.id
  const [msgs, setMsgs] = useState<Chat[]>(() => { try { return JSON.parse(sessionStorage.getItem(key) || '[]') } catch { return [] } })
  const [v, setV] = useState(''), [busy, setBusy] = useState(false), [left, setLeft] = useState<number | null>(null), [err, setErr] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(msgs.slice(-20))) } catch { /* bỏ qua */ } end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs, key])
  const t = tuoi(c.me.dob), L = toLunar(new Date())
  const ctx = `Tên: ${c.me.name}. ${t ? `Tuổi ${t.can} ${t.chi} (con ${t.con.toLowerCase()}), mệnh ${t.menh}.` : 'Chưa rõ ngày sinh.'} Hôm nay ${lunarName(L)} âm lịch, ${DOW[new Date().getDay()]} ${dm(new Date())}.`
  async function send(e: React.FormEvent) {
    e.preventDefault(); const q = v.trim(); if (!q || busy) return
    const next = [...msgs, { role: 'user' as const, content: q }]; setMsgs(next); setV(''); setBusy(true); setErr('')
    try { const r = await callAI<{ reply: string; left: number }>('/api/thay-ai', { xom_id: c.d.xom.id, messages: next.slice(-10), ctx }); setMsgs([...next, { role: 'assistant', content: r.reply }]); setLeft(r.left) }
    catch (x) { setErr((x as Error).message); setMsgs(msgs) ; setV(q) }
    setBusy(false)
  }
  return <>
    <div className="thread">{msgs.map((m, i) => <div key={i} className={'msg' + (m.role === 'user' ? ' me' : '')}>
      {m.role === 'assistant' && <div className="npc-face mini" dangerouslySetInnerHTML={{ __html: npcSVG('thay') }} />}
      <div className="bubble">{m.role === 'assistant' && <span className="by">Thầy Lộc</span>}{m.content}</div></div>)}
      {busy && <div className="msg"><div className="npc-face mini" dangerouslySetInnerHTML={{ __html: npcSVG('thay') }} /><div className="bubble">Để thầy bấm đốt ngón tay…</div></div>}
      <div ref={end} /></div>
    {err && <div className="note">{err}</div>}
    <form className="composer" style={{ position: 'static' }} onSubmit={send}>
      <input aria-label="Câu hỏi cho thầy" maxLength={300} value={v} onChange={e => setV(e.target.value)} placeholder="VD: Tháng này con có nên đổi việc?" />
      <button type="submit" disabled={busy}>Hỏi</button></form>
    <p className="lx-note" style={{ margin: 0 }}>Thầy Lộc là AI, phán cho vui thôi nhé.{left != null ? ` Hôm nay còn ${left} câu hỏi.` : ''}</p>
  </>
}
