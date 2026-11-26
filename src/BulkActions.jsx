import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { callFunction } from './functionsApi.js'

const ACTIONS = {
  MAHASISWA: [['add', 'Tambah ke kelas'], ['move', 'Pindahkan ke kelas lain'], ['remove', 'Keluarkan dari kelas'],
              ['activate', 'Aktifkan akun'], ['deactivate', 'Nonaktifkan akun'], ['delete', 'Hapus akun permanen']],
  DOSEN: [['assign', 'Tugaskan ke kelas'], ['unassign', 'Cabut dari kelas'],
          ['activate', 'Aktifkan akun'], ['deactivate', 'Nonaktifkan akun'], ['delete', 'Hapus akun permanen']],
}
const NEED_CLASS = ['add', 'move', 'remove', 'assign', 'unassign']
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

// role: 'MAHASISWA' | 'DOSEN';  ids: array id terpilih
export default function BulkActions({ role, ids, onClose, onDone }) {
  const [classes, setClasses] = useState([])
  const [action, setAction] = useState(ACTIONS[role][0][0])
  const [to, setTo] = useState('')
  const [from, setFrom] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null) // { message, skipped: [] }

  useEffect(() => { supabase.rpc('list_classes').then(({ data }) => setClasses(data || [])) }, [])
  const label = c => `${c.course_name} — ${c.class_name} (${c.term_label})`
  const noun = role === 'DOSEN' ? 'dosen' : 'mahasiswa'
  const needClass = NEED_CLASS.includes(action)

  const valid = () => {
    if (needClass && !to) return false
    if (action === 'move' && (!from || from === to)) return false
    if (action === 'delete' && confirmText !== 'HAPUS') return false
    return true
  }

  const run = async () => {
    setBusy(true); setErr('')
    try {
      let message = '', skipped = []
      if (action === 'add' || action === 'move') {
        const { data, error } = await supabase.rpc('bulk_set_class', { p_students: ids, p_to: to, p_from: action === 'move' ? from : null })
        if (error) throw error
        message = action === 'add'
          ? `${data.added} mahasiswa ditambahkan ke kelas (yang sudah ada di kelas itu tidak dihitung).`
          : `${data.added} mahasiswa dimasukkan ke kelas tujuan dan ${data.removed} dikeluarkan dari kelas asal.`
      } else if (action === 'remove') {
        const { data, error } = await supabase.rpc('bulk_remove_students', { p_students: ids, p_class: to })
        if (error) throw error
        message = `${data} mahasiswa dikeluarkan dari kelas. Akun mereka tidak dihapus.`
      } else if (action === 'assign' || action === 'unassign') {
        const { data, error } = await supabase.rpc('bulk_lecturer_class', { p_lecturers: ids, p_class: to, p_remove: action === 'unassign' })
        if (error) throw error
        message = action === 'assign' ? `${data} dosen ditugaskan ke kelas.` : `${data} penugasan dosen dicabut dari kelas.`
      } else if (action === 'activate' || action === 'deactivate') {
        for (const part of chunk(ids, 100)) {
          const { error } = await supabase.from('profiles').update({ is_active: action === 'activate' }).in('id', part)
          if (error) throw error
        }
        message = `${ids.length} akun ${action === 'activate' ? 'diaktifkan' : 'dinonaktifkan'}.`
      } else if (action === 'delete') {
        let deleted = 0
        for (const part of chunk(ids, 25)) {
          const data = await callFunction('delete-users', { user_ids: part })
          for (const r of data.results) { if (r.status === 'DIHAPUS') deleted++; else skipped.push(r) }
        }
        message = `${deleted} akun dihapus dari ${ids.length} yang dipilih.`
      }
      setResult({ message, skipped })
    } catch (e) { setErr(e.message || String(e)) }
    setBusy(false)
  }

  const classSelect = (value, set, ph) => (
    <select value={value} onChange={e => set(e.target.value)}>
      <option value="">{ph}</option>{classes.map(c => <option key={c.class_id} value={c.class_id}>{label(c)}</option>)}
    </select>
  )

  return (
    <div className="modal" onClick={busy ? undefined : () => { result && onDone(); onClose() }}>
      <div className="card wide" onClick={e => e.stopPropagation()}>
        <h3>Aksi massal untuk {ids.length} {noun}</h3>
        {!result ? (<>
          <label>Pilih aksi
            <select value={action} onChange={e => { setAction(e.target.value); setErr('') }}>
              {ACTIONS[role].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {action === 'move' && <label>Dari kelas (asal){classSelect(from, setFrom, '— pilih kelas asal —')}</label>}
          {needClass && <label>{action === 'move' ? 'Ke kelas (tujuan)' : 'Kelas'}{classSelect(to, setTo, '— pilih kelas —')}</label>}
          {needClass && !classes.length && <small className="muted">Belum ada kelas. Buat dulu di menu Kelas & Mahasiswa.</small>}
          {action === 'move' && <small className="muted">Mahasiswa dimasukkan ke kelas tujuan, lalu dikeluarkan dari kelas asal. Kelas lain yang mereka ikuti tidak berubah.</small>}
          {action === 'deactivate' && <small className="muted">Akun yang dinonaktifkan tidak bisa masuk ke aplikasi, tetapi datanya tetap tersimpan.</small>}
          {action === 'delete' && (
            <div className="danger-box">
              <b>Penghapusan permanen dan tidak dapat dibatalkan.</b>
              <p>Akun {noun} yang dipilih dihapus beserta keanggotaan kelasnya. Akun yang sudah punya riwayat ujian{role === 'DOSEN' ? ' atau memiliki bank soal/ujian' : ''} <b>dilewati otomatis</b> agar nilai tidak hilang; untuk akun itu gunakan <i>Nonaktifkan</i>.</p>
              <label><span>Ketik <b>HAPUS</b> untuk melanjutkan</span><input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="HAPUS" /></label>
            </div>
          )}
          {err && <p className="error">{err}</p>}
          <div className="row end">
            <button className="ghost" onClick={onClose} disabled={busy}>Batal</button>
            <button className={action === 'delete' ? 'danger-solid' : ''} onClick={run} disabled={busy || !valid()}>
              {busy ? 'Memproses…' : action === 'delete' ? `Hapus ${ids.length} akun` : 'Jalankan'}</button>
          </div>
        </>) : (<>
          <p className="okmsg">{result.message}</p>
          {result.skipped.length > 0 && (
            <div className="warn">
              <b>{result.skipped.length} dilewati/gagal:</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {result.skipped.slice(0, 30).map(r => <li key={r.user_id}>{r.name || r.user_id}{r.nim ? ` (${r.nim})` : ''} — {r.status.replace(/^(DILEWATI|GAGAL): /, '')}</li>)}
                {result.skipped.length > 30 && <li>… dan {result.skipped.length - 30} lainnya</li>}
              </ul>
            </div>)}
          <div className="row end"><button onClick={() => { onDone(); onClose() }}>Selesai</button></div>
        </>)}
      </div>
    </div>
  )
}
