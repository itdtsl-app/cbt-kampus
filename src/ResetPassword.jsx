import { useState } from 'react'
import { callFunction } from './functionsApi.js'
import { buildCards } from './cards.js'
import { loginLabel } from './cardsUtil.js'
import PrintCards from './PrintCards.jsx'

// user: { id, name }.  printable: tampilkan tombol "Cetak kartu" (untuk mahasiswa)
export default function ResetPasswordButton({ user, label = 'Reset password', printable = false }) {
  const [step, setStep] = useState(null) // null | confirm | working | done | error
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [cards, setCards] = useState(null)
  const [printing, setPrinting] = useState(false)

  const run = async () => {
    setStep('working'); setErr('')
    try { setRes(await callFunction('reset-password', { user_id: user.id })); setStep('done') }
    catch (e) { setErr(e.message); setStep('error') }
  }
  const close = () => { setStep(null); setRes(null); setErr(''); setCopied(false) }
  const login = res ? loginLabel(res.login, res.nim) : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Login: ${login}\nPassword: ${res.password}`); setCopied(true) } catch { /* abaikan */ }
  }
  const printCard = async () => {
    setPrinting(true)
    setCards(await buildCards([{ student_id: res.user_id || user.id, name: res.name, nim: res.nim, login, password: res.password }]))
    setPrinting(false)
  }

  return (
    <>
      <button className="ghost" onClick={() => setStep('confirm')}>{label}</button>
      {step && (
        <div className="modal" onClick={step === 'working' ? undefined : close}>
          <div className="card narrow" onClick={e => e.stopPropagation()}>
            {step === 'confirm' && (<>
              <h3>Reset password?</h3>
              <p>Buat password baru acak untuk <b>{user.name}</b>. Password lama tidak berlaku lagi.</p>
              <div className="row end"><button className="ghost" onClick={close}>Batal</button><button onClick={run}>Ya, reset</button></div>
            </>)}
            {step === 'working' && <p>Mengatur password…</p>}
            {step === 'done' && (<>
              <h3>Password baru dibuat</h3>
              <dl className="cred">
                <div><dt>Nama</dt><dd>{res.name}</dd></div>
                <div><dt>Login</dt><dd>{login}</dd></div>
                <div className="pw"><dt>Password</dt><dd>{res.password}</dd></div>
              </dl>
              <p className="warn">Password hanya tampil sekali. Salin atau cetak, lalu berikan kepada pengguna dengan aman.</p>
              <div className="row end">
                <button className="ghost" onClick={copy}>{copied ? 'Tersalin ✓' : 'Salin'}</button>
                {printable && <button className="ghost" onClick={printCard} disabled={printing}>{printing ? 'Menyiapkan…' : 'Cetak kartu'}</button>}
                <button onClick={close}>Selesai</button>
              </div>
            </>)}
            {step === 'error' && (<>
              <h3>Gagal mereset password</h3><p className="error">{err}</p>
              <div className="row end"><button onClick={close}>Tutup</button></div>
            </>)}
          </div>
        </div>
      )}
      {cards && <PrintCards cards={cards.list} note={cards.note} onClose={() => setCards(null)} />}
    </>
  )
}
