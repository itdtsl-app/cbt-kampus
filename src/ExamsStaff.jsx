import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { Monitor, Results } from './ExamMonitor.jsx'
import ExamEssay from './ExamEssay.jsx'
import ItemAnalysis from './ItemAnalysis.jsx'

const pad = n => String(n).padStart(2, '0')
const toLocalInput = iso => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fmt = iso => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const randToken = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
const DEFAULTS = {
  kind: 'KUIS', duration_minutes: 60, max_attempts: 1, passing_grade: 60, randomize_questions: true,
  randomize_options: true, require_fullscreen: true, block_copy_paste: true, max_violations: 3,
  show_score: false, show_discussion: false, status: 'DRAFT', class_ids: [],
}

export default function ExamsStaff({ profile }) {
  const canEdit = profile.role !== 'PROKTOR'
  const [exams, setExams] = useState([])
  const [courses, setCourses] = useState([])
  const [banks, setBanks] = useState([])
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState(null)
  const [view, setView] = useState(null) // {type:'monitor'|'results', exam}
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    const { data, error } = await supabase.from('exams').select('*, courses(name)').order('start_at', { ascending: false })
    if (error) setErr(error.message); else setExams(data)
  }
  useEffect(() => {
    load()
    supabase.from('courses').select('id, name, code').order('name').then(({ data }) => setCourses(data || []))
    supabase.from('question_banks').select('id, title, course_id').then(({ data }) => setBanks(data || []))
    ;(async () => {
      const { data: cls } = await supabase.from('classes').select('id, name, course_id, academic_terms(year_label, semester)')
      if (profile.role === 'DOSEN') { // dosen hanya boleh memakai kelas yang ditugaskan kepadanya
        const { data: mine } = await supabase.from('class_lecturers').select('class_id').eq('lecturer_id', profile.id)
        const ids = new Set((mine || []).map(m => m.class_id))
        setClasses((cls || []).filter(c => ids.has(c.id)))
      } else setClasses(cls || [])
    })()
  }, [])

  const edit = async e => {
    const { data } = await supabase.from('exam_classes').select('class_id').eq('exam_id', e.id)
    setForm({ ...e, start_at: toLocalInput(e.start_at), end_at: toLocalInput(e.end_at), class_ids: (data || []).map(x => x.class_id), question_count: e.question_count ?? '' })
  }
  const set = (k, v) => setForm({ ...form, [k]: v })

  const save = async ev => {
    ev.preventDefault(); setErr('')
    const start = new Date(form.start_at), end = new Date(form.end_at)
    if (!(end > start)) return setErr('Waktu selesai harus setelah waktu mulai.')
    if (!form.class_ids.length) return setErr('Pilih minimal satu kelas peserta.')
    if (!form.bank_id) return setErr('Pilih bank soal.')
    const payload = {
      course_id: form.course_id, title: form.title, kind: form.kind, start_at: start.toISOString(), end_at: end.toISOString(),
      duration_minutes: Number(form.duration_minutes), bank_id: form.bank_id,
      question_count: form.question_count === '' ? null : Number(form.question_count),
      randomize_questions: form.randomize_questions, randomize_options: form.randomize_options,
      max_attempts: Number(form.max_attempts), access_token: form.access_token || null,
      show_score: form.show_score, show_discussion: form.show_discussion, passing_grade: Number(form.passing_grade),
      require_fullscreen: form.require_fullscreen, block_copy_paste: form.block_copy_paste,
      max_violations: Number(form.max_violations), status: form.status,
    }
    let id = form.id
    if (id) { const { error } = await supabase.from('exams').update(payload).eq('id', id); if (error) return setErr(error.message) }
    else {
      const { data, error } = await supabase.from('exams').insert({ ...payload, creator_id: profile.id }).select('id').single()
      if (error) return setErr(error.message); id = data.id
    }
    await supabase.from('exam_classes').delete().eq('exam_id', id)
    const ec = await supabase.from('exam_classes').insert(form.class_ids.map(c => ({ exam_id: id, class_id: c })))
    if (ec.error) return setErr(ec.error.message)

    // Susun daftar soal (hanya jika belum ada peserta yang mengerjakan)
    const { count } = await supabase.from('exam_participants').select('id', { count: 'exact', head: true }).eq('exam_id', id)
    if (!count) {
      const { data: qs, error: qe } = await supabase.from('questions').select('id, qtype').eq('bank_id', form.bank_id)
      if (qe) return setErr(qe.message)
      if (!qs.length) return setErr('Bank soal yang dipilih belum berisi soal.')
      let picked = [...qs].sort(() => Math.random() - 0.5)
      if (payload.question_count && payload.question_count < picked.length) picked = picked.slice(0, payload.question_count)
      const ids = picked.map(q => q.id)
      const LBL = { PG: 'Pilihan Ganda', PGK: 'PG Kompleks', BENAR_SALAH: 'Benar/Salah', MENJODOHKAN: 'Menjodohkan', ISIAN: 'Isian', ESAI: 'Esai' }
      const comp = Object.entries(picked.reduce((m, q) => ({ ...m, [q.qtype]: (m[q.qtype] || 0) + 1 }), {})).map(([k, n]) => `${n} ${LBL[k] || k}`).join(', ')
      const bankEssay = qs.filter(q => q.qtype === 'ESAI').length
      const pickedEssay = picked.filter(q => q.qtype === 'ESAI').length
      setNotice(`Ujian disimpan dengan ${ids.length} soal: ${comp}.` + (bankEssay && !pickedEssay ? ' PERHATIAN: bank soal berisi esai tetapi tidak ada yang terpilih. Kosongkan “Jumlah soal” bila ingin menyertakan semua soal.' : ''))
      await supabase.from('exam_questions').delete().eq('exam_id', id)
      const eq = await supabase.from('exam_questions').insert(ids.map((qid, i) => ({ exam_id: id, question_id: qid, order_no: i + 1 })))
      if (eq.error) return setErr(eq.error.message)
    }
    setForm(null); load()
  }
  const remove = async e => {
    if (!confirm(`Hapus ujian "${e.title}" beserta seluruh jawaban dan nilai peserta?`)) return
    const { error } = await supabase.from('exams').delete().eq('id', e.id)
    if (error) setErr(error.message); else load()
  }

  if (view?.type === 'monitor') return <Monitor exam={view.exam} onBack={() => { setView(null); load() }} />
  if (view?.type === 'results') return <Results exam={view.exam} onBack={() => setView(null)} />
  if (view?.type === 'essay') return <ExamEssay exam={view.exam} onBack={() => setView(null)} onMonitor={() => setView({ type: 'monitor', exam: view.exam })} />
  if (view?.type === 'analysis') return <ItemAnalysis exam={view.exam} onBack={() => setView(null)} />

  const f = form
  return (
    <div>
      <div className="bar"><h2>Ujian</h2>{canEdit && <button onClick={() => setForm({ ...DEFAULTS, start_at: toLocalInput(new Date()), end_at: toLocalInput(new Date(Date.now() + 3600e3)) })}>+ Jadwalkan Ujian</button>}</div>
      {err && !f && <p className="error">{err}</p>}
      {notice && !f && <p className="warn" style={{ margin: '0 0 12px' }}>{notice}</p>}
      <div className="scroll"><table>
        <thead><tr><th>Judul</th><th>Mata Kuliah</th><th>Jadwal</th><th>Durasi</th><th>Status</th><th /></tr></thead>
        <tbody>
          {exams.map(e => (
            <tr key={e.id}>
              <td><b>{e.title}</b><br /><small>{e.kind}{e.access_token ? ` · token ${e.access_token}` : ''}</small></td>
              <td>{e.courses?.name}</td><td>{fmt(e.start_at)}<br />s/d {fmt(e.end_at)}</td><td>{e.duration_minutes} mnt</td>
              <td><span className={`badge ${e.status}`}>{e.status}</span></td>
              <td className="actions">
                <button className="ghost" onClick={() => setView({ type: 'monitor', exam: e })}>Pantau</button>
                <button className="ghost" onClick={() => setView({ type: 'results', exam: e })}>Hasil</button>
                {profile.role !== 'PROKTOR' && <button className="ghost" onClick={() => setView({ type: 'essay', exam: e })}>Esai</button>}
                {profile.role !== 'PROKTOR' && <button className="ghost" onClick={() => setView({ type: 'analysis', exam: e })}>Analisis</button>}
                {canEdit && <button className="ghost" onClick={() => edit(e)}>Ubah</button>}
                {canEdit && <button className="ghost danger" onClick={() => remove(e)}>Hapus</button>}
              </td>
            </tr>
          ))}
          {!exams.length && <tr><td colSpan={6}>Belum ada ujian.</td></tr>}
        </tbody>
      </table></div>

      {f && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="card wide" onClick={e => e.stopPropagation()} onSubmit={save}>
            <h3>{f.id ? 'Ubah' : 'Jadwalkan'} Ujian</h3>
            <label>Judul<input required value={f.title || ''} onChange={e => set('title', e.target.value)} /></label>
            <div className="grid2">
              <label>Mata kuliah
                <select required value={f.course_id || ''} onChange={e => setForm({ ...f, course_id: e.target.value, bank_id: '', class_ids: [] })}>
                  <option value="">— pilih —</option>{courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select></label>
              <label>Jenis
                <select value={f.kind} onChange={e => set('kind', e.target.value)}>{['KUIS', 'UTS', 'UAS', 'TRYOUT'].map(k => <option key={k}>{k}</option>)}</select></label>
            </div>
            <div className="grid2">
              <label>Bank soal
                <select required value={f.bank_id || ''} onChange={e => set('bank_id', e.target.value)}>
                  <option value="">— pilih —</option>{banks.filter(b => b.course_id === f.course_id).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select></label>
              <label>Jumlah soal (kosong = semua)<input type="number" min="1" value={f.question_count} onChange={e => set('question_count', e.target.value)} /></label>
            </div>
            <div className="stack"><b>Kelas peserta</b>
              {classes.filter(c => c.course_id === f.course_id).map(c => (
                <label key={c.id} className="check"><input type="checkbox" checked={f.class_ids.includes(c.id)}
                  onChange={e => set('class_ids', e.target.checked ? [...f.class_ids, c.id] : f.class_ids.filter(x => x !== c.id))} />
                  Kelas {c.name} ({c.academic_terms?.year_label} {c.academic_terms?.semester})</label>
              ))}
              {f.course_id && !classes.some(c => c.course_id === f.course_id) && <small className="muted">{profile.role === 'DOSEN' ? 'Belum ada kelas mata kuliah ini yang ditugaskan kepada Anda. Hubungi admin.' : 'Mata kuliah ini belum punya kelas.'}</small>}
            </div>
            <div className="grid2">
              <label>Mulai<input type="datetime-local" required value={f.start_at} onChange={e => set('start_at', e.target.value)} /></label>
              <label>Ditutup<input type="datetime-local" required value={f.end_at} onChange={e => set('end_at', e.target.value)} /></label>
            </div>
            <div className="grid3">
              <label>Durasi (menit)<input type="number" min="1" required value={f.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} /></label>
              <label>Maks. percobaan<input type="number" min="1" value={f.max_attempts} onChange={e => set('max_attempts', e.target.value)} /></label>
              <label>Nilai lulus (KKM)<input type="number" min="0" max="100" value={f.passing_grade} onChange={e => set('passing_grade', e.target.value)} /></label>
            </div>
            <label>Token ujian (opsional)
              <div className="row"><input value={f.access_token || ''} onChange={e => set('access_token', e.target.value.toUpperCase())} />
                <button type="button" className="ghost" onClick={() => set('access_token', randToken())}>Buat acak</button></div></label>
            <div className="stack"><b>Pengaturan</b>
              {[['randomize_questions', 'Acak urutan soal'], ['randomize_options', 'Acak urutan opsi'], ['show_score', 'Tampilkan nilai ke mahasiswa setelah selesai'],
                ['require_fullscreen', 'Wajib layar penuh'], ['block_copy_paste', 'Blokir salin/tempel & klik kanan']].map(([k, l]) => (
                <label key={k} className="check"><input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} />{l}</label>))}
              <label>Kunci otomatis setelah N pelanggaran (0 = tidak dikunci)<input type="number" min="0" value={f.max_violations} onChange={e => set('max_violations', e.target.value)} /></label>
            </div>
            <label>Status
              <select value={f.status} onChange={e => set('status', e.target.value)}>
                <option value="DRAFT">DRAFT (belum terlihat mahasiswa)</option><option value="AKTIF">AKTIF (terlihat sesuai jadwal)</option><option value="SELESAI">SELESAI</option>
              </select></label>
            {err && <p className="error">{err}</p>}
            <div className="row end"><button type="button" className="ghost" onClick={() => { setForm(null); setErr('') }}>Batal</button><button type="submit">Simpan</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
