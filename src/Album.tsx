import { useEffect, useRef, useState } from 'react'
import { sb, errText } from './supabase'
import { MemberHead, Sheet, useToast } from './ui'
import { notify } from './push'
import { dm } from './util'
import type { Ctx } from './Activity'

export type Photo = { id: string; xom_id: string; member_id: string; event_type: 'keo' | 'host' | 'free'; event_id: string | null; path: string; caption: string | null; taken_day: string; created_at: string }
type Like = { photo_id: string; member_id: string }

// Thu nhỏ ảnh về cạnh dài 1600px, JPEG, để tải lên nhanh và tiết kiệm dung lượng
function shrink(file: File, max = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image()
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')) }
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas')
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url)
      c.toBlob(b => b ? resolve(b) : reject(new Error('Không nén được ảnh')), 'image/jpeg', 0.82)
    }
    img.src = url
  })
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))

export async function uploadPhotos(c: Ctx, files: FileList | File[], ev: { type: Photo['event_type']; id: string | null; title?: string }) {
  let ok = 0
  for (const f of Array.from(files).slice(0, 20)) {
    const blob = await shrink(f), path = `${c.d.xom.id}/${uuid()}.jpg`
    const up = await sb.storage.from('album').upload(path, blob, { contentType: 'image/jpeg' })
    if (up.error) throw up.error
    const ins = await sb.from('photos').insert({ xom_id: c.d.xom.id, member_id: c.me.id, event_type: ev.type, event_id: ev.id, path })
    if (ins.error) { await sb.storage.from('album').remove([path]); throw ins.error }
    ok++
  }
  if (ok) notify(c.d.xom.id, '📸 ' + c.me.name + ' đăng ' + ok + ' ảnh mới', ev.title ? 'Album: ' + ev.title : 'Vào album xem nhé!', '/', 'album')
  return ok
}

