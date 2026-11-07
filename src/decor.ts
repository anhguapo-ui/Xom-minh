// Cửa hàng đồ trang trí nhà trên Phố xóm. Giá phải khớp với decor_price() trong supabase/migrations/0008_xu_loc.sql
export type DecorItem = { k: string; e: string; t: string; price: number; roof?: number }
export const DECOR: DecorItem[] = [
  { k: 'hoa', e: '🌷', t: 'Chậu hoa trước cửa', price: 20 },
  { k: 'chuong', e: '🎐', t: 'Chuông gió', price: 25 },
  { k: 'ga', e: '🐓', t: 'Chú gà trống', price: 30 },
  { k: 'xe_dap', e: '🚲', t: 'Xe đạp dựng hiên', price: 35 },
  { k: 'meo', e: '🐈', t: 'Mèo nằm mái nhà', price: 40 },
  { k: 'den_nhay', e: '✨', t: 'Đèn nháy dưới mái', price: 45 },
  { k: 'cay_oi', e: '🌳', t: 'Cây ổi sai quả', price: 50 },
  { k: 'dieu', e: '🪁', t: 'Diều bay trên nóc', price: 60 },
  { k: 'bien_vang', e: '🏅', t: 'Biển tên mạ vàng', price: 80 },
  { k: 'mai_do', e: '🟥', t: 'Sơn mái đỏ', price: 30, roof: 4 },
  { k: 'mai_xanh', e: '🟦', t: 'Sơn mái xanh dương', price: 30, roof: 205 },
  { k: 'mai_tim', e: '🟪', t: 'Sơn mái tím', price: 30, roof: 278 },
  { k: 'mai_vang', e: '🟨', t: 'Sơn mái vàng', price: 30, roof: 44 },
]
export const decorOf = (k: string) => DECOR.find(d => d.k === k)

export const EARN = [
  ['☀️', 'Điểm danh mỗi ngày', 5], ['🙏', 'Thắp hương ở miếu', 5], ['🎉', 'Rủ một kèo mới (2 kèo/ngày)', 5],
  ['🙋', 'Nhận lời đi kèo', 3], ['🏡', 'Xung phong đăng cai', 20], ['🤝', 'Giúp nhà khác ở Góc tương trợ', 5],
  ['📸', 'Đăng ảnh vào album (3 ảnh/ngày)', 2], ['🌳', 'Cây Đa trĩu quả: mỗi nhà', 15],
] as const

// Cây Đa lớn dần theo số lượt tưới trong tháng
export function treeStage(water: number, goal: number) {
  const p = goal > 0 ? water / goal : 0
  if (p >= 1) return { n: 4, t: 'Trĩu quả', p }
  if (p >= 0.7) return { n: 3, t: 'Đang ra hoa', p }
  if (p >= 0.4) return { n: 2, t: 'Xanh tốt', p }
  if (p >= 0.15) return { n: 1, t: 'Cây con', p }
  return { n: 0, t: 'Mầm non', p }
}
export function banyanSVG(stage: number) {
  const s = [0.45, 0.62, 0.8, 0.92, 1][stage], cy = 112 - 70 * s
  const dot = (c: string) => [[-24, -4], [8, -16], [26, 4], [-8, 12], [18, 20], [-30, 16], [0, -28]].map(([x, y]) =>
    `<circle cx="${60 + x * s}" cy="${cy + y * s}" r="${4 * s + 1}" fill="${c}"/>`).join('')
  return `<svg viewBox="0 0 120 112" aria-hidden="true">
    <path d="M${60 - 7 * s} 112 L${60 - 5 * s} ${cy + 10} L${60 + 5 * s} ${cy + 10} L${60 + 7 * s} 112Z" fill="#7B4B2A"/>
    ${stage >= 2 ? `<path d="M${60 - 30 * s} ${cy + 14} v${(112 - cy) * .7} M${60 + 32 * s} ${cy + 16} v${(112 - cy) * .65}" stroke="#8B5A35" stroke-width="2"/>` : ''}
    <circle cx="60" cy="${cy}" r="${36 * s}" fill="#4F8A33"/>
    <circle cx="${60 - 26 * s}" cy="${cy + 10 * s}" r="${24 * s}" fill="#5E9B3C"/>
    <circle cx="${60 + 26 * s}" cy="${cy + 10 * s}" r="${24 * s}" fill="#6DAA47"/>
    <circle cx="${60}" cy="${cy - 14 * s}" r="${22 * s}" fill="#6DAA47"/>
    ${stage === 3 ? dot('#F7A8C4') : stage === 4 ? dot('#F2A33A') : ''}
    ${stage === 0 ? '' : '<rect x="40" y="98" width="40" height="8" rx="3" fill="#C23F3F" opacity=".85"/>'}
  </svg>`
}
