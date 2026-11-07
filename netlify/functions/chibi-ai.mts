// AI vẽ chibi từ ảnh: nhận ảnh, giao cho hàm chạy nền vẽ, app hỏi lại kết quả theo mã công việc.
import { getStore } from '@netlify/blobs'
import { caller, takeQuota, openaiKey } from '../lib/auth'


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
