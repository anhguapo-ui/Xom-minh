import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb, errText, loadXom, type XomData } from './supabase'
import { navigate } from './util'
import { Brand, Head, useToast } from './ui'
import { readLook } from './chibi'
import { LoginBox } from './Login'
import { FamilyForm } from './FamilyForm'

type Person = { id: string; name: string; claimed: boolean }
type InviteInfo = { ok: true; xom: string; inviter: string | null; family_count: number; member: Person | null; adults: { id: string; name: string; claimed: boolean }[]; kids: string[] }
  | { ok: false; reason: 'not_found' | 'revoked' | 'expired' | 'used' }

const PENDING = 'xm-pending-claim'
const REASON: Record<string, string> = {
  not_found: 'Không tìm thấy link mời này. Kiểm tra lại xem đã copy đủ link chưa nhé.',
  revoked: 'Link mời này đã được thay bằng link mới. Nhắn người mời gửi lại link nhé.',
  expired: 'Link mời đã hết hạn (sau 7 ngày). Nhắn người mời gửi lại link nhé.',
  used: 'Link mời này đã được dùng đủ số người. Nếu bạn chưa vào được, nhắn người mời gửi link mới nhé.',
}

export function InvitePage({ code, session }: { code: string; session: Session | null }) {
  const toast = useToast()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [step, setStep] = useState<'who' | 'login' | 'claiming' | 'profile' | 'already'>('who')
  const [data, setData] = useState<XomData | null>(null)
  const [me, setMe] = useState<string | null>(null)

  useEffect(() => {
    sb.rpc('get_invite', { p_code: code }).then(({ data, error }) => {
      if (error) { toast(errText(error)); setInfo({ ok: false, reason: 'not_found' }); return }
      setInfo(data as InviteInfo)
    })
  }, [code, toast])

  const claim = useCallback(async (memberId: string) => {
    setStep('claiming')
    const { data: xomId, error } = await sb.rpc('claim_invite', { p_code: code, p_member: memberId })
    localStorage.removeItem(PENDING)
    if (error) {
      if (/đã ở trong xóm/.test(error.message)) { setStep('already'); return }
      toast(errText(error)); setStep('who'); return
    }
    localStorage.setItem('xm-xom', xomId as string)
    setMe(memberId)
    setData(await loadXom(xomId as string))
    setStep('profile')
  }, [code, toast])

  useEffect(() => {
    if (info?.ok && info.member && !info.member.claimed && !session) localStorage.setItem(PENDING, JSON.stringify({ code, member: info.member.id }))
  }, [info, session, code])

  // Quay lại sau khi đăng nhập Google/email: tự nhận tên đã chọn trước đó
  useEffect(() => {
    if (!session || !info?.ok || step !== 'who') return
    try {
      const p = JSON.parse(localStorage.getItem(PENDING) || 'null')
      if (p && p.code === code) claim(p.member)
    } catch { /* bỏ qua */ }
  }, [session, info, code, claim, step])

  function choose(id: string) {
    setPick(id)
    if (session) claim(id)
    else { localStorage.setItem(PENDING, JSON.stringify({ code, member: id })); setStep('login') }
  }

  const bar = (n: number) => <div className="steps" aria-label={'Bước ' + n + '/3'}>{[1, 2, 3].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}</div>

  let body
  if (!info) body = <p className="sub">Đang mở link mời…</p>
  else if (!info.ok) body = <div className="claim"><h1>Chưa vào được rồi</h1><p className="sub">{REASON[info.reason]}</p>
    <button className="btn ghost" onClick={() => navigate('/')}>Về trang chủ</button></div>
  else if (step === 'already') body = <div className="claim"><h1>Bạn đã ở trong xóm rồi</h1>
    <p className="sub">Tài khoản này đã vào xóm {info.xom} trước đó. Nếu bạn muốn nhận tên khác, nhắn trưởng xóm nhé.</p>
    <button className="btn" onClick={() => navigate('/', true)}>Vào xóm</button></div>
  else if (step === 'profile' && data && me) {
    const fam = data.families.find(f => f.id === data.members.find(m => m.id === me)?.family_id)!
    body = <div className="claim">{bar(3)}
      <h1>Hồ sơ nhà mình</h1>
      <p className="sub">{info.inviter || 'Người mời'} đã điền sẵn những gì biết. Bạn kiểm tra lại và bổ sung giúp nhé. Vợ hoặc chồng đều sửa được.</p>
      <FamilyForm d={data} family={fam} ownerId={me} submitLabel="Vào xóm 🎉" onDone={() => { toast('Chào mừng đến với ' + info.xom + '!'); navigate('/', true) }} />
    </div>
  } else if (step === 'claiming') body = <p className="sub">Đang nhận tên…</p>
  else if (step === 'login' && pick) {
    const name = info.adults.find(a => a.id === pick)?.name
    body = <div className="claim">{bar(2)}
      <h1>Chào {name} 👋</h1>
      <p className="sub">Đăng nhập một lần, lần sau mở app là vào thẳng, không cần link nữa.</p>
      <LoginBox redirectTo={location.origin + '/moi/' + code} />
      <button className="link" onClick={() => { localStorage.removeItem(PENDING); setStep('who') }}>‹ Chọn lại người</button>
    </div>
  } else if (info.member) {
    const p = info.member
    body = p.claimed
      ? <div className="claim"><h1>Link này đã được dùng</h1><p className="sub">{p.name} đã vào xóm bằng link này. Nếu đó không phải bạn, nhắn trưởng xóm gỡ ra và gửi link mới nhé.</p>
          <button className="btn ghost" onClick={() => navigate('/')}>Về trang chủ</button></div>
      : <div className="claim">{bar(1)}
        <div className="hello"><h1>Chào {p.name}!</h1>
          <p>{info.inviter || 'Bạn bè'} mời {p.name} vào <b>{info.xom}</b>{info.family_count > 1 ? `, nơi ${info.family_count - 1} gia đình bạn bè` : ''} rủ nhau cafe, ăn uống và chia sẻ chuyện nhà.</p></div>
        {session
          ? <><p className="sub">Bạn đang đăng nhập bằng {session.user.email}.</p><button className="btn" onClick={() => claim(p.id)}>Nhận tên {p.name} và vào xóm</button>
              <button className="link" onClick={() => sb.auth.signOut()}>Không phải tài khoản của {p.name}? Đăng xuất</button></>
          : <><p className="sub">Đăng nhập một lần, lần sau mở app là vào thẳng.</p>
              <LoginBox redirectTo={location.origin + '/moi/' + code} /></>}
        <p className="sub small">Không phải {p.name}? Link này là link riêng, nhắn người mời gửi đúng link của bạn nhé.</p>
      </div>
  } else body = <div className="claim">{bar(1)}
    <div className="hello"><h1>Chào nhà {info.adults.map(a => a.name).join(' & ')}!</h1>
      <p>{info.inviter || 'Bạn bè'} mời cả nhà vào <b>{info.xom}</b>{info.family_count > 1 ? `, nơi ${info.family_count - 1} gia đình bạn bè` : ', nơi các gia đình bạn bè'} rủ nhau cafe, ăn uống và chia sẻ chuyện nhà.</p></div>
    <h2>Anh/chị là ai?</h2>
    {info.adults.map(a => <button key={a.id} className="pick" disabled={a.claimed} onClick={() => choose(a.id)}>
      <Head look={readLook(null, a.id, 'adult')} />
      <span>{a.name}<small>{a.claimed ? 'Đã vào xóm' : 'Bấm để nhận tên này'}</small></span></button>)}
    {info.kids.length > 0 && <p className="sub small">Các bé: {info.kids.join(', ')}</p>}
    <p className="sub small">Tên bị sai chính tả? Cứ chọn, bước sau sửa được.</p>
  </div>

  return <div className="app claiming"><header className="top"><Brand /></header>{body}</div>
}
