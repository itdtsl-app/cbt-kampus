import { useState } from 'react'
import { callFunction } from './functionsApi.js'

// Dialog tambah dosen: admin mengisi data, sistem membuat akun + password acak (tampil sekali).
export default function AddUser({ onClose, onDone }) {
  const [form, setForm] = useState({ full_name: '', email: '', nim_nip: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState(null)
  const [copied, setCopied] = useState(false)
  const set = (k, v) => setForm({ ...form, [k]: v })

  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr('')
    try { setRes(await callFunction('create-user', { ...form, role: 'DOSEN' })) }
    catch (x) { setErr(x.message) }
    setBusy(false)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Login: ${res.login}\nPassword: ${res.password}`); setCopied(true) } catch { /* abaikan */ }
  }
  const finish = () => { if (res) onDone(); onClose() }

  return (
    <div className="modal" onClick={busy ? undefined : finish}>
      <div className="card narrow" onClick={e => e.stopPropagation()}>
        {!res ? (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <h3>Tambah Dosen</h3>
            <label>Nama lengkap<input required autoFocus value={form.full_name} onChange={e => set('full_name', e.target.value)} /></label>
            <label>Email (untuk login dan reset password)<input required type="email" value={form.email} onChange={e => set('email', e.target.value)} /></label>
            <label>NIP / NIDN (opsional)<input value={form.nim_nip} onChange={e => set('nim_nip', e.target.value)} /></label>
            <small className="muted">Password awal dibuat acak dan ditampilkan sekali setelah akun dibuat.</small>
            {err && <p className="error">{err}</p>}
            <div className="row end"><button type="button" className="ghost" onClick={onClose} disabled={busy}>Batal</button>
              <button type="submit" disabled={busy}>{busy ? 'Membuat…' : 'Buat akun'}</button></div>
          </form>
        ) : (<>
          <h3>Akun dosen dibuat</h3>
          <dl className="cred">
            <div><dt>Nama</dt><dd>{res.name}</dd></div>
            <div><dt>Login</dt><dd>{res.login}</dd></div>
            <div className="pw"><dt>Password</dt><dd>{res.password}</dd></div>
          </dl>
          <p className="warn">Password hanya tampil sekali. Salin lalu berikan kepada dosen dengan aman. Penugasan kelas dilakukan di menu Kelas & Mahasiswa.</p>
          <div className="row end"><button className="ghost" onClick={copy}>{copied ? 'Tersalin ✓' : 'Salin'}</button><button onClick={finish}>Selesai</button></div>
        </>)}
      </div>
    </div>
  )
}
