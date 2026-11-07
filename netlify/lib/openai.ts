// Làm việc với OpenAI: tự hỏi khoá đang dùng được những model nào, chọn model phù hợp,
// và dịch lỗi của OpenAI thành mã lỗi để app báo bằng tiếng Việt.
import { openaiKey } from './auth'

const H = () => ({ Authorization: 'Bearer ' + openaiKey() })
let cache: { ids: string[]; at: number } | null = null

export async function listModels(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10 * 60e3) return cache.ids
  const r = await fetch('https://api.openai.com/v1/models', { headers: H() })
  if (!r.ok) { console.log('openai models', r.status, (await r.text()).slice(0, 300)); return cache?.ids || [] }
  const ids = ((await r.json()).data || []).map((m: { id: string }) => m.id) as string[]
  cache = { ids, at: Date.now() }
  return ids
}

// Sắp xếp tên model theo phiên bản mới nhất trước (vd. gpt-image-2 > gpt-image-1.5 > gpt-image-1)
const byNewest = (a: string, b: string) => b.localeCompare(a, 'en', { numeric: true })

// Model vẽ ảnh nhìn được ảnh gốc (giống nhất), mới nhất trước; bỏ bản "mini" xuống cuối
export function imageEditModels(ids: string[]) {
  const env = process.env.OPENAI_IMAGE_MODEL
  const list = ids.filter(id => /^(gpt-image|chatgpt-image)/.test(id) && !/\d{4}-\d{2}-\d{2}/.test(id)).sort(byNewest)
  const full = list.filter(id => !/mini/.test(id)), mini = list.filter(id => /mini/.test(id))
  return [...new Set([...(env ? [env] : []), ...full, ...mini])]
}
export const hasDalle3 = (ids: string[]) => ids.includes('dall-e-3')

// Model chat nhỏ, rẻ, đọc được ảnh: ưu tiên biến môi trường, rồi bản "mini" mới nhất
export function chatModel(ids: string[]) {
  if (process.env.OPENAI_CHAT_MODEL) return process.env.OPENAI_CHAT_MODEL
  const ok = ids.filter(id => /^gpt-/.test(id) && !/(audio|realtime|transcribe|tts|search|image|instruct|codex|\d{4}-\d{2}-\d{2})/.test(id))
  return ok.filter(id => /mini/.test(id) && !/nano/.test(id)).sort(byNewest)[0] || ok.sort(byNewest)[0] || 'gpt-4o-mini'
}

// Dịch lỗi của OpenAI
export function errCode(status: number, body: string): string {
  const b = body.toLowerCase()
  if (status === 401 || b.includes('invalid_api_key') || b.includes('incorrect api key')) return 'khoa_sai'
  if (b.includes('insufficient_quota') || b.includes('billing') || b.includes('exceeded your current quota')) return 'het_tien'
  if (b.includes('verif')) return 'can_xac_minh'
  if (b.includes('does not exist') || b.includes('model_not_found') || b.includes('not have access to model') || b.includes('invalid model')) return 'model'
  if (b.includes('content_policy') || b.includes('safety') || b.includes('moderation')) return 'noi_dung'
  if (status === 429) return 'qua_tai'
  return 'ai_loi'
}

export async function openaiJSON(path: string, body: unknown): Promise<{ ok: true; j: any } | { ok: false; code: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch('https://api.openai.com/v1/' + path, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (r.ok) return { ok: true, j: await r.json() }
  const t = await r.text(); console.log('openai', path, r.status, t.slice(0, 400))
  return { ok: false, code: errCode(r.status, t) }
}
export async function openaiForm(path: string, form: FormData): Promise<{ ok: true; j: any } | { ok: false; code: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch('https://api.openai.com/v1/' + path, { method: 'POST', headers: H(), body: form })
  if (r.ok) return { ok: true, j: await r.json() }
  const t = await r.text(); console.log('openai', path, r.status, t.slice(0, 400))
  return { ok: false, code: errCode(r.status, t) }
}

// Lấy ảnh từ kết quả (base64 hoặc đường link)
export async function imageOf(j: { data?: { b64_json?: string; url?: string }[] }): Promise<string | undefined> {
  const d = j.data?.[0]
  if (d?.b64_json) return 'data:image/png;base64,' + d.b64_json
  if (d?.url) { const r = await fetch(d.url); if (r.ok) return 'data:' + (r.headers.get('content-type') || 'image/png') + ';base64,' + Buffer.from(await r.arrayBuffer()).toString('base64') }
}
