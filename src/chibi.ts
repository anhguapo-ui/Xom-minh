// Chibi: nhân vật đầu to thân nhỏ, vẽ bằng SVG. Dùng chung cho avatar, danh sách, miếu.
export type Hair = 'short' | 'side' | 'buzz' | 'spiky' | 'long' | 'bun' | 'pony' | 'bob' | 'pigtails'
export type Acc = 'none' | 'bow' | 'cap'
export type Look = {
  mode: 'build' | 'photo'
  hair: Hair
  hairC: string
  skin: string
  glasses: boolean
  shirt: string
  acc: Acc
  photo: string
  zoom: number
  ox: number
  oy: number
}

export const SKIN = ['#FBDCC4', '#F1C19C', '#DDA27A', '#B9805A']
export const HAIRC = ['#2A1D17', '#4B3022', '#7B4B2A', '#B07A3F', '#22243A']
export const SHIRT = ['#E8962A', '#0E7C66', '#3B6FD1', '#D2475A', '#8E5CC9', '#F2C230', '#5E9B3C', '#3A8FA6']
export const HAIR_NAMES: Record<Hair, string> = {
  short: 'Ngắn', side: 'Mái lệch', buzz: 'Húi cua', spiky: 'Dựng', long: 'Dài',
  bun: 'Búi', pony: 'Đuôi ngựa', bob: 'Bob', pigtails: 'Hai bím',
}
export const ALL_HAIR = Object.keys(HAIR_NAMES) as Hair[]
const ADULT_HAIR: Hair[] = ['short', 'side', 'buzz', 'spiky', 'long', 'bun', 'pony', 'bob']
const KID_HAIR: Hair[] = ['short', 'pigtails', 'bob', 'spiky', 'bun']

export function hash(s: string): number {
  let h = 2166136261
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

export function defLook(seed: string, role: 'adult' | 'kid'): Look {
  const H = (k: string) => hash(seed + '|' + k + '|' + seed)
  const hs = role === 'kid' ? KID_HAIR : ADULT_HAIR
  const hair = hs[H('h') % hs.length]
  const fem = ['long', 'bun', 'pony', 'bob', 'pigtails'].includes(hair)
  return {
    mode: 'build', hair,
    hairC: HAIRC[H('c') % (H('x') % 7 < 5 ? 3 : 5)],
    skin: SKIN[H('s') % 3],
    glasses: role === 'adult' && H('g') % 4 === 0,
    shirt: SHIRT[H('t') % SHIRT.length],
    acc: fem && H('a') % 3 === 0 ? 'bow' : role === 'kid' && H('a') % 3 === 0 ? 'cap' : 'none',
    photo: '', zoom: 1.25, ox: 0, oy: 0,
  }
}

const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/
const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === 'number' && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d)

// Chỉ nhận các giá trị hợp lệ: dữ liệu lưu trên máy chủ có thể do người khác sửa
export function readLook(raw: unknown, seed: string, role: 'adult' | 'kid'): Look {
  const d = defLook(seed, role)
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const photo = typeof r.photo === 'string' && r.photo.length < 90000 && PHOTO_RE.test(r.photo) ? r.photo : ''
  return {
    mode: r.mode === 'photo' && photo ? 'photo' : 'build',
    hair: ALL_HAIR.includes(r.hair as Hair) ? (r.hair as Hair) : d.hair,
    hairC: HAIRC.includes(r.hairC as string) ? (r.hairC as string) : d.hairC,
    skin: SKIN.includes(r.skin as string) ? (r.skin as string) : d.skin,
    glasses: typeof r.glasses === 'boolean' ? r.glasses : d.glasses,
    shirt: SHIRT.includes(r.shirt as string) ? (r.shirt as string) : d.shirt,
    acc: (['none', 'bow', 'cap'] as Acc[]).includes(r.acc as Acc) ? (r.acc as Acc) : d.acc,
    photo,
    zoom: clamp(r.zoom, 1, 3, d.zoom), ox: clamp(r.ox, -22, 22, 0), oy: clamp(r.oy, -22, 22, 0),
  }
}

const HAIR_BACK: Partial<Record<Hair, string>> = {
  long: 'M7 30 Q6 4 30 4 Q54 4 53 30 L55 56 Q42 60 30 58 Q18 60 5 56Z',
  bob: 'M7 30 Q6 4 30 4 Q54 4 53 30 L53 44 Q46 48 42 42 L18 42 Q14 48 7 44Z',
  pony: 'M50 20 Q66 30 57 54 Q53 41 46 31Z',
}
const CAP7 = 'M8 28 Q9 7 30 7 Q51 7 52 28 Q44 16 30 17 Q16 16 8 28Z'
const BANG = 'M8 30 Q8 6 30 6 Q52 6 52 30 Q50 22 44 21 L16 21 Q10 22 8 30Z'
const HAIR_FRONT: Record<Hair, string> = {
  short: 'M8 30 Q7 6 30 6 Q53 6 52 30 Q50 20 42 18 Q30 22 18 18 Q10 20 8 30Z',
  side: 'M8 31 Q6 5 30 5 Q54 5 52 30 Q48 17 37 15 Q26 24 9 31Z',
  buzz: 'M9 26 Q10 7 30 7 Q50 7 51 26 Q42 14 30 14 Q18 14 9 26Z',
  spiky: 'M8 28 L10 14 L15 18 L18 6 L24 13 L30 3 L36 13 L42 6 L45 18 L50 14 L52 28 Q44 18 30 19 Q16 18 8 28Z',
  long: 'M8 30 Q9 6 30 6 Q51 6 52 30 Q46 16 34 16 Q30 22 26 16 Q14 16 8 30Z',
  bun: CAP7, pony: CAP7, bob: BANG, pigtails: BANG,
}

