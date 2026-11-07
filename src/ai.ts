import { sb } from './supabase'

const MSG: Record<string, string> = {
  het_luot: 'Hết lượt dùng AI rồi, mai (hoặc tháng sau) quay lại nhé.',
  chua_co_khoa: 'Máy chủ chưa có khoá AI, nhắn trưởng xóm kiểm tra giúp.',
  ai_loi: 'AI đang bận hoặc gặp lỗi, thử lại sau ít phút nhé.',
  can_dong_y: 'Cần cha mẹ đồng ý trước khi gửi ảnh của bé cho AI.',
  anh_khong_hop_le: 'Ảnh không hợp lệ hoặc quá lớn, chọn ảnh khác nhé.',
}
export async function callAI<T>(path: string, body: unknown): Promise<T> {
  const { data } = await sb.auth.getSession()
  const t = data.session?.access_token
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(MSG[(j as { error?: string }).error || ''] || 'Có lỗi xảy ra, thử lại sau nhé.')
  return j as T
}
export async function pollJob(job: string, onTick?: (s: number) => void): Promise<string> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000)); onTick?.(i * 3)
    const r = await fetch('/api/chibi-ai?job=' + job); const j = await r.json().catch(() => ({}))
    if (j.image) return j.image
    if (j.error) throw new Error(MSG[j.error] || 'AI vẽ không thành công, thử lại nhé.')
  }
  throw new Error('AI vẽ lâu quá, thử lại sau nhé.')
}
// Thu nhỏ ảnh (data URL hoặc File) về cạnh dài tối đa, xuất JPEG
export function toJpeg(src: string, max: number, q = .85): Promise<string> {
  return new Promise((res, rej) => { const i = new Image(); i.onerror = () => rej(new Error('Không đọc được ảnh')); i.onload = () => {
    const sc = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * sc); c.height = Math.round(i.height * sc)
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(i, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)) }; i.src = src })
}
export const fileToDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })
