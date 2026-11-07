// Trả về khoá công khai để trình duyệt đăng ký nhận thông báo
import { vapidKeys } from '../lib/vapid'

export default async () => Response.json({ publicKey: (await vapidKeys()).publicKey }, { headers: { 'Cache-Control': 'public, max-age=3600' } })

export const config = { path: '/api/vapid' }
