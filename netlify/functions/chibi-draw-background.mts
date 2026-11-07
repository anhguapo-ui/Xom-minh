// Chạy nền (tối đa 15 phút): nhờ OpenAI vẽ chibi từ ảnh, cất kết quả để app hỏi lại.
// Tự hỏi khoá dùng được model nào: thử các model "nhìn ảnh vẽ lại" mới nhất trước,
// không được thì AI tả lại người trong ảnh rồi vẽ từ mô tả (gần giống).
import { getStore } from '@netlify/blobs'
import { listModels, imageEditModels, hasDalle3, chatModel, openaiJSON, openaiForm, imageOf } from '../lib/openai'

const STYLE = 'cute chibi avatar, head and shoulders, big round head, big friendly eyes, soft pastel colors, clean flat vector illustration, front-facing, centered, plain warm cream background, no text'
const PROMPT = `Turn this person into a ${STYLE}. Keep their hairstyle, hair color, glasses, skin tone and recognizable features.`

async function run(dataUrl: string): Promise<{ image?: string; error?: string }> {
  const ids = await listModels()
  console.log('model vẽ có thể dùng:', imageEditModels(ids).join(', ') || '(không có)', '| dall-e-3:', hasDalle3(ids))
  if (!ids.length) return { error: 'khoa_sai' }
  const [, mime, b64] = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/) || []
  let lastErr = 'model'
  // Cách 1: nhìn ảnh vẽ lại
  for (const model of imageEditModels(ids)) {
    const form = new FormData()
    form.append('model', model)
    form.append('image', new Blob([Buffer.from(b64, 'base64')], { type: mime }), 'photo.' + mime.split('/')[1])
    form.append('prompt', PROMPT)
    form.append('size', '1024x1024')
    if (process.env.OPENAI_IMAGE_QUALITY) form.append('quality', process.env.OPENAI_IMAGE_QUALITY)
    const r = await openaiForm('images/edits', form)
    if (r.ok) { const img = await imageOf(r.j); if (img) { console.log('vẽ xong bằng', model); return { image: img } } }
    else { lastErr = r.code; console.log('model', model, 'lỗi', r.code); if (['het_tien', 'khoa_sai', 'noi_dung'].includes(r.code)) return { error: r.code } }
  }
  // Cách 2: tả lại rồi vẽ từ mô tả
  const gen = hasDalle3(ids) ? 'dall-e-3' : imageEditModels(ids)[0]
  if (!gen) return { error: lastErr }
  const d = await openaiJSON('chat/completions', {
    model: chatModel(ids), max_tokens: 120,
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Describe only the visible appearance of the main person for an illustrator, in one short English sentence: approximate age group, gender presentation, hairstyle and hair color, skin tone, glasses, facial hair, clothing color. No names, no guesses about identity.' },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }] }],
  })
  if (!d.ok) return { error: d.code }
  const desc = String(d.j.choices?.[0]?.message?.content || 'a friendly person').slice(0, 400)
  const g = await openaiJSON('images/generations', { model: gen, prompt: `${STYLE}. The character: ${desc}`, size: '1024x1024', n: 1, ...(gen === 'dall-e-3' ? { response_format: 'b64_json' } : {}) })
  if (!g.ok) return { error: g.code === 'model' ? lastErr : g.code }
  const img = await imageOf(g.j)
  console.log('vẽ xong bằng mô tả +', gen)
  return img ? { image: img } : { error: 'ai_loi' }
}

export default async (req: Request) => {
  if ((req.headers.get('x-job-secret') || '') !== (process.env.JOB_SECRET || 'xm')) return
  const { job } = await req.json().catch(() => ({ job: '' }))
  if (!/^[0-9a-f-]{36}$/.test(job)) return
  const store = getStore('chibi-jobs')
  const img = await store.get('in/' + job, { type: 'text' }); if (!img) return
  try { await store.setJSON('out/' + job, await run(img)) }
  catch (e) { console.log('draw error', e); await store.setJSON('out/' + job, { error: 'ai_loi' }) }
  finally { await store.delete('in/' + job) }
}
