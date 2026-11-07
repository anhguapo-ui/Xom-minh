// Chạy nền (tối đa 15 phút): nhờ OpenAI vẽ chân dung chibi từ ảnh, cất kết quả để app hỏi lại.
import { getStore } from '@netlify/blobs'
import { openaiKey } from '../lib/auth'

const PROMPT = 'Turn this person into a cute chibi avatar head-and-shoulders portrait: big round head, big friendly eyes, soft pastel colors, clean flat illustration, front-facing, centered, plain warm cream background. Keep their hairstyle, hair color, glasses and recognizable features. No text.'

export default async (req: Request) => {
  if ((req.headers.get('x-job-secret') || '') !== (process.env.JOB_SECRET || 'xm')) return
  const { job } = await req.json().catch(() => ({ job: '' }))
  if (!/^[0-9a-f-]{36}$/.test(job)) return
  const store = getStore('chibi-jobs')
  const img = await store.get('in/' + job, { type: 'text' }); if (!img) return
  try {
    const [, mime, b64] = img.match(/^data:(image\/\w+);base64,(.*)$/) || []
    const form = new FormData()
    form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1')
    form.append('image', new Blob([Buffer.from(b64, 'base64')], { type: mime }), 'photo.' + mime.split('/')[1])
    form.append('prompt', PROMPT)
    form.append('size', '1024x1024')
    form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium')
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + openaiKey() }, body: form })
    if (!r.ok) { console.log('openai draw', r.status, (await r.text()).slice(0, 300)); await store.setJSON('out/' + job, { error: 'ai_loi' }); return }
    const j = await r.json()
    const out = j.data?.[0]?.b64_json
    await store.setJSON('out/' + job, out ? { image: 'data:image/png;base64,' + out } : { error: 'ai_loi' })
  } catch (e) {
    console.log('draw error', e); await store.setJSON('out/' + job, { error: 'ai_loi' })
  } finally { await store.delete('in/' + job) }
}
