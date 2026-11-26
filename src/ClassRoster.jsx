import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { downloadExcel } from './importers.js'
import ResetPasswordButton from './ResetPassword.jsx'

// Admin: kelola dosen pengampu & mahasiswa. Dosen: lihat kelas yang ditugaskan (hanya baca).
export default function Classes({ profile }) {
  const admin = profile.role === 'ADMIN'
  const [classes, setClasses] = useState([])
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [form, setForm] = useState(null)
  const [courses, setCourses] = useState([])
  const [terms, setTerms] = useState([])

  const load = async () => {
    const { data, error } = await supabase.rpc('list_classes')
    if (error) setErr(error.message); else { setErr(''); setClasses(data) }
  }
  useEffect(() => {
    load()
    supabase.from('courses').select('id, code, name').order('name').then(({ data }) => setCourses(data || []))
    supabase.from('academic_terms').select('id, year_label, semester, is_active').order('year_label', { ascending: false }).then(({ data }) => setTerms(data || []))
  }, [])

  const openForm = () => setForm({ course_id: '', term_id: terms.find(t => t.is_active)?.id || '', name: '' })
  const create = async e => {
    e.preventDefault(); setErr('')
    const { error } = await supabase.rpc('create_class', { p_course: form.course_id, p_term: form.term_id, p_name: form.name })
    if (error) return setErr(error.message)
    setForm(null); load()
  }
  const remove = async c => {
    if (!confirm(`Hapus kelas ${c.course_name} — ${c.class_name}? Daftar mahasiswa di kelas ini ikut terhapus (akun mahasiswa tidak dihapus).`)) return
    const { error } = await supabase.rpc('delete_class', { p_class: c.class_id })
    if (error) setErr(error.message); else load()
  }

  if (sel) return <ClassDetail cls={sel} admin={admin} onBack={() => { setSel(null); load() }} />
  const shown = classes.filter(c => `${c.class_name} ${c.course_name} ${c.course_code} ${c.lecturers}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div className="bar"><h2>{admin ? 'Kelas & Mahasiswa' : 'Kelas Saya'}</h2>
        <div className="row"><input placeholder="Cari kelas / mata kuliah / dosen…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 260 }} />
          <button onClick={openForm}>+ Buat Kelas</button></div></div>
      {err && <p className="error">{err}</p>}
      <div className="scroll"><table>
        <thead><tr><th>Mata Kuliah</th><th>Kelas</th><th>Tahun Akademik</th><th>Dosen Pengampu</th><th>Mahasiswa</th><th /></tr></thead>
        <tbody>
          {shown.map(c => (
            <tr key={c.class_id}>
              <td><b>{c.course_name}</b><br /><small>{c.course_code}</small></td><td>{c.class_name}</td><td>{c.term_label}</td>
              <td>{c.lecturers || <span className="muted">— belum ada —</span>}</td><td>{c.student_count}</td>
              <td className="actions"><button className="ghost" onClick={() => setSel(c)}>Buka</button>
                <button className="ghost danger" onClick={() => remove(c)}>Hapus</button></td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={6}>{admin ? 'Belum ada kelas. Klik “+ Buat Kelas”.' : 'Belum ada kelas. Klik “+ Buat Kelas” untuk membuat kelas Anda sendiri, atau minta admin menugaskan kelas.'}</td></tr>}
        </tbody>
      </table></div>

      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="card" onClick={e => e.stopPropagation()} onSubmit={create}>
            <h3>Buat Kelas Baru</h3>
            <label>Mata kuliah
              <select required value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}>
                <option value="">— pilih —</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
            <label>Tahun akademik
              <select required value={form.term_id} onChange={e => setForm({ ...form, term_id: e.target.value })}>
                <option value="">— pilih —</option>{terms.map(t => <option key={t.id} value={t.id}>{t.year_label} {t.semester}{t.is_active ? ' (aktif)' : ''}</option>)}</select></label>
            <label>Nama kelas (mis. A, B, Reguler Pagi)<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            {!admin && <small className="muted">Anda otomatis menjadi dosen pengampu kelas ini.</small>}
            {err && <p className="error">{err}</p>}
            <div className="row end"><button type="button" className="ghost" onClick={() => { setForm(null); setErr('') }}>Batal</button><button type="submit">Buat Kelas</button></div>
          </form>
        </div>
      )}
    </div>
  )
}

function ClassDetail({ cls, admin, onBack }) {
  const [roster, setRoster] = useState([])
  const [lecturers, setLecturers] = useState([]) // pengampu kelas ini (admin)
  const [allDosen, setAllDosen] = useState([])
  const [pick, setPick] = useState('')
  const [nim, setNim] = useState('')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const loadRoster = async () => {
    const { data, error } = await supabase.rpc('class_roster', { p_class: cls.class_id })
    if (error) setErr(error.message); else setRoster(data)
  }
  const loadLecturers = async () => {
    const { data } = await supabase.from('class_lecturers').select('lecturer_id, profiles(full_name, nim_nip)').eq('class_id', cls.class_id)
    setLecturers(data || [])
  }
  useEffect(() => {
    loadRoster()
    if (admin) {
      loadLecturers()
      supabase.from('profiles').select('id, full_name, nim_nip').eq('role', 'DOSEN').eq('is_active', true).order('full_name').then(({ data }) => setAllDosen(data || []))
    }
  }, [])

  const addLecturer = async () => {
    if (!pick) return
    setErr(''); setOk('')
    const { error } = await supabase.from('class_lecturers').insert({ class_id: cls.class_id, lecturer_id: pick })
    if (error) return setErr(error.code === '23505' ? 'Dosen ini sudah menjadi pengampu kelas ini.' : error.message)
    setPick(''); loadLecturers()
  }
  const removeLecturer = async l => {
    if (!confirm(`Cabut penugasan ${l.profiles?.full_name} dari kelas ini?`)) return
    const { error } = await supabase.from('class_lecturers').delete().eq('class_id', cls.class_id).eq('lecturer_id', l.lecturer_id)
    if (error) setErr(error.message); else loadLecturers()
  }
  const addStudent = async e => {
    e.preventDefault(); setErr(''); setOk('')
    const { data, error } = await supabase.rpc('admin_add_student_to_class', { p_class: cls.class_id, p_nim: nim })
    if (error) return setErr(error.message)
    setOk(`${data} ditambahkan ke kelas.`); setNim(''); loadRoster()
  }
  const removeStudent = async s => {
    if (!confirm(`Keluarkan ${s.full_name} dari kelas ini? (Akun tidak dihapus.)`)) return
    const { error } = await supabase.rpc('remove_student_from_class', { p_class: cls.class_id, p_student: s.student_id })
    if (error) setErr(error.message); else loadRoster()
  }

  const shown = useMemo(() => roster.filter(s => `${s.nim} ${s.full_name} ${s.email}`.toLowerCase().includes(q.toLowerCase())), [roster, q])
  const available = allDosen.filter(d => !lecturers.some(l => l.lecturer_id === d.id))
  const exportXlsx = () => downloadExcel(roster.map((s, i) => ({ No: i + 1, NIM: s.nim, Nama: s.full_name, Email: s.email, Status: s.is_active ? 'Aktif' : 'Nonaktif' })),
    `mahasiswa_${cls.course_code}_${cls.class_name}.xlsx`.replace(/\s+/g, '_'), 'Mahasiswa')

  return (
    <div>
      <div className="bar"><div><button className="ghost" onClick={onBack}>← Kembali</button>
        <h2>{cls.course_name} — Kelas {cls.class_name}</h2></div>
        <button className="ghost" onClick={exportXlsx} disabled={!roster.length}>Unduh Excel</button></div>
      <p className="muted">{cls.term_label} · {roster.length} mahasiswa{!admin && cls.lecturers ? ` · Pengampu: ${cls.lecturers}` : ''}</p>
      {err && <p className="error">{err}</p>}{ok && <p className="okmsg">{ok}</p>}

      {admin && (
        <div className="card full">
          <h3>Dosen pengampu</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {lecturers.map(l => (
              <span className="pill chip" key={l.lecturer_id}>{l.profiles?.full_name}
                <button className="ghost danger" title="Cabut penugasan" onClick={() => removeLecturer(l)}>✕</button></span>))}
            {!lecturers.length && <span className="muted">Belum ada dosen yang ditugaskan.</span>}
          </div>
          <div className="row">
            <select value={pick} onChange={e => setPick(e.target.value)} style={{ flex: 1 }}>
              <option value="">— pilih dosen —</option>
              {available.map(d => <option key={d.id} value={d.id}>{d.full_name}{d.nim_nip ? ` (${d.nim_nip})` : ''}</option>)}
            </select>
            <button onClick={addLecturer} disabled={!pick}>Tugaskan</button>
          </div>
          {!allDosen.length && <small className="muted">Belum ada akun berperan DOSEN. Ubah peran akun di menu Pengguna & Peran.</small>}
        </div>
      )}

      {(
        <form className="card full" onSubmit={addStudent}>
          <h3>Tambah mahasiswa ke kelas</h3>
          <div className="row"><input required placeholder="NIM mahasiswa (akun harus sudah ada)" value={nim} onChange={e => setNim(e.target.value)} style={{ flex: 1 }} />
            <button type="submit">Tambahkan</button></div>
          <small className="muted">Untuk banyak mahasiswa sekaligus, gunakan menu Impor Mahasiswa dan pilih kelas ini.</small>
        </form>
      )}

      <div className="bar" style={{ marginTop: 16 }}><h3 style={{ margin: 0 }}>Daftar mahasiswa</h3>
        <input placeholder="Cari NIM / nama…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 240 }} /></div>
      <div className="scroll"><table>
        <thead><tr><th>#</th><th>NIM</th><th>Nama</th><th>Login (email)</th><th>Status</th><th /></tr></thead>
        <tbody>
          {shown.map((s, i) => (
            <tr key={s.student_id}><td>{i + 1}</td><td>{s.nim}</td><td>{s.full_name}</td><td>{s.email}</td>
              <td><span className={`badge ${s.is_active ? 'AKTIF' : 'TERKUNCI'}`}>{s.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td className="actions"><ResetPasswordButton user={{ id: s.student_id, name: s.full_name }} />
                <button className="ghost danger" onClick={() => removeStudent(s)}>Keluarkan</button></td></tr>
          ))}
          {!shown.length && <tr><td colSpan={6}>{roster.length ? 'Tidak ada yang cocok.' : 'Belum ada mahasiswa di kelas ini.'}</td></tr>}
        </tbody>
      </table></div>
    </div>
  )
}
