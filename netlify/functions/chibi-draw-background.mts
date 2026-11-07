// Chạy nền (tối đa 15 phút): nhờ OpenAI vẽ chibi từ ảnh, cất kết quả để app hỏi lại.
// Cách 1: gpt-image-1 nhìn ảnh vẽ lại (giống nhất, cần tài khoản OpenAI đã xác minh tổ chức).
// Cách 2 (tự chuyển khi cách 1 bị từ chối): AI tả lại người trong ảnh, rồi dall-e-3 vẽ chibi từ mô tả (gần giống).
import { getStore } from '@netlify/blobs'
import { openaiKey } from '../lib/auth'

const STYLE = 'cute chibi avatar, head and shoulders, big round head, big friendly eyes, soft pastel colors, clean flat vector illustration, front-facing, centered, plain warm cream background, no text'
const PROMPT = `Turn this person into a ${STYLE}. Keep their hairstyle, hair color, glasses, skin tone and recognizable features.`
const H = () => ({ Authorization: 'Bearer ' + openaiKey() })

async function drawFromPhoto(mime: string, b64: string): Promise<{ image?: string; status: number; msg?: string }> {
  const form = new FormData()
  form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1')
  form.append('image', new Blob([Buffer.from(b64, 'base64')], { type: mime }), 'photo.' + mime.split('/')[1])
  form.append('prompt', PROMPT)
  form.append('size', '1024x1024')
  form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium')
  const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: H(), body: form })
  if (!r.ok) return { status: r.status, msg: (await r.text()).slice(0, 300) }
  const j = await r.json()
  return { status: 200, image: j.data?.[0]?.b64_json ? 'data:image/png;base64,' + j.data[0].b64_json : undefined }
}

async function drawFromDescription(dataUrl: string): Promise<string | undefined> {
  const d = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', max_tokens: 120,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe only the visible appearance of the main person for an illustrator, in one short English sentence: approximate age group, gender presentation, hairstyle and hair color, skin tone, glasses, facial hair, clothing color. No names, no guesses about identity.' },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }] }],
    }),
  })
  if (!d.ok) { console.log('describe', d.status, (await d.text()).slice(0, 300)); return }
  const desc = String((await d.json()).choices?.[0]?.message?.content || 'a friendly person').slice(0, 400)
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt: `${STYLE}. The character: ${desc}`, size: '1024x1024', response_format: 'b64_json', n: 1 }),
  })
  if (!r.ok) { console.log('dall-e-3', r.status, (await r.text()).slice(0, 300)); return }
  const j = await r.json()
  return j.data?.[0]?.b64_json ? 'data:image/png;base64,' + j.data[0].b64_json : undefined
}

export default async (req: Request) => {
  if ((req.headers.get('x-job-secret') || '') !== (process.env.JOB_SECRET || 'xm')) return
  const { job } = await req.json().catch(() => ({ job: '' }))
  if (!/^[0-9a-f-]{36}$/.test(job)) return
  const store = getStore('chibi-jobs')
  const img = await store.get('in/' + job, { type: 'text' }); if (!img) return
  try {
    const [, mime, b64] = img.match(/^data:(image\/\w+);base64,(.*)$/) || []
    let out: string | undefined
    const first = await drawFromPhoto(mime, b64)
    if (first.image) out = first.image
    else {
      console.log('gpt-image-1 bị từ chối, chuyển cách dự phòng', first.status, first.msg)
      out = await drawFromDescription(img)
    }
    await store.setJSON('out/' + job, out ? { image: out } : { error: 'ai_loi' })
  } catch (e) {
    console.log('draw error', e); await store.setJSON('out/' + job, { error: 'ai_loi' })
  } finally { await store.delete('in/' + job) }
}
