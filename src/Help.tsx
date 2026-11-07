import { useEffect, useState } from 'react'
import { sb, errText } from './supabase'
import { MemberHead, Sheet, copyText, useToast } from './ui'
import { notify } from './push'
import { dayDiff, dm } from './util'
import type { Ctx } from './Activity'

type Kind = 'lend' | 'ask' | 'contact'
type Post = { id: string; member_id: string; kind: Kind; title: string; body: string | null; phone: string | null; status: 'open' | 'busy' | 'done'; created_at: string }
type Resp = { post_id: string; member_id: string; note: string | null; created_at: string }

const KIND: Record<Kind, { e: string; t: string; act: string; busy: string; ph: string }> = {
  lend: { e: '🧰', t: 'Cho mượn', act: 'Mình muốn mượn', busy: 'Đang cho mượn', ph: 'VD: Lều cắm trại 4 người' },
  ask: { e: '🙋', t: 'Nhờ việc', act: 'Mình giúp được', busy: 'Đã có người giúp', ph: 'VD: Chiều mai ai đón hộ bé Su lúc 5h?' },
  contact: { e: '📇', t: 'Danh bạ tin cậy', act: '👍 Mình cũng dùng', busy: '', ph: 'VD: Thợ điện anh Tâm, làm kỹ, giá ổn' },
}

