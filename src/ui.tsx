import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { chibiSVG, headSVG, type Look } from './chibi'
import type { Family, Member, XomData } from './supabase'
import { adultsOf, hueOf, lookOf } from './util'

export function Head({ look, hue = 160, sm, title }: { look: Look; hue?: number; sm?: boolean; title?: string }) {
  return <span className={'av' + (sm ? ' sm' : '')} style={{ ['--h' as string]: hue }} title={title}
    dangerouslySetInnerHTML={{ __html: headSVG(look) }} />
}
export const MemberHead = ({ m, sm }: { m: Member; sm?: boolean }) =>
  <Head look={lookOf(m)} hue={hueOf(m.family_id)} sm={sm} title={m.name} />

export function FamilyHeads({ d, f, sm }: { d: XomData; f: Family; sm?: boolean }) {
  return <span className="fav">{adultsOf(d, f).slice(0, 2).map(m => <MemberHead key={m.id} m={m} sm={sm} />)}</span>
}

export function Chibi({ look, className = '' }: { look: Look; className?: string }) {
  return <div className={'ch static idle ' + className} dangerouslySetInnerHTML={{ __html: chibiSVG(look) }} />
}

/* ---------- Nút Back của điện thoại ----------
   Mỗi khung bật lên / màn con đăng ký một mục lịch sử. Bấm Back thì đóng cái trên cùng
   thay vì thoát app; đóng bằng nút trên màn hình thì tự gỡ mục lịch sử tương ứng. */
type BackEntry = { id: number; fn: () => void; popped: boolean }
const backStack: BackEntry[] = []
let ignorePops = 0, backSeq = 0
addEventListener('popstate', () => {
  if (ignorePops > 0) { ignorePops--; return }
  const top = backStack.pop()
  if (top) { top.popped = true; top.fn() }
})
export function useBack(active: boolean, onBack: () => void) {
  const fn = useRef(onBack); fn.current = onBack
  useEffect(() => {
    if (!active) return
    const e: BackEntry = { id: ++backSeq, fn: () => fn.current(), popped: false }
    backStack.push(e); history.pushState({ xmBack: e.id }, '')
    return () => {
      const i = backStack.indexOf(e)
      if (i >= 0) backStack.splice(i, 1)
      if (!e.popped) { ignorePops++; history.back() }
    }
  }, [active])
}

export function BackBar({ onBack, label = 'Quay lại' }: { onBack: () => void; label?: string }) {
  return <button className="back" onClick={onBack}>‹ {label}</button>
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useBack(true, onClose)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return <div className="scrim" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
      <div className="sheet-bar"><button className="sheet-back" onClick={onClose}>‹ Quay lại</button><span className="sheet-title">{label}</span></div>
      {children}
    </div>
  </div>
}

const ToastCtx = createContext<(m: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ t: string; k: number } | null>(null)
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(null), 2800); return () => clearTimeout(id) }, [msg])
  return <ToastCtx.Provider value={t => setMsg({ t, k: Date.now() })}>
    {children}
    {msg && <div key={msg.k} className="toast" role="status">{msg.t}</div>}
  </ToastCtx.Provider>
}

export function Brand() {
  return <div className="brand"><i className="dot" /><span>Xóm Mình</span></div>
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
