export const STATUS = [
  { k: 'cafe', e: '☕', t: 'Rảnh, thèm cafe', s: 'Thèm cafe' },
  { k: 'bia', e: '🍺', t: 'Thèm bia', s: 'Thèm bia' },
  { k: 'an', e: '🍜', t: 'Tìm bạn ăn trưa', s: 'Đói' },
  { k: 'con', e: '🧒', t: 'Đang trông con', s: 'Trông con' },
  { k: 'met', e: '😴', t: 'Mệt, ở nhà', s: 'Ở nhà' },
  { k: 'ban', e: '🏃', t: 'Bận tối mắt', s: 'Bận' },
] as const
export type StatusKey = typeof STATUS[number]['k']
export const st = (k: string) => STATUS.find(s => s.k === k) || STATUS[0]
export const FREE = ['cafe', 'bia', 'an']

export const TYPES = [
  { k: 'cafe', e: '☕', t: 'Cafe' }, { k: 'bia', e: '🍺', t: 'Bia' }, { k: 'an', e: '🍜', t: 'Ăn trưa' },
  { k: 'bong', e: '⚽', t: 'Đá bóng' }, { k: 'hat', e: '🎤', t: 'Karaoke' }, { k: 'con', e: '🎡', t: 'Đi chơi cùng con' },
] as const
export const ty = (k: string) => TYPES.find(t => t.k === k) || TYPES[0]
