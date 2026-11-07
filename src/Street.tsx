import { useEffect, useRef } from 'react'
import type { Family, Member } from './supabase'
import { chibiSVG } from './chibi'
import { FREE, STATUS, st } from './consts'
import { FamilyHeads, MemberHead, Sheet, useToast } from './ui'
import { adultsOf, dayDiff, famShort, hueOf, kidsOf, lookOf, upcoming } from './util'
import { toLunar, findLunar } from './lunar'
import { gateSVG } from './temple'
import { saveCheckin, type Ctx } from './Activity'

// Phố xóm: mỗi gia đình một ngôi nhà, ai đã điểm danh thì đứng trước cửa.
// Đầu phố là quán (kèo hôm nay), cuối phố là miếu.

const MOON = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']

function skyOf(h: number) {
  if (h >= 5 && h < 7) return 'dawn'
  if (h >= 7 && h < 17) return 'day'
  if (h >= 17 && h < 19) return 'dusk'
  return 'night'
}

function houseSVG(hue: number, open: boolean, night: boolean) {
  const roof = `hsl(${hue} 52% 46%)`, eave = `hsl(${hue} 50% 34%)`, wall = `hsl(${hue} 40% 93%)`, door = `hsl(${hue} 30% 34%)`
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

const TREE = `<svg viewBox="0 0 60 112" aria-hidden="true"><rect x="26" y="66" width="8" height="46" rx="3" fill="#7B4B2A"/>
  <circle cx="30" cy="48" r="22" fill="#5E9B3C"/><circle cx="16" cy="62" r="13" fill="#4F8A33"/><circle cx="44" cy="62" r="13" fill="#6DAA47"/></svg>`

type Props = {
  c: Ctx
  openFamily: (f: Family) => void
  openQuan: () => void
  openMieu: () => void
}

export function Street({ c, openFamily, openQuan, openMieu }: Props) {
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

  // Mở ra là thấy ngay nhà mình (ngay sau quán)
  useEffect(() => { ref.current?.scrollTo({ left: 0 }) }, [])

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
        <button className="st-lot quan" onClick={openQuan} aria-label={'Quán góc phố, ' + (keosToday.length ? keosToday.length + ' kèo hôm nay' : 'chưa có kèo hôm nay')}>
          <span className="st-sign">{keosToday.length ? `🔥 ${keosToday.length} kèo hôm nay` : 'Chưa có kèo'}</span>
          <span className="st-house" dangerouslySetInnerHTML={{ __html: KIOSK }} />
        </button>
        {fams.map((f, i) => {
          const adults = adultsOf(c.d, f), here = adults.filter(a => by.has(a.id))
          const withKids = here.some(a => by.get(a.id)!.status === 'con')
          const free = here.some(a => FREE.includes(by.get(a.id)!.status))
          const mine = f.id === c.myFam.id
          return <div key={f.id} className="st-pair">
            {i % 3 === 2 && <span className="st-tree" aria-hidden="true" dangerouslySetInnerHTML={{ __html: TREE }} />}
            <button className={'st-lot' + (mine ? ' mine' : '') + (free ? ' free' : '')} onClick={() => openFamily(f)}
              aria-label={(mine ? 'Nhà mình' : 'Nhà ' + famShort(c.d, f)) + (here.length ? ', ' + here.map(a => a.name + ' ' + st(by.get(a.id)!.status).s).join(', ') : ', chưa ai điểm danh')}>
              <span className="st-sign">{mine ? '⭐ Nhà mình' : famShort(c.d, f)}</span>
              {bday.has(f.id) && <span className="st-balloon" aria-hidden="true">🎈🎈</span>}
              {hosting.has(f.id) && <span className="st-lantern" aria-hidden="true">🏮</span>}
              <span className="st-house" dangerouslySetInnerHTML={{ __html: houseSVG(hueOf(f.id), here.length > 0, night) }} />
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
export function HouseSheet({ c, f, onClose, invite, editChibi }: {
  c: Ctx; f: Family; onClose: () => void; invite: (title: string) => void; editChibi: () => void
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
    {evs.map(e => <div className="note" key={e.label}>🎈 {e.label} · {dayDiff(e.date) === 0 ? 'hôm nay' : 'còn ' + dayDiff(e.date) + ' ngày'}</div>)}
    {mine ? <>
      <div className="group-title">Hôm nay {c.me.name} thế nào?</div>
      <div className="chips">{STATUS.map(s => <button key={s.k} className="chip" aria-pressed={myStatus === s.k} onClick={() => pick(s.k)}>{s.e} {s.t}</button>)}</div>
      <button className="btn ghost" onClick={editChibi}>Sửa chibi cả nhà</button>
    </> : <>
      <button className="btn sun" onClick={() => invite('Cafe với nhà ' + famShort(c.d, f))}>☕ Rủ nhà {famShort(c.d, f)} đi cafe</button>
      <button className="btn ghost" onClick={() => invite('Bia với nhà ' + famShort(c.d, f))}>🍺 Rủ làm cốc bia</button>
    </>}
  </Sheet>
}