// Link xem ảnh có hạn 1 giờ (kho ảnh là riêng tư)
const urlCache = new Map<string, { u: string; t: number }>()
export function useSignedUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = paths.join('|')
  useEffect(() => {
    const need = paths.filter(p => !urlCache.has(p) || Date.now() - urlCache.get(p)!.t > 50 * 60e3)
    const done = () => setUrls(Object.fromEntries(paths.filter(p => urlCache.has(p)).map(p => [p, urlCache.get(p)!.u])))
    if (!need.length) { done(); return }
    sb.storage.from('album').createSignedUrls(need, 3600).then(({ data }) => {
      for (const r of data || []) if (r.signedUrl && r.path) urlCache.set(r.path, { u: r.signedUrl, t: Date.now() })
      done()
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}

function usePhotos(c: Ctx, filter: { eventId?: string; days?: string[] }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [likes, setLikes] = useState<Like[]>([])
  const reload = async () => {
    let q = sb.from('photos').select('*').eq('xom_id', c.d.xom.id).order('created_at', { ascending: false }).limit(120)
    if (filter.eventId) q = q.eq('event_id', filter.eventId)
    if (filter.days) q = q.in('taken_day', filter.days)
    const { data } = await q
    const ps = (data || []) as Photo[]
    setPhotos(ps)
    if (ps.length) { const l = await sb.from('photo_likes').select('photo_id,member_id').in('photo_id', ps.map(p => p.id)); setLikes((l.data || []) as Like[]) }
    else setLikes([])
  }
  useEffect(() => { reload() }, [c.tick, filter.eventId, (filter.days || []).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  return { photos, likes, reload }
}

function Grid({ photos, likes, open }: { photos: Photo[]; likes: Like[]; open: (p: Photo) => void }) {
  const urls = useSignedUrls(photos.map(p => p.path))
  return <div className="pgrid">{photos.map(p => { const n = likes.filter(l => l.photo_id === p.id).length
    return <button key={p.id} className="pcell" onClick={() => open(p)} aria-label="Xem ảnh">
      {urls[p.path] ? <img src={urls[p.path]} alt="" loading="lazy" /> : <span className="pload" />}
      {n > 0 && <span className="plike">❤ {n}</span>}
    </button> })}</div>
}

function Viewer({ c, p, likes, onClose, onChanged }: { c: Ctx; p: Photo; likes: Like[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const urls = useSignedUrls([p.path])
  const who = c.d.members.find(m => m.id === p.member_id)
  const mine = likes.some(l => l.photo_id === p.id && l.member_id === c.me.id), n = likes.filter(l => l.photo_id === p.id).length
  const [ask, setAsk] = useState(false)
  async function like() {
    const r = mine ? await sb.from('photo_likes').delete().eq('photo_id', p.id).eq('member_id', c.me.id)
      : await sb.from('photo_likes').insert({ photo_id: p.id, member_id: c.me.id, xom_id: c.d.xom.id })
    if (r.error) toast(errText(r.error)); else onChanged()
  }
  async function del() {
    await sb.storage.from('album').remove([p.path])
    const { error } = await sb.from('photos').delete().eq('id', p.id)
    if (error) toast(errText(error)); else { toast('Đã xoá ảnh'); onChanged(); onClose() }
  }
  return <Sheet label="Xem ảnh" onClose={onClose}>
    {urls[p.path] ? <img className="pbig" src={urls[p.path]} alt={p.caption || 'Ảnh trong album'} /> : <div className="pbig pload" />}
    <div className="row" style={{ padding: 0, minHeight: 0, border: 0 }}>{who && <MemberHead m={who} sm />}
      <div className="grow"><b>{who?.name || 'Ai đó'}</b><div className="meta">{dm(new Date(p.taken_day))}/{p.taken_day.slice(0, 4)}{p.caption ? ' · ' + p.caption : ''}</div></div>
      <button className={'btn ' + (mine ? '' : 'ghost')} style={{ minHeight: 44 }} onClick={like}>❤ {n || ''}</button></div>
    {urls[p.path] && <a className="link" href={urls[p.path]} target="_blank" rel="noopener noreferrer">Mở ảnh gốc</a>}
    {(p.member_id === c.me.id || c.me.is_admin) && (ask
      ? <div className="two"><button className="btn ghost" onClick={() => setAsk(false)}>Thôi</button><button className="btn danger" onClick={del}>Xoá ảnh</button></div>
      : <button className="link" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setAsk(true)}>Xoá ảnh này</button>)}
  </Sheet>
}

function AddButton({ c, ev, after, label = '📸 Thêm ảnh' }: { c: Ctx; ev: { type: Photo['event_type']; id: string | null; title?: string }; after: () => void; label?: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const inp = useRef<HTMLInputElement>(null)
  return <label className={'btn ghost block' + (busy ? ' is-busy' : '')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
    {busy ? 'Đang tải ảnh lên…' : label}
    <input ref={inp} type="file" accept="image/*" multiple hidden disabled={busy} onChange={async e => {
      const fs = e.target.files; if (!fs?.length) return
      setBusy(true)
      try { const n = await uploadPhotos(c, fs, ev); toast('Đã đăng ' + n + ' ảnh'); after() } catch (err) { toast(errText(err)) }
      setBusy(false); if (inp.current) inp.current.value = ''
    }} />
  </label>
}

// Album gắn với một kèo hoặc buổi đăng cai
export function EventAlbum({ c, type, id, title }: { c: Ctx; type: 'keo' | 'host'; id: string; title: string }) {
  const { photos, likes, reload } = usePhotos(c, { eventId: id })
  const [open, setOpen] = useState<Photo | null>(null)
  return <section className="section"><div className="section-head"><h2>Album</h2><span className="sub small">{photos.length} ảnh</span></div>
    {photos.length > 0 && <Grid photos={photos} likes={likes} open={setOpen} />}
    <AddButton c={c} ev={{ type, id, title }} after={reload} />
    {open && <Viewer c={c} p={open} likes={likes} onClose={() => setOpen(null)} onChanged={reload} />}
  </section>
}

// Toàn bộ album của xóm
export function AlbumTab({ c }: { c: Ctx }) {
  const { photos, likes, reload } = usePhotos(c, {})
  const [open, setOpen] = useState<Photo | null>(null)
  return <>
    <p className="sub" style={{ marginTop: 14 }}>Ảnh các buổi gặp nhau của cả xóm. Ảnh chỉ người trong xóm xem được.</p>
    <section className="section">
      <AddButton c={c} ev={{ type: 'free', id: null }} after={reload} label="📸 Đăng ảnh vào album chung" />
      {photos.length ? <Grid photos={photos} likes={likes} open={setOpen} /> : <div className="note">Chưa có ảnh nào. Đăng tấm đầu tiên đi!</div>}
    </section>
    {open && <Viewer c={c} p={open} likes={likes} onClose={() => setOpen(null)} onChanged={reload} />}
  </>
}

// "Ngày này năm xưa" trên màn Hôm nay
export function OnThisDay({ c }: { c: Ctx }) {
  const t = new Date(), md = String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')
  const days = [1, 2, 3, 4, 5].map(k => (t.getFullYear() - k) + '-' + md)
  const { photos, likes, reload } = usePhotos(c, { days })
  const [open, setOpen] = useState<Photo | null>(null)
  if (!photos.length) return null
  const years = t.getFullYear() - Number(photos[0].taken_day.slice(0, 4))
  return <section className="section"><div className="section-head"><h2>Ngày này năm xưa</h2><span className="sub small">{years} năm trước</span></div>
    <Grid photos={photos.slice(0, 6)} likes={likes} open={setOpen} />
    {open && <Viewer c={c} p={open} likes={likes} onClose={() => setOpen(null)} onChanged={reload} />}
  </section>
}
