import { useEffect, useRef } from 'react'
import type { Family, Member } from './supabase'
import { chibiSVG } from './chibi'
import { FREE, STATUS, st } from './consts'
import { FamilyHeads, MemberHead, Sheet, useToast } from './ui'
import { adultsOf, dayDiff, famShort, hueOf, kidsOf, lookOf, upcoming } from './util'
import { toLunar, findLunar } from './lunar'
import { gateSVG } from './temple'
import { saveCheckin, type Ctx } from './Activity'
import { DECOR, EARN, banyanSVG, decorOf, treeStage } from './decor'
import { sb, errText } from './supabase'
import { useState } from 'react'

// Phố xóm: mỗi gia đình một ngôi nhà, ai đã điểm danh thì đứng trước cửa.
// Đầu phố là quán (kèo hôm nay), cuối phố là miếu.

const MOON = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']

function skyOf(h: number) {
  if (h >= 5 && h < 7) return 'dawn'
  if (h >= 7 && h < 17) return 'day'
  if (h >= 17 && h < 19) return 'dusk'
  return 'night'
}

function houseSVG(hue: number, open: boolean, night: boolean, roofHue = hue, lights = false) {
  const roof = `hsl(${roofHue} 62% 48%)`, eave = `hsl(${roofHue} 55% 34%)`, wall = `hsl(${hue} 40% 93%)`, door = `hsl(${hue} 30% 34%)`
  const win = night || open ? '#FFD66B' : '#A9D3E3'
  const w = (x: number) => `<rect x="${x}" y="64" width="24" height="20" rx="3" fill="${win}" stroke="${eave}" stroke-width="2"/>
    <path d="M${x + 12} 64v20M${x} 74h24" stroke="${eave}" stroke-width="1.5"/>`
  return `<svg viewBox="0 0 140 112" aria-hidden="true">
    <rect x="96" y="12" width="12" height="26" fill="#9B6B55"/>
    ${open ? '<g class="smoke"><circle cx="102" cy="6" r="4"/><circle cx="106" cy="-2" r="5"/></g>' : ''}
    <rect x="12" y="52" width="116" height="60" fill="${wall}"/>
    <polygon points="2,54 70,8 138,54" fill="${roof}"/>
    <rect x="0" y="50" width="140" height="8" rx="3" fill="${eave}"/>
    <circle cx="70" cy="34" r="7" fill="${wall}" stroke="${eave}" stroke-width="2"/>
    ${lights ? `<g class="lights">${[8, 22, 36, 50, 64, 78, 92, 106, 120, 134].map((x, i) => `<circle cx="${x}" cy="${60 + (i % 2) * 2}" r="2.6" fill="${['#FF5A5A', '#FFD23F', '#4ADE80', '#60A5FA'][i % 4]}"/>`).join('')}</g>` : ''}
    ${w(22)}${w(94)}
    ${open
      ? `<rect x="56" y="72" width="28" height="40" rx="4" fill="#FFC96B"/><rect x="56" y="72" width="7" height="40" fill="${door}"/>`
      : `<rect x="56" y="72" width="28" height="40" rx="4" fill="${door}"/><circle cx="78" cy="93" r="2" fill="#F2C230"/>`}
    <circle cx="14" cy="106" r="8" fill="#5E9B3C"/><circle cx="126" cy="106" r="8" fill="#5E9B3C"/>
    <circle cx="10" cy="102" r="2" fill="#F08A8A"/><circle cx="130" cy="101" r="2" fill="#F2C230"/>
  </svg>`
}

