// Khoá VAPID cho thông báo đẩy: máy chủ tự tạo lần đầu và cất trong Netlify Blobs.
// Khoá riêng không bao giờ nằm trong code hay đi qua trình duyệt.
import { getStore } from '@netlify/blobs'
import webpush from 'web-push'

type Keys = { publicKey: string; privateKey: string }
let cached: Keys | null = null

export async function vapidKeys(): Promise<Keys> {
  if (cached) return cached
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY })
  const store = getStore('xom-minh-keys')
  let k = await store.get('vapid', { type: 'json' }) as Keys | null
  if (!k) {
    await store.setJSON('vapid', webpush.generateVAPIDKeys(), { onlyIfNew: true })
    k = await store.get('vapid', { type: 'json' }) as Keys
  }
  return (cached = k)
}
