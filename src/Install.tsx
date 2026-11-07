import { useEffect, useState } from 'react'
import { enablePush, disablePush, isIOS, isStandalone, pushState, type PushState } from './push'
import { useToast } from './ui'

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIP | null = null
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIP })

// Thẻ trên màn Hôm nay: cài app lên màn hình chính và bật thông báo
export function NotifyCard({ memberId, xomId }: { memberId: string; xomId: string }) {
  const toast = useToast()
  const [st, setSt] = useState<PushState | null>(null)
  const [hide, setHide] = useState(() => { try { return localStorage.getItem('xm-hide-notify') === '1' } catch { return false } })
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushState().then(setSt) }, [])
  if (!st || st === 'on' || st === 'unsupported' || hide) return null
  const dismiss = () => { try { localStorage.setItem('xm-hide-notify', '1') } catch { /* bỏ qua */ } setHide(true) }

  if (st === 'ios-install') return <section className="section card notify-card">
    <h2>📲 Cài Xóm Mình lên iPhone</h2>
    <p className="sub small" style={{ margin: 0 }}>iPhone chỉ nhận thông báo khi app đã được thêm vào màn hình chính. Làm một lần là xong:</p>
    <ol className="steps-list">
      <li>Mở trang này bằng <b>Safari</b>.</li>
      <li>Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên) ở thanh dưới.</li>
      <li>Kéo xuống, chọn <b>"Thêm vào MH chính"</b>, rồi bấm <b>Thêm</b>.</li>
      <li>Mở Xóm Mình từ biểu tượng mới trên màn hình, bấm <b>Bật thông báo</b>.</li>
    </ol>
    <button className="link" onClick={dismiss}>Để sau</button>
  </section>

  return <section className="section card notify-card">
    <h2>🔔 Bật thông báo</h2>
    <p className="sub small" style={{ margin: 0 }}>Biết ngay khi có kèo mới, kèo chốt, tin nhắn, và được nhắc trước mùng 1, rằm, sinh nhật trong xóm.</p>
    {st === 'denied'
      ? <p className="note" style={{ margin: 0 }}>Trình duyệt đang chặn thông báo của Xóm Mình. Vào cài đặt trang web (biểu tượng ổ khoá cạnh địa chỉ), chọn <b>Thông báo → Cho phép</b>, rồi tải lại trang.</p>
      : <button className="btn" disabled={busy} onClick={async () => {
          setBusy(true); const err = await enablePush(memberId, xomId); setBusy(false)
          if (err) toast(err); else { toast('Đã bật thông báo 🔔'); setSt('on') }
        }}>Bật thông báo</button>}
    {deferred && !isStandalone() && !isIOS() && <button className="btn ghost" onClick={async () => { await deferred!.prompt(); deferred = null }}>📲 Cài app lên màn hình chính</button>}
    <button className="link" onClick={dismiss}>Để sau</button>
  </section>
}

// Dòng bật/tắt trong màn tài khoản
export function NotifyToggle({ memberId, xomId }: { memberId: string; xomId: string }) {
  const toast = useToast()
  const [st, setSt] = useState<PushState | null>(null)
  useEffect(() => { pushState().then(setSt) }, [])
  if (!st || st === 'unsupported') return null
  if (st === 'ios-install') return <p className="sub small" style={{ margin: 0 }}>Muốn nhận thông báo trên iPhone: thêm Xóm Mình vào màn hình chính (Safari → Chia sẻ → Thêm vào MH chính).</p>
  return st === 'on'
    ? <button className="btn ghost" onClick={async () => { await disablePush(); setSt('off'); toast('Đã tắt thông báo trên máy này') }}>🔕 Tắt thông báo trên máy này</button>
    : <button className="btn ghost" disabled={st === 'denied'} onClick={async () => { const e = await enablePush(memberId, xomId); if (e) toast(e); else { setSt('on'); toast('Đã bật thông báo 🔔') } }}>🔔 Bật thông báo trên máy này</button>
}
