// Trò chuyện với Thầy Lộc (OpenAI). Giới hạn 100 câu/người/ngày.
import { caller, takeQuota, openaiKey } from '../lib/auth'
import { listModels, chatModel, openaiJSON } from '../lib/openai'

const SYSTEM = `Bạn là "Thầy Lộc", ông thầy bói vui tính ngồi dưới ô trong Miếu Thần Tài của một nhóm bạn bè các gia đình ("Xóm Mình").
Cách nói: tiếng Việt, xưng "thầy", gọi người hỏi bằng tên hoặc "con", giọng hóm hỉnh, ấm áp, kiểu thầy bói dân gian, hay dùng thành ngữ, ca dao.
Trả lời ngắn gọn (2–5 câu), có thể dùng tuổi can chi, mệnh ngũ hành, ngày âm lịch được cung cấp để "bấm đốt ngón tay".
Quy tắc bắt buộc:
- Đây là xem cho vui. Không khẳng định chắc chắn chuyện tương lai.
- Không phán về bệnh nặng, tai nạn, chết chóc, ly hôn, vô sinh hay chuyện làm người ta sợ. Nếu được hỏi về sức khoẻ, khuyên đi khám bác sĩ.
- Không khuyên đầu tư, vay mượn, cờ bạc, mua bán lớn; nếu được hỏi, khuyên cân nhắc kỹ và hỏi người có chuyên môn.
- Không đòi tiền, không bày "giải hạn" tốn tiền, không nói xấu ai trong xóm.
- Luôn kết thúc bằng một lời khuyên tích cực, thực tế (rủ bạn đi cafe, dành thời gian cho gia đình…).`

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!openaiKey()) return Response.json({ error: 'chua_co_khoa' }, { status: 503 })
  let b: { xom_id?: string; messages?: { role: string; content: string }[]; ctx?: string }
  try { b = await req.json() } catch { return new Response('Bad request', { status: 400 }) }
  const c = await caller(req, String(b.xom_id || '')); if (c instanceof Response) return c
  const msgs = (b.messages || []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 600) }))
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return new Response('Bad request', { status: 400 })
  const left = await takeQuota(c, String(b.xom_id), 'thay'); if (left instanceof Response) return left
  const r = await openaiJSON('chat/completions', {
    model: chatModel(await listModels()), temperature: 0.9, max_tokens: 350,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'system', content: 'Thông tin người hỏi: ' + String(b.ctx || '').slice(0, 400) }, ...msgs],
  })
  if (!r.ok) return Response.json({ error: r.code }, { status: 502 })
  return Response.json({ reply: String(r.j.choices?.[0]?.message?.content || 'Thầy đang bận pha trà, con hỏi lại sau nhé!'), left })
}

export const config = { path: '/api/thay-ai' }
