import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Session } from '@supabase/supabase-js'
import { sb } from './supabase'
import { Brand, ToastHost } from './ui'
import { LoginPage } from './Login'
import { InvitePage } from './Invite'
import { GroupJoinPage } from './GroupJoin'
import { Main } from './XomApp'
import './styles.css'
import './app.css'
import { registerSW } from './push'

registerSW()

function usePath() {
  const [p, setP] = useState(location.pathname)
  useEffect(() => { const f = () => setP(location.pathname); addEventListener('popstate', f); return () => removeEventListener('popstate', f) }, [])
  return p
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const path = usePath()
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const invite = path.match(/^\/moi\/([A-Za-z0-9]{4,16})\/?$/)
  if (session === undefined) return <div className="app"><header className="top"><Brand /></header><p className="sub">Đang mở…</p></div>
  if (invite) return <InvitePage code={invite[1].toUpperCase()} session={session} />
  const group = path.match(/^\/vao\/([A-Za-z0-9]{8,24})\/?$/)
  if (group) return <GroupJoinPage code={group[1].toUpperCase()} session={session} />
  if (!session) return <LoginPage />
  return <Main key={session.user.id} session={session} />
}

createRoot(document.getElementById('root')!).render(<StrictMode><ToastHost><App /></ToastHost></StrictMode>)
