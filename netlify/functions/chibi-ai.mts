// AI chibi: "pick" chọn kiểu chibi từ ảnh (nhanh); "draw" vẽ chân dung chibi (chạy nền, app hỏi lại kết quả).
import { getStore } from '@netlify/blobs'
import { caller, takeQuota, openaiKey } from '../lib/auth'

const HAIRS = ['short', 'side', 'buzz', 'spiky', 'long', 'bun', 'pony', 'bob', 'pigtails']

export default async (req: Request) => {
  const url = new URL(req.url)
  // Hỏi kết quả vẽ
  if (req.method === 'GET') {
    const job = url.searchParams.get('job') || ''
    if (!/^[0-9a-f-]{36}$/.test(job)) return new Response('Bad request', { status: 400 })
    const res = await getStore('chibi-jobs').get('out/' + job, { type: 'json' }) as { image?: string; error?: string } | null
    return Response.json(res || { pending: true })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!openaiKey()) return Response.json({ error: 'chua_co_khoa' }, { status: 503 })
  let b: { xom_id?: string; mode?: string; image?: string; kid?: boolean; consent?: boolean }
  try { b = await req.json() } catch { return new Response('Bad request', { status: 400 }) }
  const xom = String(b.xom_id || '')
  const c = await caller(req, xom); if (c instanceof Response) return c
  const img = String(b.image || '')
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 1_500_000) return Response.json({ error: 'anh_khong_hop_le' }, { status: 400 })
  if (b.kid && !b.consent) return Response.json({ error: 'can_dong_y' }, { status: 400 })

  if (b.mode === 'pick') {
    const left = await takeQuota(c, xom, 'pick'); if (left instanceof Response) return left
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey() },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', response_format: { type: 'json_object' }, max_tokens: 200,
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Nhìn người trong ảnh, chọn kiểu chibi gần giống nhất. Trả về JSON đúng dạng:
{"hair": một trong ${JSON.stringify(HAIRS)}, "hairC": số 0-4 (0 đen, 1 nâu đen, 2 nâu, 3 vàng nâu, 4 đen xanh), "skin": số 0-3 (0 rất sáng, 1 sáng, 2 ngăm, 3 nâu), "glasses": true/false, "acc": "none" | "bow" | "cap", "shirt": số 0-7 (0 cam, 1 xanh ngọc, 2 xanh dương, 3 đỏ hồng, 4 tím, 5 vàng, 6 xanh lá, 7 xanh nhạt; theo màu áo trong ảnh)}` },
          { type: 'image_url', image_url: { url: img, detail: 'low' } }] }],
      }),
    })
    if (!r.ok) { console.log('openai pick', r.status, (await r.text()).slice(0, 300)); return Response.json({ error: 'ai_loi' }, { status: 502 }) }
    const j = await r.json()
    try { return Response.json({ pick: JSON.parse(j.choices?.[0]?.message?.content || '{}'), left }) } catch { return Response.json({ error: 'ai_loi' }, { status: 502 }) }
  }

  if (b.mode === 'draw') {
    const left = await takeQuota(c, xom, 'draw'); if (left instanceof Response) return left
    const job = crypto.randomUUID()
    await getStore('chibi-jobs').set('in/' + job, img)
    const base = process.env.URL || url.origin
    await fetch(base + '/.netlify/functions/chibi-draw-background', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-job-secret': process.env.JOB_SECRET || 'xm' }, body: JSON.stringify({ job }) })
    return Response.json({ job, left })
  }
  return new Response('Bad request', { status: 400 })
}

export const config = { path: '/api/chibi-ai' }
