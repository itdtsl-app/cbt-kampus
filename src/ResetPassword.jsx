import { useState } from 'react'
import { callFunction } from './functionsApi.js'

const INTERNAL = '@mhs.cbt.local'

// user: { id, name }
export default function ResetPasswordButton({ user, label = 'Reset password' }) {
  const [step, setStep] = useState(null) // null | confirm | working | done | error
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setStep('working'); setErr('')
    try { setRes(await callFunction('reset-password', { user_id: user.id })); setStep('done') }
    catch (e) { setErr(e.message); setStep('error') }
  }
  const close = () => { setStep(null); setRes(null); setErr(''); setCopied(false) }
  const login = res ? (res.login?.endsWith(INTERNAL) ? `${res.nim} (NIM)` : res.login) : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Login: ${login}\nPassword: ${res.password}`); setCopied(true) } catch { /* abaikan */ }
  }

  return (
    <>
      <button className="ghost" onClick={() => setStep('confirm')}>{label}</button>
      {step && (
        <div className="modal" onClick={step === 'working' ? undefined : close}>
          <div className="card" onClick={e => e.stopPropagation()}>
            {step === 'confirm' && (<>
              <h3>Reset password?</h3>
              <p>Buat password baru acak untuk <b>{user.name}</b>. Password lama tidak berlaku lagi.</p>
              <div className="row end"><button className="ghost" onClick={close}>Batal</button><button onClick={run}>Ya, reset</button></div>
            </>)}
            {step === 'working' && <p>Mengatur password…</p>}
            {step === 'done' && (<>
              <h3>Password baru dibuat</h3>
              <table><tbody>
                <tr><td>Nama</td><td><b>{res.name}</b></td></tr>
                <tr><td>Login</td><td><b>{login}</b></td></tr>
                <tr><td>Password</td><td><b style={{ fontFamily: 'monospace', fontSize: 16 }}>{res.password}</b></td></tr>
              </tbody></table>
              <p className="warn">Password hanya tampil sekali. Salin dan berikan kepada pengguna dengan aman.</p>
              <div className="row end"><button className="ghost" onClick={copy}>{copied ? 'Tersalin ✓' : 'Salin'}</button><button onClick={close}>Selesai</button></div>
            </>)}
            {step === 'error' && (<>
              <h3>Gagal mereset password</h3><p className="error">{err}</p>
              <div className="row end"><button onClick={close}>Tutup</button></div>
            </>)}
          </div>
        </div>
      )}
    </>
  )
}
