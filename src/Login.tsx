import { useState } from 'react'
import { sb, errText } from './supabase'
import { inAppBrowser } from './util'
import { Brand, copyText, useToast } from './ui'

// Hộp đăng nhập dùng chung cho trang chủ và trang nhận link mời
export function LoginBox({ redirectTo }: { redirectTo: string }) {
  const toast = useToast()
  const inApp = inAppBrowser()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function google() {
    setBusy(true)
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (error) { toast(errText(error)); setBusy(false) }
  }
  async function sendMail(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } })
    setBusy(false)
    if (error) toast(/rate/i.test(error.message) ? 'Gửi thư nhiều quá, đợi vài phút rồi thử lại nhé.' : errText(error))
    else setSent(true)
  }

  return <div className="stackf">
    {inApp && <div className="inapp">
      <b>Đang mở trong {inApp}</b>
      <p>Google không cho đăng nhập ngay trong {inApp}. Bấm <b>⋯</b> ở góc trên bên phải, chọn <b>"Mở bằng trình duyệt"</b> (Chrome hoặc Safari), rồi đăng nhập ở đó.</p>
      <button className="btn ghost" type="button" onClick={async () => toast(await copyText(location.href) ? 'Đã sao chép link, dán vào Chrome hoặc Safari nhé' : 'Bấm giữ thanh địa chỉ để sao chép link')}>Sao chép link này</button>
      <p className="small">Hoặc đăng nhập bằng email ở bên dưới, cách này dùng được ngay trong {inApp}.</p>
    </div>}
    {!inApp && <button className="gbtn" type="button" onClick={google} disabled={busy}><i>G</i>Tiếp tục với Google</button>}
    <div className="or"><span>hoặc dùng email</span></div>
    {sent
      ? <div className="note">Đã gửi thư đến <b>{email}</b>. Mở hộp thư trên máy này, bấm vào link trong thư là vào được. Không thấy thì xem cả mục Spam nhé.</div>
      : <form className="stackf" onSubmit={sendMail}>
          <label className="f">Email của bạn<input id="login-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ten@gmail.com" /></label>
          <button className="btn ghost" type="submit" disabled={busy}>Gửi link đăng nhập qua email</button>
        </form>}
  </div>
}

export function LoginPage() {
  return <div className="app"><header className="top"><Brand /></header>
    <div className="hello" style={{ marginTop: 8 }}>
      <h1>Hội bạn của các gia đình</h1>
      <p>Điểm danh mỗi ngày, rủ nhau cafe, bia, ăn trưa, xung phong đăng cai, cùng đi lễ Miếu Thần Tài của xóm.</p>
    </div>
    <section className="section">
      <h2>Đăng nhập</h2>
      <p className="sub small">Xóm Mình chỉ dành cho người được mời. Nếu bạn bè gửi link mời, hãy mở đúng link đó.</p>
      <LoginBox redirectTo={location.origin + '/'} />
    </section>
    <p className="sub small" style={{ marginTop: 24 }}>Muốn xem thử trước? <a href="/demo/">Mở bản demo</a></p>
  </div>
}