const KIOSK = `<svg viewBox="0 0 120 112" aria-hidden="true">
  <rect x="14" y="44" width="92" height="68" fill="#F6E7CF"/>
  <path d="M6 30h108l-6 18H12z" fill="#E8962A"/>
  <path d="M18 30l-4 18M38 30l-2 18M58 30v18M78 30l2 18M98 30l4 18" stroke="#fff" stroke-width="7" opacity=".85"/>
  <rect x="10" y="12" width="100" height="20" rx="5" fill="#7A4A06"/>
  <text x="60" y="26" text-anchor="middle" font-size="11" font-weight="800" fill="#FCEFD9" font-family="system-ui">QUÁN GÓC PHỐ</text>
  <rect x="22" y="58" width="76" height="26" rx="3" fill="#FFD66B" opacity=".75"/>
  <rect x="14" y="84" width="92" height="8" fill="#B07A3F"/>
  <rect x="30" y="66" width="10" height="12" rx="2" fill="#fff"/><rect x="48" y="64" width="10" height="14" rx="2" fill="#E8962A"/><rect x="66" y="66" width="10" height="12" rx="2" fill="#fff"/>
  <ellipse cx="96" cy="104" rx="14" ry="3" fill="#7A4A06"/><rect x="94" y="92" width="4" height="12" fill="#7A4A06"/><ellipse cx="96" cy="92" rx="12" ry="3" fill="#B07A3F"/>
</svg>`

const GUAVA = `<svg viewBox="0 0 40 70" aria-hidden="true"><rect x="17" y="36" width="6" height="34" rx="2" fill="#7B4B2A"/>
  <circle cx="20" cy="26" r="17" fill="#4F8A33"/><circle cx="12" cy="22" r="3" fill="#C6E26B"/><circle cx="27" cy="30" r="3" fill="#C6E26B"/><circle cx="20" cy="14" r="3" fill="#C6E26B"/></svg>`

// Nhà kiếm nhiều xu nhất tuần này (phải hơn 0)
export function topFamily(c: Ctx) {
  const w = c.live.xu?.week || {}
  let best: string | null = null, bv = 0
  for (const [k, v] of Object.entries(w)) if (v > bv) { best = k; bv = v }
  return best
}

const TREE = `<svg viewBox="0 0 60 112" aria-hidden="true"><rect x="26" y="66" width="8" height="46" rx="3" fill="#7B4B2A"/>
  <circle cx="30" cy="48" r="22" fill="#5E9B3C"/><circle cx="16" cy="62" r="13" fill="#4F8A33"/><circle cx="44" cy="62" r="13" fill="#6DAA47"/></svg>`

type Props = {
  c: Ctx
  openFamily: (f: Family) => void
  openQuan: () => void
  openMieu: () => void
  openTree: () => void
}

