import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { readStudentRows, downloadExcel } from './importers.js'

const CHUNK = 25

export default function StudentImport({ profile }) {
  const needClass = profile.role === 'DOSEN'
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [rows, setRows] = useState(null)
  const [results, setResults] = useState(null)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef()

  useEffect(() => {
    // admin: semua kelas; dosen: hanya kelas yang ia ampu
    supabase.rpc('list_classes').then(({ data }) => setClasses(data || []))
  }, [])

  const pick = async e => {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    setErr(''); setResults(null)
    try { setRows(await readStudentRows(f)) } catch (x) { setErr('File tidak dapat dibaca: ' + x.message) }
  }
  const bad = r => !r.nim || !r.nama
  const valid = rows ? rows.filter(r => !bad(r)) : []

  const run = async () => {
    setBusy(true); setErr(''); const all = []
    try {
      for (let i = 0; i < valid.length; i += CHUNK) {
        setProgress(`Memproses ${Math.min(i + CHUNK, valid.length)}/${valid.length}…`)
        const { data, error } = await supabase.functions.invoke('import-students', {
          body: { rows: valid.slice(i, i + CHUNK), class_id: classId || null },
        })
        if (error || data?.error) throw new Error(data?.error || error.message)
        all.push(...data.results)
      }
      setResults(all); setRows(null); setProgress('')
    } catch (x) { setErr(x.message); if (all.length) setResults(all) }
    setBusy(false)
  }

  const created = results ? results.filter(r => r.status === 'DIBUAT').length : 0
  return (
    <div>
      <div className="bar"><h2>Impor Mahasiswa</h2></div>
      <p className="muted">Template: <a href={`${import.meta.env.BASE_URL}templates/template_mahasiswa.xlsx`} download>template_mahasiswa.xlsx</a>. Akun dibuat otomatis dengan password acak.</p>
      <div className="card full">
        <label>{needClass ? 'Masukkan ke kelas (wajib)' : 'Masukkan ke kelas (opsional)'}
          <select value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">{needClass ? '— pilih kelas —' : '— tanpa kelas —'}</option>
            {classes.map(c => <option key={c.class_id} value={c.class_id}>{c.course_name} — {c.class_name} ({c.term_label})</option>)}
          </select>
        </label>
        <div className="row"><button onClick={() => ref.current.click()} disabled={busy}>Pilih file Excel (.xlsx)…</button></div>
        <input ref={ref} type="file" accept=".xlsx" hidden onChange={pick} />
        {needClass && !classes.length && <p className="muted">Belum ada kelas. Buat dulu di menu Kelas Saya (tombol “+ Buat Kelas”).</p>}
        {err && <p className="error">{err}</p>}
      </div>

      {rows && (
        <div className="card full">
          <h3>Pratinjau: {valid.length} baris valid dari {rows.length}</h3>
          <div className="scroll"><table>
            <thead><tr><th>No</th><th>NIM</th><th>Nama</th><th>Email</th><th>Status</th></tr></thead>
            <tbody>{rows.slice(0, 200).map(r => (
              <tr key={r.no}><td>{r.no}</td><td>{r.nim}</td><td>{r.nama}</td><td>{r.email || '(login pakai NIM)'}</td>
                <td>{bad(r) ? <span className="error">NIM/Nama kosong</span> : <span className="okmsg">OK</span>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="row end">
            <button className="ghost" onClick={() => setRows(null)} disabled={busy}>Batal</button>
            <button onClick={run} disabled={busy || !valid.length || (needClass && !classId)}>{busy ? progress : `Impor ${valid.length} mahasiswa`}</button>
          </div>
        </div>
      )}

      {results && (
        <div className="card full">
          <h3>Hasil: {created} akun dibuat dari {results.length} baris</h3>
          <p className="warn">Password hanya tampil sekali. Unduh daftar ini dan simpan dengan aman.</p>
          <div className="row">
            <button onClick={() => downloadExcel(results.map(r => ({ NIM: r.nim, Nama: r.nama, 'Login (Email/NIM)': r.login, 'Password Awal': r.password, Status: r.status })), 'akun_mahasiswa.xlsx', 'Akun')}>Unduh daftar akun (Excel)</button>
          </div>
          <div className="scroll"><table>
            <thead><tr><th>NIM</th><th>Nama</th><th>Login</th><th>Password</th><th>Status</th></tr></thead>
            <tbody>{results.map((r, i) => <tr key={i}><td>{r.nim}</td><td>{r.nama}</td><td>{r.login}</td><td>{r.password}</td><td>{r.status}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}
