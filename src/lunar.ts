// Lịch âm Việt Nam (thuật toán Hồ Ngọc Đức, múi giờ +7)
const INT = Math.floor
export function jdFromDate(dd: number, mm: number, yy: number) {
  const a = INT((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083
  return jd
}
function newMoon(k: number, tz: number) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = Math.PI / 180
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr)
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M)
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr)
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr)
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr))
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M))
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr))
  C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M))
  const dt = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2
  return INT(Jd1 + C1 - dt + 0.5 + tz / 24)
}
function sunLong(jdn: number, tz: number) {
  const T = (jdn - 2451545.5 - tz / 24) / 36525, T2 = T * T, dr = Math.PI / 180
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M)
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M)
  let L = (L0 + DL) * dr
  L -= Math.PI * 2 * INT(L / (Math.PI * 2))
  return INT(L / Math.PI * 6)
}
function month11(yy: number, tz: number) {
  const off = jdFromDate(31, 12, yy) - 2415021, k = INT(off / 29.530588853)
  let nm = newMoon(k, tz)
  if (sunLong(nm, tz) >= 9) nm = newMoon(k - 1, tz)
  return nm
}
function leapOff(a11: number, tz: number) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5)
  let last, i = 1, arc = sunLong(newMoon(k + i, tz), tz)
  do { last = arc; i++; arc = sunLong(newMoon(k + i, tz), tz) } while (arc !== last && i < 14)
  return i - 1
}
export type Lunar = { d: number; m: number; y: number; leap: boolean }
export function toLunar(date: Date): Lunar {
  const dd = date.getDate(), mm = date.getMonth() + 1, yy = date.getFullYear(), tz = 7
  const dn = jdFromDate(dd, mm, yy), k = INT((dn - 2415021.076998695) / 29.530588853)
  let ms = newMoon(k + 1, tz)
  if (ms > dn) ms = newMoon(k, tz)
  let a11 = month11(yy, tz), b11 = a11, ly
  if (a11 >= ms) { ly = yy; a11 = month11(yy - 1, tz) } else { ly = yy + 1; b11 = month11(yy + 1, tz) }
  const ld = dn - ms + 1, diff = INT((ms - a11) / 29)
  let leap = false, lm = diff + 11
  if (b11 - a11 > 365) { const lo = leapOff(a11, tz); if (diff >= lo) { lm = diff + 10; if (diff === lo) leap = true } }
  if (lm > 12) lm -= 12
  if (lm >= 11 && diff < 4) ly -= 1
  return { d: ld, m: lm, y: ly, leap }
}
export function findLunar(from: Date, test: (l: Lunar) => boolean, limit = 420) {
  const d = new Date(from); d.setHours(12, 0, 0, 0)
  for (let i = 0; i < limit; i++) {
    const l = toLunar(d)
    if (test(l)) return { date: new Date(d), l, days: i }
    d.setDate(d.getDate() + 1)
  }
  return null
}
export const lunarName = (l: Lunar) =>
  (l.d === 1 ? 'Mùng 1' : l.d === 15 ? 'Rằm' : l.d <= 10 ? 'Mùng ' + l.d : 'Ngày ' + l.d) + ' tháng ' + l.m + (l.leap ? ' nhuận' : '')