export function Street({ c, openFamily, openQuan, openMieu, openTree }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const now = new Date(), hour = now.getHours(), sky = skyOf(hour), night = sky === 'night'
  const L = toLunar(now), moon = L.d >= 27 || L.d <= 2 ? '🌙' : MOON[Math.round((L.d - 1) / 29.5 * 8) % 8]
  const by = new Map(c.live.today.map(x => [x.member_id, x]))
  const fams = [c.myFam, ...c.d.families.filter(f => f.id !== c.myFam.id)]
  const bday = new Set(upcoming(c.d, 3).filter(e => e.kind !== 'Ngày cưới').map(e => e.family.id))
  const hosting = new Set(c.live.hosts.filter(h => h.family_id && dayDiff(new Date(h.at)) >= 0 && dayDiff(new Date(h.at)) <= 7).map(h => h.family_id!))
  const keosToday = c.live.keos.filter(k => dayDiff(new Date(k.at)) === 0)
  const n = findLunar(now, l => l.d === 1 || l.d === 15), fest = !!n && n.days <= 1
  const famOf = new Map(c.d.members.map(m => [m.id, m.family_id]))
  const lit = new Set(c.live.altar.map(a => famOf.get(a.member_id))).size
  const xu = c.live.xu, top = topFamily(c), tree = xu ? treeStage(xu.water, xu.goal) : null
  const shown = (fid: string) => new Set((xu?.decor || []).filter(x => x.family_id === fid && x.shown).map(x => x.item))

  // Mở ra là thấy ngay nhà mình (ngay sau quán)
  useEffect(() => { ref.current?.scrollTo({ left: 96 }) }, [])

  const person = (m: Member, i: number, kid = false) => {
    const ci = by.get(m.id), s = ci ? st(ci.status) : null
    return <span key={m.id} className={'st-p' + (kid ? ' kid' : '')} style={{ ['--d' as string]: i * 0.12 + 's' }} title={m.name + (s ? ': ' + s.t : '')}>
      {s && <span className="st-bub" aria-hidden="true">{s.e}</span>}
      <span className="st-fig" dangerouslySetInnerHTML={{ __html: chibiSVG(lookOf(m)) }} />
    </span>
  }

  return <section className={'street sky-' + sky} aria-label="Phố xóm">
    <div className="st-sky" aria-hidden="true">
      {night ? <><span className="st-moon">{moon}</span><i className="star s1" /><i className="star s2" /><i className="star s3" /><i className="star s4" /></>
        : <span className="st-sun" />}
      <span className="cloud c1" /><span className="cloud c2" />
    </div>
    <div className="st-scroll" ref={ref}>
      <div className="st-track">
        {tree && <button className="st-lot cayda" onClick={openTree} aria-label={'Cây Đa của xóm: ' + tree.t + ', ' + Math.round(tree.p * 100) + '%'}>
          <span className="st-sign">🌳 Cây Đa · {Math.min(100, Math.round(tree.p * 100))}%</span>
          <span className="st-house" dangerouslySetInnerHTML={{ __html: banyanSVG(tree.n) }} />
        </button>}
        <button className="st-lot quan" onClick={openQuan} aria-label={'Quán góc phố, ' + (keosToday.length ? keosToday.length + ' kèo hôm nay' : 'chưa có kèo hôm nay')}>
          <span className="st-sign">{keosToday.length ? `🔥 ${keosToday.length} kèo hôm nay` : 'Chưa có kèo'}</span>
          <span className="st-house" dangerouslySetInnerHTML={{ __html: KIOSK }} />
        </button>
        {fams.map((f, i) => {
          const adults = adultsOf(c.d, f), here = adults.filter(a => by.has(a.id))
          const withKids = here.some(a => by.get(a.id)!.status === 'con')
          const free = here.some(a => FREE.includes(by.get(a.id)!.status))
          const mine = f.id === c.myFam.id, dec = shown(f.id)
          const roof = [...dec].map(k => decorOf(k)?.roof).find(x => x != null)
          return <div key={f.id} className="st-pair">
            {i % 3 === 2 && <span className="st-tree" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TREE }} />}
            <button className={'st-lot' + (mine ? ' mine' : '') + (free ? ' free' : '') + (dec.has('bien_vang') ? ' gold' : '')} onClick={() => openFamily(f)}
              aria-label={(mine ? 'Nhà mình' : 'Nhà ' + famShort(c.d, f)) + (here.length ? ', ' + here.map(a => a.name + ' ' + st(by.get(a.id)!.status).s).join(', ') : ', chưa ai điểm danh')}>
              <span className="st-sign">{top === f.id ? '👑 ' : ''}{mine ? '⭐ Nhà mình' : famShort(c.d, f)}</span>
              {bday.has(f.id) && <span className="st-balloon" aria-hidden="true">🎈🎈</span>}
              {hosting.has(f.id) && <span className="st-lantern" aria-hidden="true">🏮</span>}
              <span className="st-house" dangerouslySetInnerHTML={{ __html: houseSVG(hueOf(f.id), here.length > 0, night, roof ?? hueOf(f.id), dec.has('den_nhay')) }} />
              {dec.has('cay_oi') && <span className="dc-oi" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GUAVA }} />}
              {(['hoa', 'chuong', 'ga', 'xe_dap', 'meo', 'dieu'] as const).filter(k => dec.has(k)).map(k => <span key={k} className={'dc dc-' + k} aria-hidden="true">{decorOf(k)!.e}</span>)}
              <span className="st-yard">
                {here.map((a, j) => person(a, j))}
                {withKids && kidsOf(c.d, f).slice(0, 3).map((k, j) => person(k, here.length + j, true))}
                {!here.length && mine && <span className="st-hint">Bấm để ra cửa 👋</span>}
              </span>
            </button>
          </div>
        })}
        <span className="st-tree big" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TREE }} />
        <button className={'st-lot mieu' + (fest ? ' fest' : '')} onClick={openMieu} aria-label="Vào Miếu Thần Tài">
          <span className="st-sign">🏮 Miếu · {lit}/{c.d.families.length} nhà</span>
          <span className="st-house" dangerouslySetInnerHTML={{ __html: gateSVG() }} />
        </button>
        <span className="st-dog" aria-hidden="true">🐕</span>
      </div>
    </div>
  </section>
}