export function HelpTab({ c }: { c: Ctx }) {
  const toast = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [resps, setResps] = useState<Resp[]>([])
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [compose, setCompose] = useState(false)
  const reload = async () => {
    const { data } = await sb.from('help_posts').select('*').eq('xom_id', c.d.xom.id).order('created_at', { ascending: false }).limit(100)
    const ps = (data || []) as Post[]; setPosts(ps)
    if (ps.length) { const r = await sb.from('help_responses').select('post_id,member_id,note,created_at').in('post_id', ps.map(p => p.id)); setResps((r.data || []) as Resp[]) } else setResps([])
  }
  useEffect(() => { reload() }, [c.tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const who = (id: string) => c.d.members.find(m => m.id === id)
  async function respond(p: Post) {
    const mine = resps.find(r => r.post_id === p.id && r.member_id === c.me.id)
    const r = mine ? await sb.from('help_responses').delete().eq('post_id', p.id).eq('member_id', c.me.id)
      : await sb.from('help_responses').insert({ post_id: p.id, member_id: c.me.id, xom_id: c.d.xom.id })
    if (r.error) { toast(errText(r.error)); return }
    if (!mine && p.kind !== 'contact') notify(c.d.xom.id, KIND[p.kind].e + ' ' + c.me.name + ': ' + KIND[p.kind].act.toLowerCase(), p.title, '/', 'help-' + p.id)
    reload()
  }
  async function setStatus(p: Post, s: Post['status']) { const { error } = await sb.from('help_posts').update({ status: s }).eq('id', p.id); if (error) toast(errText(error)); else reload() }
  async function del(p: Post) { const { error } = await sb.from('help_posts').delete().eq('id', p.id); if (error) toast(errText(error)); else { toast('Đã gỡ tin'); reload() } }

  const list = posts.filter(p => filter === 'all' || p.kind === filter)
  return <>
    <p className="sub" style={{ marginTop: 14 }}>Hàng xóm tối lửa tắt đèn: cho mượn đồ, nhờ nhau một việc, giới thiệu người quen tin cậy.</p>
    <div className="chips" style={{ marginTop: 12 }}>
      {([['all', 'Tất cả'], ['lend', '🧰 Cho mượn'], ['ask', '🙋 Nhờ việc'], ['contact', '📇 Danh bạ']] as const).map(([k, t]) =>
        <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>)}
    </div>
    <section className="section">
      <button className="btn sun block" onClick={() => setCompose(true)}>+ Đăng tin tương trợ</button>
      {!list.length && <div className="note">Chưa có tin nào. Nhà mình có gì cho mượn, hay cần nhờ gì, cứ đăng nhé!</div>}
      {list.map(p => { const m = who(p.member_id), rs = resps.filter(r => r.post_id === p.id), mine = p.member_id === c.me.id, iDid = rs.some(r => r.member_id === c.me.id)
        return <article key={p.id} className={'card kcard help' + (p.status === 'done' ? ' done' : '')}>
          <div className="ktop"><div className="kicon" aria-hidden="true">{KIND[p.kind].e}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="ktitle">{p.title}</div>
              <div className="kmeta"><span>{KIND[p.kind].t} · {m?.name || 'Ai đó'} · {dayDiff(new Date(p.created_at)) === 0 ? 'hôm nay' : dm(new Date(p.created_at))}</span></div></div>
            {p.status !== 'open' && p.kind !== 'contact' && <span className={'badge ' + (p.status === 'done' ? 'wait' : 'lock')}>{p.status === 'done' ? 'Đã xong' : KIND[p.kind].busy}</span>}</div>
          {p.body && <p className="note" style={{ whiteSpace: 'pre-line' }}>{p.body}</p>}
          {p.phone && <button className="link" style={{ alignSelf: 'flex-start' }} onClick={async () => toast(await copyText(p.phone!) ? 'Đã chép số ' + p.phone : p.phone!)}>📞 {p.phone} (bấm để chép)</button>}
          {rs.length > 0 && <div className="going">{rs.slice(0, 8).map(r => { const x = who(r.member_id); return x && <MemberHead key={r.member_id} m={x} sm /> })}
            <span>{p.kind === 'contact' ? rs.length + ' người cũng dùng' : rs.map(r => who(r.member_id)?.name).filter(Boolean).join(', ') + (p.kind === 'lend' ? ' muốn mượn' : ' giúp được')}</span></div>}
          {mine ? <div className="chips">
              {p.kind !== 'contact' && p.status !== 'busy' && <button className="chip" onClick={() => setStatus(p, 'busy')}>{KIND[p.kind].busy}</button>}
              {p.kind !== 'contact' && p.status !== 'done' && <button className="chip" onClick={() => setStatus(p, 'done')}>Đã xong</button>}
              {p.status !== 'open' && <button className="chip" onClick={() => setStatus(p, 'open')}>Mở lại</button>}
              <button className="chip" onClick={() => del(p)}>Gỡ tin</button></div>
            : p.status !== 'done' && <button className={'btn ' + (iDid ? '' : 'ghost')} onClick={() => respond(p)}>{iDid ? '✓ ' : ''}{KIND[p.kind].act}</button>}
          {!mine && c.me.is_admin && <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => del(p)}>Gỡ tin (trưởng xóm)</button>}
        </article> })}
    </section>
    {compose && <NewHelp c={c} onClose={() => setCompose(false)} after={reload} />}
  </>
}

function NewHelp({ c, onClose, after }: { c: Ctx; onClose: () => void; after: () => void }) {
  const toast = useToast()
  const [kind, setKind] = useState<Kind>('lend'), [title, setTitle] = useState(''), [body, setBody] = useState(''), [phone, setPhone] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await sb.from('help_posts').insert({ xom_id: c.d.xom.id, member_id: c.me.id, kind, title: title.trim(), body: body.trim() || null, phone: kind === 'contact' ? phone.trim() || null : null })
    if (error) { toast(errText(error)); return }
    notify(c.d.xom.id, KIND[kind].e + ' ' + c.me.name + ' · ' + KIND[kind].t, title.trim(), '/', 'help-new')
    toast('Đã đăng tin'); after(); onClose()
  }
  return <Sheet label="Đăng tin tương trợ" onClose={onClose}><h2>Đăng tin tương trợ</h2>
    <form className="stackf" onSubmit={submit}>
      <div className="chips" role="radiogroup" aria-label="Loại tin">{(Object.keys(KIND) as Kind[]).map(k =>
        <button type="button" key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND[k].e} {KIND[k].t}</button>)}</div>
      <label className="f">{kind === 'contact' ? 'Ai, làm gì' : kind === 'lend' ? 'Đồ cho mượn' : 'Cần nhờ gì'}<input required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder={KIND[kind].ph} /></label>
      <label className="f">Thêm chi tiết (không bắt buộc)<textarea rows={3} maxLength={400} value={body} onChange={e => setBody(e.target.value)} placeholder={kind === 'contact' ? 'VD: Đã sửa điện nhà mình 2 lần, đúng hẹn' : 'VD: Mượn trong tuần, nhớ trả nhé'} /></label>
      {kind === 'contact' && <label className="f">Số điện thoại<input type="tel" inputMode="tel" maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} placeholder="09xx xxx xxx" /></label>}
      <button className="btn" type="submit">Đăng tin</button>
    </form></Sheet>
}
