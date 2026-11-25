import { useState } from 'react'
import { supabase } from './supabase'
import { BRAND, TEXT, toEmail } from './branding.js'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'

function Title() {
  const [first, ...rest] = BRAND.name.split(' ')
  return <h1 className="login-title"><b>{first}</b> {rest.join(' ')}</h1>
}

export function LoginScreen() {
  const [mode, setMode] = useState('login') // login | forgot
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(localStorage.getItem('cbt-remember') !== '0')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true)
    if (mode === 'login') {
      localStorage.setItem('cbt-remember', remember ? '1' : '0')
      const { error } = await supabase.auth.signInWithPassword({ email: toEmail(id), password })
      if (error) setErr(/invalid login/i.test(error.message) ? TEXT.wrong : error.message)
    } else if (!id.includes('@')) {
      setErr(TEXT.forgotNim)
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(id.trim(), { redirectTo: window.location.origin + import.meta.env.BASE_URL })
      if (error) setErr(error.message); else setInfo(TEXT.forgotSent)
    }
    setBusy(false)
  }

  return (
    <div className="login-page" style={{ '--bg': `url(${BRAND.loginBg})` }}>
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><Logo size={120} /></div>
        <Title />
        <p className="login-sub">{mode === 'login' ? TEXT.subtitle : 'Reset your password'}</p>

        <div className="login-field">
          <input type="text" required autoFocus autoComplete="username" placeholder={TEXT.idPlaceholder} value={id} onChange={e => setId(e.target.value)} />
          <Icon name="mail" size={16} />
        </div>
        {mode === 'login' && (
          <div className="login-field">
            <input type="password" required autoComplete="current-password" placeholder={TEXT.password} value={password} onChange={e => setPassword(e.target.value)} />
            <Icon name="lock" size={16} />
          </div>
        )}

        {err && <p className="login-msg err">{err}</p>}
        {info && <p className="login-msg ok">{info}</p>}

        {mode === 'login' ? (
          <div className="login-row">
            <label className="login-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />{TEXT.remember}</label>
            <button type="submit" className="login-btn" disabled={busy}>{busy ? '…' : TEXT.login}</button>
          </div>
        ) : (
          <button type="submit" className="login-btn full" disabled={busy}>{busy ? '…' : TEXT.sendReset}</button>
        )}

        <button type="button" className="login-link" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setErr(''); setInfo('') }}>
          {mode === 'login' ? TEXT.forgot : TEXT.back}
        </button>
      </form>
    </div>
  )
}

// Ditampilkan setelah pengguna membuka tautan "reset password" dari email
export function NewPassword({ onDone }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const submit = async e => {
    e.preventDefault()
    if (p1.length < 8) return setErr('Password minimal 8 karakter.')
    if (p1 !== p2) return setErr('Konfirmasi password tidak sama.')
    const { error } = await supabase.auth.updateUser({ password: p1 })
    if (error) return setErr(error.message)
    onDone()
  }
  return (
    <div className="login-page" style={{ '--bg': `url(${BRAND.loginBg})` }}>
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><Logo size={96} /></div>
        <Title />
        <p className="login-sub">Buat password baru</p>
        <div className="login-field"><input type="password" required placeholder="Password baru" value={p1} onChange={e => setP1(e.target.value)} /><Icon name="lock" size={16} /></div>
        <div className="login-field"><input type="password" required placeholder="Ulangi password baru" value={p2} onChange={e => setP2(e.target.value)} /><Icon name="lock" size={16} /></div>
        {err && <p className="login-msg err">{err}</p>}
        <button type="submit" className="login-btn full">Simpan password</button>
      </form>
    </div>
  )
}