/* Bấm vào một ngôi nhà */
export function HouseSheet({ c, f, onClose, invite, editChibi, decor }: {
  c: Ctx; f: Family; onClose: () => void; invite: (title: string) => void; editChibi: () => void; decor: () => void
}) {
  const toast = useToast()
  const mine = f.id === c.myFam.id, name = mine ? 'Nhà mình' : 'Nhà ' + famShort(c.d, f)
  const by = new Map(c.live.today.map(x => [x.member_id, x]))
  const adults = adultsOf(c.d, f), kids = kidsOf(c.d, f)
  const evs = upcoming(c.d, 30).filter(e => e.family.id === f.id)
  const myStatus = by.get(c.me.id)?.status
  async function pick(k: string) { const r = await saveCheckin(c, k); toast(r.msg); if (r.ok) onClose() }
  return <Sheet label={name} onClose={onClose}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><FamilyHeads d={c.d} f={f} /><div><h2 style={{ margin: 0 }}>{name}</h2>
      <p className="sub small" style={{ margin: 0 }}>{famShort(c.d, f)}{kids.length ? ' · bé ' + kids.map(k => k.name).join(', bé ') : ''}</p></div></div>
    <div className="list">{adults.map(a => { const ci = by.get(a.id)
      return <div className="row" key={a.id}><MemberHead m={a} /><div className="grow"><div className="name">{a.name}</div>
        <div className="meta">{!a.user_id ? 'Chưa vào xóm' : ci ? st(ci.status).e + ' ' + st(ci.status).t : 'Hôm nay chưa ra cửa'}</div></div></div> })}</div>
    {c.live.xu && <div className="xu-row"><span>🪙 <b>{c.live.xu.balance[f.id] || 0}</b> Xu Lộc{(c.live.xu.week[f.id] || 0) > 0 ? ` · tuần này +${c.live.xu.week[f.id]}` : ''}</span>
      {topFamily(c) === f.id && <span className="pst">👑 Nhà sáng đèn nhất tuần</span>}</div>}
    {evs.map(e => <div className="note" key={e.label}>🎈 {e.label} · {dayDiff(e.date) === 0 ? 'hôm nay' : 'còn ' + dayDiff(e.date) + ' ngày'}</div>)}
    {mine ? <>
      <div className="group-title">Hôm nay {c.me.name} thế nào?</div>
      <div className="chips">{STATUS.map(s => <button key={s.k} className="chip" aria-pressed={myStatus === s.k} onClick={() => pick(s.k)}>{s.e} {s.t}</button>)}</div>
      {c.live.xu && <button className="btn sun" onClick={decor}>🛠️ Sửa sang nhà mình</button>}
      <button className="btn ghost" onClick={editChibi}>Sửa chibi cả nhà</button>
    </> : <>
      <button className="btn sun" onClick={() => invite('Cafe với nhà ' + famShort(c.d, f))}>☕ Rủ nhà {famShort(c.d, f)} đi cafe</button>
      <button className="btn ghost" onClick={() => invite('Bia với nhà ' + famShort(c.d, f))}>🍺 Rủ làm cốc bia</button>
    </>}
  </Sheet>
}