let UID = 0
export function headInner(L: Look): string {
  const uid = 'hc' + UID++
  if (L.mode === 'photo' && L.photo) {
    const sz = 44 * L.zoom
    return `<defs><clipPath id="${uid}"><circle cx="30" cy="30" r="22"/></clipPath></defs><circle cx="30" cy="30" r="22" fill="${L.skin}"/>
      <image href="${L.photo}" x="${30 - sz / 2 - L.ox}" y="${30 - sz / 2 - L.oy}" width="${sz}" height="${sz}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid})"/>
      <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="1.2"/>`
  }
  let s = ''
  if (HAIR_BACK[L.hair]) s += `<path d="${HAIR_BACK[L.hair]}" fill="${L.hairC}"/>`
  if (L.hair === 'bun') s += `<circle cx="30" cy="7" r="8" fill="${L.hairC}"/>`
  if (L.hair === 'pigtails') s += `<circle cx="8" cy="37" r="7" fill="${L.hairC}"/><circle cx="52" cy="37" r="7" fill="${L.hairC}"/>`
  s += `<circle cx="30" cy="30" r="22" fill="${L.skin}"/>
    <ellipse cx="22" cy="33" rx="2.6" ry="3.3" fill="#2B2220"/><ellipse cx="38" cy="33" rx="2.6" ry="3.3" fill="#2B2220"/>
    <circle cx="23" cy="31.8" r=".9" fill="#fff"/><circle cx="39" cy="31.8" r=".9" fill="#fff"/>
    <circle cx="16.5" cy="39.5" r="3.2" fill="#F08A8A" opacity=".45"/><circle cx="43.5" cy="39.5" r="3.2" fill="#F08A8A" opacity=".45"/>
    <path d="M27 40.5 Q30 43.5 33 40.5" fill="none" stroke="#8A3B2E" stroke-width="1.4" stroke-linecap="round"/>`
  s += `<path d="${HAIR_FRONT[L.hair]}" fill="${L.hairC}"/>`
  if (L.glasses) s += `<g fill="none" stroke="#2B2B2B" stroke-width="1.5"><circle cx="22" cy="33" r="5.6"/><circle cx="38" cy="33" r="5.6"/><path d="M27.6 33h4.8"/></g>`
  if (L.acc === 'bow') s += `<path d="M41 11 l8 -5 v10z M41 11 l-8 -5 v10z" fill="#E85A8A"/><circle cx="41" cy="11" r="2.4" fill="#C23F6D"/>`
  if (L.acc === 'cap') s += `<path d="M7 23 Q7 3 30 3 Q53 3 53 23Z" fill="${L.shirt}"/><path d="M7 23 Q7 3 30 3 Q53 3 53 23Z" fill="rgba(255,255,255,.12)"/><path d="M30 21 H57 Q60 24 55 26 H30Z" fill="${L.shirt}"/><path d="M30 21 H57 Q60 24 55 26 H30Z" fill="rgba(0,0,0,.22)"/>`
  return s
}

export const headSVG = (L: Look) => `<svg viewBox="5 3 50 50" aria-hidden="true">${headInner(L)}</svg>`

export function chibiSVG(L: Look): string {
  return `<svg viewBox="0 -4 60 92" aria-hidden="true">
  <ellipse cx="30" cy="85" rx="14" ry="3" fill="rgba(0,0,0,.2)"/>
  <g class="leg-l"><rect x="23" y="68" width="6" height="14" rx="2" fill="#3A3F55"/><ellipse cx="25.5" cy="82.5" rx="4.6" ry="2.4" fill="#2B2B2B"/></g>
  <g class="leg-r"><rect x="31" y="68" width="6" height="14" rx="2" fill="#3A3F55"/><ellipse cx="34.5" cy="82.5" rx="4.6" ry="2.4" fill="#2B2B2B"/></g>
  <g class="upper">
    <g class="arm-l"><rect x="13" y="50" width="6.5" height="16" rx="3.2" fill="${L.shirt}"/><circle cx="16.2" cy="66" r="3.2" fill="${L.skin}"/></g>
    <g class="arm-r"><rect x="40.5" y="50" width="6.5" height="16" rx="3.2" fill="${L.shirt}"/><circle cx="43.8" cy="66" r="3.2" fill="${L.skin}"/></g>
    <path d="M18 49 Q30 45 42 49 L44 71 Q30 74 16 71Z" fill="${L.shirt}"/>
    ${headInner(L)}
  </g></svg>`
}

// Thu nhỏ ảnh về 240px JPEG để lưu gọn
export function photoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('Không đọc được ảnh'))
    r.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Không đọc được ảnh'))
      img.onload = () => {
        const mx = 240, sc = Math.min(1, mx / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.8))
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  })
}
