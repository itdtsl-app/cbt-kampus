import { useState } from 'react'
import { supabase, verifyPassword } from './supabase'

const LABEL = ['Sangat lemah', 'Lemah', 'Cukup', 'Baik', 'Kuat', 'Sangat kuat']
const COLOR = ['#dc2626', '#dc2626', '#f59e0b', '#84cc16', '#16a34a', '#15803d']
const strength = p => {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return p ? s : 0
}
const translate = m => {
  if (/different from the old/i.test(m)) return 'Password baru harus berbeda dari password lama.'
  if (/reauth/i.test(m)) return 'Sesi Anda sudah terlalu lama. Keluar lalu masuk kembali, kemudian ulangi.'
  if (/at least|weak|pwned|compromised|known/i.test(m)) return 'Password ditolak: terlalu lemah atau mudah ditebak. Gunakan kombinasi huruf, angka, dan simbol.'
  return m
}

// Ubah password milik akun yang sedang masuk (admin, dosen, proktor, mahasiswa).
export default function ChangePassword({ onClose }) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const sc = strength(newPw)

  const submit = async e => {
    e.preventDefault(); setErr('')
    if (newPw.length < 8) return setErr('Password baru minimal 8 karakter.')
    if (newPw !== again) return setErr('Konfirmasi password baru tidak sama.')
    if (newPw === oldPw) return setErr('Password baru harus berbeda dari password lama.')
    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email || !(await verifyPassword(user.email, oldPw))) throw new Error('Password lama salah.')
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw new Error(translate(error.message))
      await supabase.auth.signOut({ scope: 'others' }) // keluarkan perangkat lain
      setDone(true)
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  const type = show ? 'text' : 'password'
  return (
    <div className="modal" style={{ zIndex: 60 }} onClick={busy ? undefined : onClose}>
      <div className="card narrow" onClick={e => e.stopPropagation()}>
        {done ? (<>
          <h3>Password berhasil diubah</h3>
          <p className="okmsg">Gunakan password baru pada login berikutnya.</p>
          <p className="muted" style={{ margin: 0 }}>Perangkat lain yang sedang masuk dengan akun ini telah dikeluarkan.</p>
          <div className="row end"><button onClick={onClose}>Selesai</button></div>
        </>) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <h3>Ubah Password</h3>
            <label>Password lama<input type={type} required autoFocus autoComplete="current-password" value={oldPw} onChange={e => setOldPw(e.target.value)} /></label>
            <label>Password baru<input type={type} required autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} /></label>
            {newPw && (
              <div className="pwmeter"><div className="pwbar"><span style={{ width: `${(sc / 5) * 100}%`, background: COLOR[sc] }} /></div><small style={{ color: COLOR[sc] }}>{LABEL[sc]}</small></div>
            )}
            <label>Ulangi password baru<input type={type} required autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Tampilkan password</label>
            <small className="muted">Minimal 8 karakter. Disarankan memadukan huruf besar-kecil, angka, dan simbol.</small>
            {err && <p className="error">{err}</p>}
            <div className="row end"><button type="button" className="ghost" onClick={onClose} disabled={busy}>Batal</button>
              <button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan password'}</button></div>
          </form>
        )}
      </div>
    </div>
  )
}
