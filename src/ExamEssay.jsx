import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const key = r => `${r.participant_id}|${r.question_id}`

export default function ExamEssay({ exam, onBack }) {
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState({})
  const [onlyPending, setOnlyPending] = useState(true)
  const [anon, setAnon] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState('')

  useEffect(() => {
    supabase.rpc('essay_queue', { p_exam: exam.id }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else { setRows(data); setDraft(Object.fromEntries(data.filter(r => r.score !== null).map(r => [key(r), r.score]))) }
    })
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

  const total = rows.length, done = rows.filter(r => !r.needs_manual).length
  const shown = rows.filter(r => !onlyPending || r.needs_manual)
  const groups = [...new Set(shown.map(r => r.question_id))].map(qid => shown.filter(r => r.question_id === qid))

  return (
    <div>
      <div className="bar"><div><button className="ghost" onClick={onBack}>← Kembali</button><h2>Nilai Esai: {exam.title}</h2></div></div>
      <p className="muted">Dinilai <b>{done}</b> dari <b>{total}</b> jawaban esai. Nilai akhir peserta otomatis diperbarui setiap kali Anda menyimpan skor.</p>
      <div className="row" style={{ gap: 16, marginBottom: 12 }}>
        <label className="check"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />Hanya yang belum dinilai</label>
        <label className="check"><input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} />Sembunyikan identitas (penilaian objektif)</label>
      </div>
      {err && <p className="error">{err}</p>}
      {!total && !err && <p className="muted">Belum ada jawaban esai dari peserta yang sudah selesai.</p>}
      {total > 0 && !shown.length && <p className="okmsg">Semua jawaban esai sudah dinilai. 🎉</p>}
      {groups.map(g => (
        <div className="card full" key={g[0].question_id}>
          <h3>Soal: {g[0].question_body}</h3>
          <p className="muted">Skor maksimum: {g[0].max_score}</p>
          {g.map((r, i) => (
            <div className="essay" key={key(r)}>
              <div className="essay-head"><b>{anon ? `Peserta ${i + 1}` : `${r.nim} — ${r.full_name}`}</b>{!r.needs_manual && <span className="okmsg">✓ dinilai</span>}</div>
              <p className="answer-text">{r.answer_text}</p>
              <div className="row">
                <input type="number" min="0" max={r.max_score} step="0.5" style={{ width: 110 }} placeholder={`0–${r.max_score}`}
                  value={draft[key(r)] ?? ''} onChange={e => setDraft({ ...draft, [key(r)]: e.target.value })} />
                <button onClick={() => save(r)} disabled={saving === key(r)}>{saving === key(r) ? 'Menyimpan…' : 'Simpan skor'}</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