/* Cửa hàng sửa nhà bằng Xu Lộc */
export function DecorSheet({ c, onClose }: { c: Ctx; onClose: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const xu = c.live.xu
  if (!xu) return null
  const bal = xu.balance[c.myFam.id] || 0
  const own = new Map(xu.decor.filter(x => x.family_id === c.myFam.id).map(x => [x.item, x.shown]))
  async function act(k: string) {
    setBusy(k)
    const has = own.has(k)
    const { error } = has ? await sb.rpc('set_decor', { p_family: c.myFam.id, p_item: k, p_shown: !own.get(k) })
      : await sb.rpc('buy_decor', { p_family: c.myFam.id, p_item: k })
    setBusy(null)
    if (error) toast(errText(error)); else { toast(has ? (own.get(k) ? 'Đã cất đi' : 'Đã bày ra') : 'Đã mua! Ra phố xem nhà mình nhé 🎉'); c.reload() }
  }
  return <Sheet label="Sửa sang nhà mình" onClose={onClose}>
    <h2>Sửa sang nhà mình</h2>
    <div className="xu-big">🪙 {bal} <small>Xu Lộc của cả nhà</small></div>
    <div className="decor-grid">{DECOR.map(d => {
      const has = own.has(d.k), on = own.get(d.k)
      return <button key={d.k} className={'decor' + (has ? ' has' : '') + (on ? ' on' : '')} disabled={busy != null || (!has && bal < d.price)} onClick={() => act(d.k)}>
        <span className="de">{d.e}</span><span className="dt">{d.t}</span>
        <span className="dp">{!has ? `🪙 ${d.price}` : on ? '✓ Đang bày · cất đi' : 'Bày ra'}</span>
      </button>
    })}</div>
    <div className="group-title">Cách kiếm Xu Lộc</div>
    <div className="list">{EARN.map(([e, t, n]) => <div className="row" key={t}><span style={{ fontSize: 20 }}>{e}</span><div className="grow">{t}</div><b>+{n}</b></div>)}</div>
    <p className="sub small" style={{ margin: 0 }}>Xu là của chung cả nhà: vợ chồng cùng kiếm, cùng tiêu. Mỗi tuần nhà kiếm nhiều xu nhất được đội vương miện 👑 trên biển tên.</p>
  </Sheet>
}

/* Cây Đa của xóm */
export function TreeSheet({ c, onClose }: { c: Ctx; onClose: () => void }) {
  const toast = useToast()
  const xu = c.live.xu
  if (!xu) return null
  const t = treeStage(xu.water, xu.goal), pct = Math.min(100, Math.round(t.p * 100))
  const meWatered = xu.today.filter(x => x.member_id === c.me.id && (x.kind === 'checkin' || x.kind === 'altar')).length
  const month = new Date().getMonth() + 1
  async function claim() {
    const { data, error } = await sb.rpc('claim_tree', { p_xom: c.d.xom.id })
    if (error) toast(errText(error)); else { toast(data ? 'Hái quả rồi! Mỗi nhà được +15 Xu Lộc 🍊' : 'Quả tháng này đã hái rồi'); c.reload() }
  }
  return <Sheet label="Cây Đa của xóm" onClose={onClose}>
    <div className="tree-hero" dangerouslySetInnerHTML={{ __html: banyanSVG(t.n) }} />
    <h2 style={{ textAlign: 'center', margin: 0 }}>Cây Đa · {t.t}</h2>
    <div className="tree-bar" aria-label={pct + '%'}><i style={{ width: pct + '%' }} /></div>
    <p className="sub small" style={{ margin: 0, textAlign: 'center' }}>Tháng {month}: cả xóm đã tưới <b>{xu.water}/{xu.goal}</b> lượt</p>
    <div className="note">Mỗi lần ai đó <b>điểm danh</b> hay <b>thắp hương</b> là tưới cho cây một lượt. Đủ nước trong tháng thì cây trĩu quả, <b>mỗi nhà được +15 Xu Lộc</b>. Sang tháng mới cây lại bắt đầu lớn.</div>
    <p style={{ margin: 0 }}>{meWatered >= 2 ? '💧 Hôm nay bạn tưới đủ rồi, cảm ơn nhé!' : meWatered === 1 ? '💧 Hôm nay bạn tưới 1 lượt. Thắp hương hoặc điểm danh để tưới thêm.' : '🥀 Hôm nay bạn chưa tưới. Điểm danh một cái là cây có nước!'}</p>
    {t.n === 4 && (xu.tree_done ? <div className="note">🍊 Quả tháng này cả xóm đã hái. Hẹn tháng sau!</div>
      : <button className="btn sun" onClick={claim}>🍊 Hái quả cho cả xóm</button>)}
  </Sheet>
}
