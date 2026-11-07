import { useEffect, useState } from 'react'
import { sb, errText } from './supabase'
import { copyText, useToast } from './ui'
import { dm } from './util'
import type { Ctx } from './Activity'

type Req = { id: string; email: string | null; kind: 'claim' | 'new'; member_id: string | null; adults: string[]; kids: string[]; created_at: string }

// Trưởng xóm: link mời chung + danh sách chờ duyệt
export function JoinAdmin({ c, reloadXom }: { c: Ctx; reloadXom: () => void }) {
  const toast = useToast()
  const [link, setLink] = useState<{ code: string | null; exp: string | null }>({ code: null, exp: null })
  const [reqs, setReqs] = useState<Req[]>([])
  const load = async () => {
    const x = await sb.from('xoms').select('group_code,group_expires').eq('id', c.d.xom.id).single()
    if (x.data) setLink({ code: x.data.group_code, exp: x.data.group_expires })
    const r = await sb.from('join_requests').select('id,email,kind,member_id,adults,kids,created_at').eq('xom_id', c.d.xom.id).eq('status', 'pending').order('created_at')
    setReqs((r.data || []) as Req[])
  }
  useEffect(() => { load() }, [c.tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const url = link.code ? location.origin + '/vao/' + link.code : ''
  const live = link.code && link.exp && new Date(link.exp) > new Date()
  async function make() { const { error } = await sb.rpc('make_group_link', { p_xom: c.d.xom.id }); if (error) toast(errText(error)); else { toast('Đã tạo link mời chung mới'); load() } }
  async function stop() { const { error } = await sb.rpc('stop_group_link', { p_xom: c.d.xom.id }); if (error) toast(errText(error)); else { toast('Đã tắt link mời chung'); load() } }
  async function decide(r: Req, ok: boolean) {
    const { error } = await sb.rpc('decide_join', { p_req: r.id, p_approve: ok })
    if (error) toast(errText(error)); else { toast(ok ? 'Đã duyệt, chào mừng thành viên mới!' : 'Đã từ chối'); load(); reloadXom(); c.reload() }
  }
  const msg = `Cả nhà ơi, vào ${c.d.xom.name} của hội mình nhé! Mở link bằng Chrome hoặc Safari, đăng nhập rồi chọn tên mình: ${url}`
  return <>
    {reqs.length > 0 && <section className="section"><div className="section-head"><h2>Chờ duyệt</h2><span className="pipin">{reqs.length}</span></div>
      <div className="list">{reqs.map(r => { const m = r.member_id && c.d.members.find(x => x.id === r.member_id)
        return <div className="row" key={r.id} style={{ flexWrap: 'wrap' }}><div className="grow" style={{ minWidth: 180 }}>
          <div className="name">{r.kind === 'claim' ? `Nhận tên "${m ? m.name : '?'}"` : `Nhà mới: ${r.adults.join(' & ')}`}</div>
          <div className="meta">{r.email || 'không rõ email'} · {dm(new Date(r.created_at))}{r.kids.length ? ' · bé ' + r.kids.join(', ') : ''}</div></div>
          <div style={{ display: 'flex', gap: 8 }}><button className="btn ghost" style={{ minHeight: 44 }} onClick={() => decide(r, false)}>Từ chối</button><button className="btn" style={{ minHeight: 44 }} onClick={() => decide(r, true)}>Duyệt</button></div></div> })}</div>
      <p className="sub small" style={{ margin: 0 }}>Xem email để chắc đúng người quen rồi mới duyệt nhé.</p></section>}
    <section className="section card"><h2>Link mời chung</h2>
      <p className="sub small" style={{ margin: 0 }}>Một link gửi vào nhóm Zalo cho tất cả. Ai mở link cũng phải được trưởng xóm duyệt mới vào được.</p>
      {live ? <>
        <div className="linkbox">{msg}</div>
        <div className="two"><button className="btn" onClick={async () => {
            if (navigator.share) { try { await navigator.share({ text: msg }); return } catch { /* huỷ */ } }
            toast(await copyText(msg) ? 'Đã sao chép, dán vào nhóm Zalo nhé' : 'Bấm giữ đoạn chữ để sao chép') }}>Gửi vào nhóm</button>
          <button className="btn ghost" onClick={stop}>Tắt link</button></div>
        <p className="sub small" style={{ margin: 0 }}>Hết hạn ngày {dm(new Date(link.exp!))}. <button className="link" style={{ minHeight: 0, padding: 0 }} onClick={make}>Tạo link mới</button> thì link cũ hết dùng được.</p>
      </> : <button className="btn" onClick={make}>Tạo link mời chung (hạn 30 ngày)</button>}
    </section>
  </>
}
