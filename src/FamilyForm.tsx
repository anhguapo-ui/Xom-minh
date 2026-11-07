import { useState } from 'react'
import { sb, errText, type Family, type XomData } from './supabase'
import { adultsOf, kidsOf } from './util'
import { useToast } from './ui'

type KidRow = { key: string; id?: string; name: string; dob: string }

// Hồ sơ gia đình: vợ hoặc chồng đều sửa được
export function FamilyForm({ d, family, ownerId, submitLabel, onDone }:
  { d: XomData; family: Family; ownerId: string; submitLabel: string; onDone: () => void }) {
  const toast = useToast()
  const adults = adultsOf(d, family)
  const owner = adults.find(m => m.id === ownerId) || adults[0]
  const [names, setNames] = useState(Object.fromEntries(adults.map(m => [m.id, m.name])))
  const [dobs, setDobs] = useState(Object.fromEntries(adults.map(m => [m.id, m.dob || ''])))
  const [phone, setPhone] = useState(owner?.phone || '')
  const [phonePub, setPhonePub] = useState(!!owner?.phone_public)
  const [wed, setWed] = useState(family.wedding || '')
  const [kids, setKids] = useState<KidRow[]>(kidsOf(d, family).map(k => ({ key: k.id, id: k.id, name: k.name, dob: k.dob || '' })))
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      for (const m of adults) {
        const patch: Record<string, unknown> = { name: names[m.id].trim() || m.name, dob: dobs[m.id] || null }
        if (m.id === owner?.id) { patch.phone = phone.trim() || null; patch.phone_public = phonePub }
        const { error } = await sb.from('members').update(patch).eq('id', m.id)
        if (error) throw error
      }
      const fr = await sb.from('families').update({ wedding: wed || null }).eq('id', family.id)
      if (fr.error) throw fr.error
      const keep = new Set(kids.filter(k => k.id).map(k => k.id))
      for (const old of kidsOf(d, family)) if (!keep.has(old.id)) {
        const { error } = await sb.from('members').delete().eq('id', old.id); if (error) throw error
      }
      for (const k of kids) {
        const name = k.name.trim(); if (!name) continue
        const { error } = k.id
          ? await sb.from('members').update({ name, dob: k.dob || null }).eq('id', k.id)
          : await sb.from('members').insert({ xom_id: family.xom_id, family_id: family.id, role: 'kid', name, dob: k.dob || null })
        if (error) throw error
      }
      onDone()
    } catch (err) { toast(errText(err)) } finally { setBusy(false) }
  }

  return <form className="stackf" onSubmit={save}>
    <div className="group-title">Hai vợ chồng</div>
    {adults.map(m => <div className="two" key={m.id}>
      <label className="f">Tên{m.id === owner?.id ? ' (bạn)' : ''}<input required maxLength={40} value={names[m.id]} onChange={e => setNames({ ...names, [m.id]: e.target.value })} /></label>
      <label className="f">Ngày sinh<input type="date" value={dobs[m.id]} onChange={e => setDobs({ ...dobs, [m.id]: e.target.value })} /></label>
    </div>)}
    <label className="f">Số điện thoại của {owner?.name}<input type="tel" inputMode="tel" maxLength={20} placeholder="09xx xxx xxx" value={phone} onChange={e => setPhone(e.target.value)} /></label>
    <label className="check"><input type="checkbox" checked={phonePub} onChange={e => setPhonePub(e.target.checked)} /> Cho cả xóm thấy số điện thoại</label>
    <label className="f">Ngày cưới<input type="date" value={wed} onChange={e => setWed(e.target.value)} /></label>
    <div className="group-title">Các bé</div>
    <p className="sub small" style={{ margin: 0 }}>Các bé không cần tài khoản. Ngày sinh sẽ tự hiện ở mục "Sắp tới" để cả xóm nhớ chúc.</p>
    {kids.map((k, i) => <div className="kid-row" key={k.key}>
      <input aria-label="Tên bé" placeholder="Tên bé" maxLength={40} value={k.name} onChange={e => setKids(kids.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
      <input aria-label="Ngày sinh của bé" type="date" value={k.dob} onChange={e => setKids(kids.map((x, j) => j === i ? { ...x, dob: e.target.value } : x))} />
      <button type="button" aria-label="Bỏ bé này" onClick={() => setKids(kids.filter((_, j) => j !== i))}>×</button>
    </div>)}
    <button type="button" className="btn ghost" onClick={() => setKids([...kids, { key: 'n' + Date.now(), name: '', dob: '' }])}>+ Thêm bé</button>
    <button className="btn" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : submitLabel}</button>
  </form>
}
