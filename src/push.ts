import { sb } from './supabase'

// Khoá công khai lấy từ máy chủ (/api/vapid); khoá riêng chỉ nằm trên máy chủ
async function vapidPublic(): Promise<string> { const r = await fetch('/api/vapid'); if (!r.ok) throw new Error('Máy chủ thông báo chưa sẵn sàng, thử lại sau nhé.'); return (await r.json()).publicKey }

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* trình duyệt không hỗ trợ */ })
}

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'ios-install' // iPhone chỉ nhận thông báo khi đã thêm vào màn hình chính
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg && await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function enablePush(memberId: string, xomId: string): Promise<string | null> {
  if (!supported()) return 'Trình duyệt này chưa hỗ trợ thông báo.'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Bạn chưa cho phép thông báo. Có thể bật lại trong cài đặt trình duyệt.'
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) { try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await vapidPublic()) }) } catch (e) { return e instanceof Error ? e.message : 'Không bật được thông báo.' } }
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await sb.from('push_subscriptions').insert({ member_id: memberId, xom_id: xomId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth })
  if (error && !/duplicate|unique/i.test(error.message)) return error.message
  return null
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = reg && await reg.pushManager.getSubscription()
  if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
}

// Báo cho cả xóm (trừ mình). Không chặn giao diện, lỗi thì bỏ qua.
export function notify(xomId: string, title: string, body: string, url = '/', tag = 'xom') {
  sb.auth.getSession().then(({ data }) => {
    const t = data.session?.access_token; if (!t) return
    fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ xom_id: xomId, title, body, url, tag }) }).catch(() => {})
  })
}
