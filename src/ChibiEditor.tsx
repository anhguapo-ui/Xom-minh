import { useEffect, useRef, useState } from 'react'
import { ALL_HAIR, HAIRC, HAIR_NAMES, SHIRT, SKIN, headSVG, photoToDataUrl, type Look } from './chibi'
import { sb, errText, type Member } from './supabase'
import { lookOf } from './util'
import { Chibi, useToast } from './ui'

// Sửa chibi cho từng người trong nhà. Tự lưu khi đổi người hoặc bấm Xong.
export function ChibiEditor({ members, startId, onSaved, onClose }:
  { members: Member[]; startId: string; onSaved: () => void; onClose: () => void }) {
  const toast = useToast()
  const [pid, setPid] = useState(startId)
  const m = members.find(x => x.id === pid) || members[0]
  const [look, setLook] = useState<Look>(lookOf(m))
  const dirty = useRef(false)

  useEffect(() => { setLook(lookOf(m)); dirty.current = false }, [m.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Look>) => { dirty.current = true; setLook(l => ({ ...l, ...p })) }
  async function persist() {
    if (!dirty.current) return true
    const { error } = await sb.from('members').update({ look }).eq('id', m.id)
    if (error) { toast(errText(error)); return false }
    dirty.current = false; onSaved(); return true
  }
  async function pickPhoto(file?: File) {
    if (!file) return
    try { set({ mode: 'photo', photo: await photoToDataUrl(file), zoom: 1.25, ox: 0, oy: 0 }) }
    catch { toast('Không đọc được ảnh này, thử ảnh khác nhé') }
  }

  const sw = (k: 'hairC' | 'skin' | 'shirt', arr: string[]) => <div className="opts">{arr.map(c =>
    <button key={c} type="button" className="sw" style={{ background: c }} aria-pressed={look[k] === c} aria-label={'Màu ' + c} onClick={() => set({ [k]: c, ...(k === 'shirt' ? {} : { mode: 'build' as const }) })} />)}</div>

  return <div className="stackf">
    <h2>Chibi nhà mình</h2>
    <p className="sub small" style={{ margin: 0 }}>Chibi hiện ở danh sách xóm, điểm danh, kèo, chat và trong miếu.</p>
    <div className="chips">{members.map(x => <button key={x.id} type="button" className="chip" aria-pressed={x.id === m.id}
      onClick={async () => { if (await persist()) setPid(x.id) }}>{x.role === 'kid' ? 'Bé ' + x.name : x.name}</button>)}</div>
    <div className="ed-preview"><Chibi look={look} /></div>
    <div className="seg" style={{ marginTop: 0 }}>
      <button type="button" aria-pressed={look.mode === 'photo'} onClick={() => set({ mode: 'photo' })}>Dùng ảnh thật</button>
      <button type="button" aria-pressed={look.mode !== 'photo'} onClick={() => set({ mode: 'build' })}>Tự tạo</button>
    </div>
    {look.mode === 'photo' ? <>
      <label className="btn ghost" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        {look.photo ? 'Đổi ảnh khác' : 'Chọn ảnh từ máy'}
        <input type="file" accept="image/*" hidden onChange={e => pickPhoto(e.target.files?.[0])} />
      </label>
      {look.photo && <>
        <label className="f">Phóng to<input type="range" min={1} max={3} step={0.05} value={look.zoom} onChange={e => set({ zoom: +e.target.value })} /></label>
        <div className="two">
          <label className="f">Căn ngang<input type="range" min={-22} max={22} step={1} value={look.ox} onChange={e => set({ ox: +e.target.value })} /></label>
          <label className="f">Căn dọc<input type="range" min={-22} max={22} step={1} value={look.oy} onChange={e => set({ oy: +e.target.value })} /></label>
        </div>
        <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => set({ mode: 'build', photo: '' })}>Bỏ ảnh, quay lại tự tạo</button>
      </>}
      <p className="sub small" style={{ margin: 0 }}>Mẹo: ảnh chụp thẳng mặt, đủ sáng sẽ đẹp nhất. Ảnh được thu nhỏ và chỉ người trong xóm nhìn thấy.</p>
    </> : <>
      <div className="group-title">Kiểu tóc</div>
      <div className="opts">{ALL_HAIR.map(h => <button key={h} type="button" className="opt" aria-pressed={look.hair === h} aria-label={'Tóc ' + HAIR_NAMES[h]}
        onClick={() => set({ hair: h, mode: 'build' })} dangerouslySetInnerHTML={{ __html: headSVG({ ...look, mode: 'build', hair: h, glasses: false, acc: 'none' }) }} />)}</div>
      <div className="group-title">Màu tóc</div>{sw('hairC', HAIRC)}
      <div className="group-title">Màu da</div>{sw('skin', SKIN)}
      <div className="group-title">Màu áo</div>{sw('shirt', SHIRT)}
      <div className="group-title">Kính</div>
      <div className="chips">{([[false, 'Không đeo'], [true, 'Đeo kính']] as const).map(([v, t]) =>
        <button key={t} type="button" className="chip" aria-pressed={look.glasses === v} onClick={() => set({ glasses: v })}>{t}</button>)}</div>
      <div className="group-title">Phụ kiện</div>
      <div className="chips">{([['none', 'Không'], ['bow', 'Nơ'], ['cap', 'Mũ lưỡi trai']] as const).map(([v, t]) =>
        <button key={v} type="button" className="chip" aria-pressed={look.acc === v} onClick={() => set({ acc: v })}>{t}</button>)}</div>
    </>}
    <button type="button" className="btn" onClick={async () => { if (await persist()) { toast('Đã lưu chibi'); onClose() } }}>Lưu và đóng</button>
  </div>
}
