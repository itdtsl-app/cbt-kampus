import { useEffect, useState } from 'react'
import { supabase, configMissing } from './supabase'
import { MENU } from './pages.jsx'
import StudentApp from './StudentHome.jsx'
import { LoginScreen, NewPassword } from './Login.jsx'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'
import ChangePassword from './ChangePassword.jsx'
import { BRAND } from './branding.js'

const ROLE_LABEL = { ADMIN: 'Administrator', DOSEN: 'Dosen', MAHASISWA: 'Mahasiswa', PROKTOR: 'Proktor' }
const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

function Shell({ profile }) {
  const items = MENU.filter(m => m.roles.includes(profile.role))
  const [page, setPage] = useState(items[0].id)
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState(false)
  const current = items.find(m => m.id === page)
  const go = id => { setPage(id); setOpen(false) }
  return (
    <div className="app">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><Logo size={42} /><div><b>{BRAND.short}</b><small>{BRAND.tagline}</small></div></div>
        <nav>
          {items.map(m => (
            <button key={m.id} className={`navbtn ${m.id === page ? 'active' : ''}`} onClick={() => go(m.id)}>
              <Icon name={m.icon} size={18} /><span>{m.label}</span></button>))}
        </nav>
        <div className="usercard">
          <span className="avatar">{initials(profile.full_name)}</span>
          <div><b>{profile.full_name}</b><small>{ROLE_LABEL[profile.role]}</small></div>
          <button className="iconbtn" title="Ubah password" onClick={() => setPw(true)}><Icon name="key" size={18} /></button>
          <button className="iconbtn" title="Keluar" onClick={() => supabase.auth.signOut()}><Icon name="logout" size={18} /></button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="iconbtn burger" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <h1>{current.label}</h1>
        </header>
        <div className="content">{current.el(profile, go)}</div>
      </div>
    </div>
  )
}

function Message({ profile, text }) {
  return (
    <div className="center"><div className="card"><h2>Halo, {profile.full_name}</h2><p>{text}</p>
      <button onClick={() => supabase.auth.signOut()}>Keluar</button></div></div>
  )
}

function ConfigError() {
  return (
    <div className="center"><div className="card" style={{ width: 'min(560px, 100%)' }}>
      <h2>Konfigurasi belum lengkap</h2>
      <p>Alamat dan kunci Supabase tidak terbaca saat aplikasi dibangun.</p>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
        <li>Di GitHub: <b>Settings → Secrets and variables → Actions → Repository secrets</b>.</li>
        <li>Pastikan ada <b>VITE_SUPABASE_URL</b> dan <b>VITE_SUPABASE_ANON_KEY</b> (nama persis, huruf besar).</li>
        <li>Lalu jalankan ulang deploy: tab <b>Actions → Run workflow</b>.</li>
      </ul>
    </div></div>
  )
}

export default function App() {
  if (configMissing) return <ConfigError />
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setProfile(null)
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => setProfile(data))
  }, [session])

  if (session === undefined) return <div className="center">Memuat…</div>
  if (!session) return <LoginScreen />
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />
  if (!profile) return <div className="center">Memuat profil…</div>
  if (!profile.is_active) return <Message profile={profile} text="Akun Anda dinonaktifkan. Hubungi admin." />
  if (profile.role === 'MAHASISWA') return <StudentApp profile={profile} />
  return <Shell profile={profile} />
}
