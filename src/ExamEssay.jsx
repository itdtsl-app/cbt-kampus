import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const key = r => `${r.participant_id}|${r.question_id}`
const STATUS = { BERLANGSUNG: 'sedang mengerjakan', TERKUNCI: 'terkunci', SELESAI: 'selesai', WAKTU_HABIS: 'waktu habis' }

// Penjelasan mengapa daftar kosong (berdasarkan data ujian)
function explain(d) {
  if (!d) return null
  const p = d.participants || {}
  const finished = (p.SELESAI || 0) + (p.WAKTU_HABIS || 0)
  if (d.essay_questions === 0)
    return { text: 'Ujian ini tidak memiliki soal esai. Jika bank soal Anda berisi esai, kemungkinan esai tidak terpilih karena pengaturan “Jumlah soal” memilih sebagian soal secara acak. Kosongkan “Jumlah soal” atau jadwalkan ulang (sebelum ada peserta yang mengerjakan), lalu periksa komposisi soal yang ditampilkan setelah menyimpan.' }
  if (!Object.keys(p).length) return { text: 'Belum ada peserta yang mengerjakan ujian ini.' }
  if (finished === 0)
    return { monitor: true, text: 'Belum ada peserta yang selesai. Esai baru dapat dinilai setelah peserta mengumpulkan jawaban atau waktunya habis. Peserta yang terkunci atau masih berstatus mengerjakan perlu diakhiri lewat halaman Pantau.' }
  if (d.essay_filled === 0)
    return { text: 'Peserta sudah selesai, tetapi tidak ada satu pun jawaban esai yang terisi di database. Jika peserta merasa sudah menulis jawaban, catat angka pada “Ringkasan data” di bawah dan laporkan ke pengembang.' }
  return null
}

export default function ExamEssay({ exam, onBack, onMonitor }) {
  const [rows, setRows] = useState([])
  const [diag, setDiag] = useState(null)
  const [draft, setDraft] = useState({})
  const [onlyPending, setOnlyPending] = useState(false)
  const [anon, setAnon] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.rpc('essay_queue', { p_exam: exam.id }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else { setRows(data); setDraft(Object.fromEntries(data.filter(r => r.score !== null).map(r => [key(r), r.score]))) }
      setLoaded(true)
    })
    supabase.rpc('essay_diagnostics', { p_exam: exam.id }).then(({ data }) => setDiag(data))
  }, [])

  const save = async r => {
    const v = Number(draft[key(r)])
    if (draft[key(r)] === undefined || draft[key(r)] === '' || !Number.isFinite(v) || v < 0 || v > r.max_score)
      return setErr(`Skor harus angka antara 0 dan ${r.max_score}.`)
    setSaving(key(r)); setErr('')
    const { error } = await supabase.rpc('staff_set_score', { p_participant: r.participant_id, p_question: r.question_id, p_score: v })
    setSaving('')
    if (error) return setErr(error.message)
    setRows(rows.map(x => (key(x) === key(r) ? { ...x, score: v, needs_manual: false } : x)))
  }

  const answered = rows.filter(r => !r.is_blank)
  const blanks = rows.length - answered.length
  const total = answered.length, done = answered.filter(r => !r.needs_manual).length
  const shown = rows.filter(r => !onlyPending || (r.needs_manual && !r.is_blank))
  const groups = [...new Set(shown.map(r => r.question_id))].map(qid => shown.filter(r => r.question_id === qid))
  const why = !total && loaded ? explain(diag) : null
  const p = diag?.participants || {}

  return (
    <div>
      <div className="bar"><div><button className="ghost" onClick={onBack}>← Kembali</button><h2>Nilai Esai: {exam.title}</h2></div></div>
      <p className="muted">Dinilai <b>{done}</b> dari <b>{total}</b> jawaban esai{blanks ? ` (${blanks} soal esai tidak dijawab)` : ''}. Nilai akhir peserta otomatis diperbarui setiap kali Anda menyimpan skor.</p>
      {diag && (
        <p className="muted" style={{ marginTop: -6 }}><small>
          Ringkasan data — soal esai di ujian: <b>{diag.essay_questions}</b> dari {diag.total_questions} soal · peserta: {Object.keys(p).length ? Object.entries(p).map(([k, n]) => `${n} ${STATUS[k] || k}`).join(', ') : 'belum ada'} · jawaban esai terisi: <b>{diag.essay_filled}</b>
          {diag.essay_filled_unfinished > 0 ? ` (${diag.essay_filled_unfinished} milik peserta yang belum selesai)` : ''}
        </small></p>)}

      <div className="row" style={{ gap: 16, marginBottom: 12 }}>
        <label className="check"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />Hanya yang belum dinilai</label>
        <label className="check"><input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} />Sembunyikan identitas (penilaian objektif)</label>
      </div>
      {err && <p className="error">{err}</p>}

      {why && (
        <div className="warn" style={{ margin: '8px 0 12px' }}>
          <p style={{ margin: 0 }}>{why.text}</p>
          {why.monitor && onMonitor && <div className="row" style={{ marginTop: 8 }}><button className="ghost" onClick={onMonitor}>Buka halaman Pantau</button></div>}
        </div>)}
      {!rows.length && loaded && !why && !err && <p className="muted">Belum ada jawaban esai dari peserta yang sudah selesai.</p>}
      {total > 0 && !shown.length && <p className="okmsg">Semua jawaban esai sudah dinilai. 🎉</p>}

      {groups.map(g => (
        <div className="card full" key={g[0].question_id}>
          <h3>Soal: {g[0].question_body}</h3>
          <p className="muted">Skor maksimum: {g[0].max_score}</p>
          {g.map((r, i) => (
            <div className="essay" key={key(r)}>
              <div className="essay-head"><b>{anon ? `Peserta ${i + 1}` : `${r.nim} — ${r.full_name}`}</b>
                {!r.is_blank && !r.needs_manual && <span className="okmsg">✓ dinilai</span>}</div>
              {r.is_blank ? <p className="muted" style={{ margin: 0 }}>(tidak dijawab)</p> : (<>
                <p className="answer-text">{r.answer_text}</p>
                <div className="row">
                  <input type="number" min="0" max={r.max_score} step="0.5" style={{ width: 110 }} placeholder={`0–${r.max_score}`}
                    value={draft[key(r)] ?? ''} onChange={e => setDraft({ ...draft, [key(r)]: e.target.value })} />
                  <button onClick={() => save(r)} disabled={saving === key(r)}>{saving === key(r) ? 'Menyimpan…' : 'Simpan skor'}</button>
                </div></>)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
