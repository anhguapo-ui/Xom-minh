import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb, errText } from './supabase'
import { navigate } from './util'
import { Brand, useToast } from './ui'
import { LoginBox } from './Login'

type Fam = { label: string; open: { id: string; name: string }[] }
type Info = { ok: true; xom_id: string; xom: string; family_count: number; member: boolean; request: { status: string; kind: string } | null; families: Fam[] }
  | { ok: false; reason: 'not_found' | 'expired' }

// Trang mở từ link mời chung trong nhóm Zalo: đăng nhập → chọn tên có sẵn hoặc khai nhà mới → chờ duyệt
export function GroupJoinPage({ code, session }: { code: string; session: Session | null }) {
  const toast = useToast()
  const [info, setInfo] = useState<Info | null>(null)
  const [mode, setMode] = useState<'pick' | 'new'>('pick')
  const [pick, setPick] = useState<string | null>(null)
  const [f, setF] = useState({ me: '', spouse: '', kids: '' })
  const [busy, setBusy] = useState(false)
  const load = () => sb.rpc('get_group_link', { p_code: code }).then(({ data, error }) => setInfo(error ? { ok: false, reason: 'not_found' } : data as Info))
  useEffect(() => { load() }, [code, session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Đang chờ duyệt: tự kiểm tra lại mỗi 15 giây
  useEffect(() => {
    if (!info?.ok || info.member || info.request?.status !== 'pending') return
    const t = setInterval(load, 15000); return () => clearInterval(t)
  }, [info]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (info?.ok && info.member) { localStorage.setItem('xm-xom', info.xom_id); navigate('/', true) } }, [info])

  async function submit() {
    if (!info?.ok) return
    if (mode === 'pick' && !pick) { toast('Chọn tên của bạn trước nhé'); return }
    if (mode === 'new' && !f.me.trim()) { toast('Điền tên của bạn nhé'); return }
    setBusy(true)
    const { error } = await sb.rpc('request_join', mode === 'pick'
      ? { p_code: code, p_member: pick }
      : { p_code: code, p_member: null, p_adults: [f.me, f.spouse].map(s => s.trim()).filter(Boolean), p_kids: f.kids.split(',').map(s => s.trim()).filter(Boolean) })
    setBusy(false)
    if (error) { toast(errText(error)); return }
    const name = mode === 'pick' ? info.families.flatMap(x => x.open).find(o => o.id === pick)?.name : f.me.trim()
    const t = (await sb.auth.getSession()).data.session?.access_token
    fetch('/api/notify-join', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ xom_id: info.xom_id, name }) }).catch(() => {})
    toast('Đã gửi, chờ trưởng xóm duyệt nhé'); load()
  }

  let body
  if (!info) body = <p className="sub">Đang mở link…</p>
  else if (!info.ok) body = <div className="claim"><h1>Link không dùng được</h1>
    <p className="sub">{info.reason === 'expired' ? 'Link mời chung đã hết hạn.' : 'Không tìm thấy link này, hoặc trưởng xóm đã tắt link.'} Nhắn trưởng xóm gửi link mới nhé.</p>
    <button className="btn ghost" onClick={() => navigate('/')}>Về trang chủ</button></div>
  else if (!session) body = <div className="claim">
    <div className="hello"><h1>Chào bạn!</h1><p>Bạn được mời vào <b>{info.xom}</b>, nơi {info.family_count} gia đình bạn bè rủ nhau cafe, ăn uống và chia sẻ chuyện nhà.</p></div>
    <h2>Đăng nhập trước nhé</h2><p className="sub small">Mỗi người dùng tài khoản riêng của mình (vợ chồng mỗi người một tài khoản).</p>
    <LoginBox redirectTo={location.origin + '/vao/' + code} /></div>
  else if (info.request?.status === 'pending') body = <div className="claim">
    <div className="hello"><h1>Đang chờ duyệt ⏳</h1><p>Trưởng xóm <b>{info.xom}</b> đã nhận được yêu cầu của bạn. Được duyệt là app tự mở xóm, bạn cứ để màn hình này hoặc quay lại sau.</p></div>
    <button className="btn ghost" onClick={load}>Kiểm tra lại</button>
    <button className="link" onClick={() => sb.auth.signOut()}>Đăng xuất ({session.user.email})</button></div>
  else body = <div className="claim">
    <div className="hello"><h1>Vào {info.xom}</h1><p>Chọn tên của bạn nếu trưởng xóm đã tạo sẵn, hoặc khai nhà mình. Trưởng xóm duyệt xong là vào được.</p></div>
    {info.request?.status === 'rejected' && <div className="note">Yêu cầu trước của bạn chưa được duyệt. Kiểm tra lại tên rồi gửi lại, hoặc nhắn trưởng xóm nhé.</div>}
    <div className="seg" style={{ marginTop: 0 }}>
      <button aria-pressed={mode === 'pick'} onClick={() => setMode('pick')}>Tên tôi có sẵn</button>
      <button aria-pressed={mode === 'new'} onClick={() => setMode('new')}>Nhà tôi chưa có</button>
    </div>
    {mode === 'pick' ? (info.families.length ? <div className="stackf">{info.families.map((fm, i) => <div key={i} className="card" style={{ padding: 12 }}>
        <div className="meta" style={{ marginBottom: 8 }}>Nhà {fm.label}</div>
        <div className="chips">{fm.open.map(o => <button key={o.id} className="chip" aria-pressed={pick === o.id} onClick={() => setPick(o.id)}>{o.name}</button>)}</div></div>)}</div>
      : <div className="note">Chưa có tên nào chờ nhận. Chọn "Nhà tôi chưa có" để khai nhà mình nhé.</div>)
    : <div className="stackf">
        <div className="two"><label className="f">Tên của bạn<input maxLength={40} value={f.me} onChange={e => setF({ ...f, me: e.target.value })} /></label>
          <label className="f">Tên vợ/chồng<input maxLength={40} value={f.spouse} onChange={e => setF({ ...f, spouse: e.target.value })} placeholder="Không bắt buộc" /></label></div>
        <label className="f">Tên các bé, cách nhau bằng dấu phẩy<input maxLength={120} value={f.kids} onChange={e => setF({ ...f, kids: e.target.value })} placeholder="VD: Su, Bơ" /></label>
      </div>}
    <button className="btn" disabled={busy} onClick={submit}>Gửi yêu cầu vào xóm</button>
    <p className="sub small">Đang đăng nhập bằng {session.user.email}. Trưởng xóm sẽ thấy email này để biết là bạn.</p>
  </div>
  return <div className="app claiming"><header className="top"><Brand /></header>{body}</div>
}
