import { useEffect, useRef, useState } from 'react'
import { ALL_HAIR, HAIRC, HAIR_NAMES, SHIRT, SKIN, headSVG, type Look } from './chibi'
import { sb, errText, type Member } from './supabase'
import { lookOf } from './util'
import { Chibi, useToast } from './ui'
import { callAI, pollJob, toJpeg, fileToDataUrl } from './ai'

// Tạo chibi: chọn ảnh là AI tự vẽ. Ai không muốn dùng ảnh thì "Tự chỉnh tay".
export function ChibiEditor({ members, startId, onSaved, onClose }:
  { members: Member[]; startId: string; onSaved: () => void; onClose: () => void }) {
  const toast = useToast()
  const [pid, setPid] = useState(startId)
  const m = members.find(x => x.id === pid) || members[0]
  const [look, setLook] = useState<Look>(lookOf(m))
  const [manual, setManual] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<null | number>(null) // số giây AI đã vẽ
  const [drawn, setDrawn] = useState<string | null>(null)
  const [last, setLast] = useState<string>('') // ảnh gốc lần trước, để "Vẽ lại"
  const dirty = useRef(false)
  const kid = m.role === 'kid'

  useEffect(() => { setLook(lookOf(m)); dirty.current = false; setDrawn(null); setLast(''); setConsent(false) }, [m.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Look>) => { dirty.current = true; setLook(l => ({ ...l, ...p })) }
  async function persist(l: Look = look) {
    if (!dirty.current) return true
    const { error } = await sb.from('members').update({ look: l }).eq('id', m.id)
    if (error) { toast(errText(error)); return false }
    dirty.current = false; onSaved(); return true
  }

  async function draw(img: string) {
    setBusy(0); setDrawn(null)
    try {
      const { job } = await callAI<{ job: string }>('/api/chibi-ai', { xom_id: m.xom_id, mode: 'draw', image: img, kid, consent })
      const out = await pollJob(job, s => setBusy(s))
      setDrawn(await toJpeg(out, 240, .85))
    } catch (e) { toast((e as Error).message) }
    setBusy(null)
  }
  async function pick(file?: File) {
    if (!file) return
    try { const img = await toJpeg(await fileToDataUrl(file), 768); setLast(img); draw(img) }
    catch { toast('Không đọc được ảnh này, thử ảnh khác nhé') }
  }
  async function useDrawn() {
    if (!drawn) return
    const l = { ...look, mode: 'photo' as const, photo: drawn, zoom: 1.05, ox: 0, oy: 0 }
    setLook(l); dirty.current = true; setDrawn(null)
    if (await persist(l)) toast('Đã lưu chibi mới 🎉')
  }

  const sw = (k: 'hairC' | 'skin' | 'shirt', arr: string[]) => <div className="opts">{arr.map(c =>
    <button key={c} type="button" className="sw" style={{ background: c }} aria-pressed={look[k] === c} aria-label={'Màu ' + c} onClick={() => set({ [k]: c, ...(k === 'shirt' ? {} : { mode: 'build' as const }) })} />)}</div>

  return <div className="stackf">
    <h2>Chibi nhà mình</h2>
    <div className="chips">{members.map(x => <button key={x.id} type="button" className="chip" aria-pressed={x.id === m.id} disabled={busy != null}
      onClick={async () => { if (await persist()) setPid(x.id) }}>{x.role === 'kid' ? 'Bé ' + x.name : x.name}</button>)}</div>

    <div className="ed-preview">{drawn
      ? <div className="ai-result"><img src={drawn} alt={'Chibi AI vẽ cho ' + m.name} /><span>AI vừa vẽ xong!</span></div>
      : <Chibi look={look} />}</div>

    {drawn ? <div className="two">
        <button type="button" className="btn" onClick={useDrawn}>Dùng luôn</button>
        <button type="button" className="btn ghost" disabled={!last} onClick={() => draw(last)}>Vẽ lại</button>
      </div>
      : <>
        {kid && <label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Tôi là bố/mẹ của bé và đồng ý gửi ảnh cho AI vẽ</label>}
        <label className={'btn sun block' + (busy != null || (kid && !consent) ? ' is-busy' : '')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 17 }}>
          {busy != null ? `🎨 AI đang vẽ ${m.name}… ${busy}s` : `📷 Chọn ảnh ${kid ? 'của bé' : 'của ' + m.name}, AI vẽ chibi`}
          <input type="file" accept="image/*" hidden disabled={busy != null || (kid && !consent)} onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <p className="sub small" style={{ margin: 0 }}>{busy != null ? 'AI thường vẽ mất 20–60 giây, cứ để màn hình này mở nhé.' : 'Ảnh chụp thẳng mặt, đủ sáng là đẹp nhất. Ảnh chỉ gửi cho AI để vẽ, không lưu lại ở dịch vụ AI.'}</p>
      </>}

    <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(!manual)}>{manual ? '▾ Ẩn phần tự chỉnh' : '▸ Tự chỉnh tay (không dùng ảnh)'}</button>
    {manual && <>
      <div className="group-title">Kiểu tóc</div>
      <div className="opts">{ALL_HAIR.map(h => <button key={h} type="button" className="opt" aria-pressed={look.mode !== 'photo' && look.hair === h} aria-label={'Tóc ' + HAIR_NAMES[h]}
        onClick={() => set({ hair: h, mode: 'build' })} dangerouslySetInnerHTML={{ __html: headSVG({ ...look, mode: 'build', hair: h, glasses: false, acc: 'none' }) }} />)}</div>
      <div className="group-title">Màu tóc</div>{sw('hairC', HAIRC)}
      <div className="group-title">Màu da</div>{sw('skin', SKIN)}
      <div className="group-title">Màu áo</div>{sw('shirt', SHIRT)}
      <div className="group-title">Kính và phụ kiện</div>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={look.glasses} onClick={() => set({ glasses: !look.glasses, mode: 'build' })}>👓 Kính</button>
        {([['none', 'Không phụ kiện'], ['bow', '🎀 Nơ'], ['cap', '🧢 Mũ']] as const).map(([v, t]) =>
          <button key={v} type="button" className="chip" aria-pressed={look.acc === v} onClick={() => set({ acc: v, mode: 'build' })}>{t}</button>)}
      </div>
    </>}
    <button type="button" className="btn" disabled={busy != null} onClick={async () => { if (await persist()) { toast('Đã lưu chibi'); onClose() } }}>Lưu và đóng</button>
  </div>
}
