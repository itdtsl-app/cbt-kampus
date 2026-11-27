import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const key = r => `${r.participant_id}|${r.question_id}`
const norm = s => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
const STATUS = { BERLANGSUNG: 'sedang mengerjakan', TERKUNCI: 'terkunci', SELESAI: 'selesai', WAKTU_HABIS: 'waktu habis' }
const keyText = k => (Array.isArray(k) ? k.join('  /  ') : k == null ? '' : String(k))
const groupBy = (rows) => [...new Set(rows.map(r => r.question_id))].map(qid => rows.filter(r => r.question_id === qid))

// Penjelasan jika daftar esai kosong
function explainEmpty(d, tipe) {
  if (!d) return null
  const p = d.participants || {}
  const finished = (p.SELESAI || 0) + (p.WAKTU_HABIS || 0)
  if (tipe === 'ESAI' && d.essay_questions === 0)
    return { text: 'Ujian ini tidak memiliki soal bertipe Esai. Catatan: soal berkotak jawaban SATU BARIS adalah tipe Isian (dinilai otomatis, lihat tab Isian). Jika bank soal Anda berisi esai, kemungkinan tidak terpilih karena “Jumlah soal” memilih sebagian soal secara acak.' }
  if (!Object.keys(p).length) return { text: 'Belum ada peserta yang mengerjakan ujian ini.' }
  if (finished === 0)
    return { monitor: true, text: 'Belum ada peserta yang selesai. Jawaban baru dapat ditinjau setelah peserta mengumpulkan atau waktunya habis. Peserta yang terkunci atau masih mengerjakan perlu diakhiri lewat halaman Pantau.' }
  return null
}

export default function ExamEssay({ exam, onBack, onMonitor }) {
  const [tab, setTab] = useState('ESAI')
  const [esai, setEsai] = useState([])
  const [isian, setIsian] = useState([])
  const [diag, setDiag] = useState(null)
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [anon, setAnon] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.rpc('answer_review', { p_exam: exam.id, p_qtype: 'ESAI' }),
      supabase.rpc('answer_review', { p_exam: exam.id, p_qtype: 'ISIAN' }),
      supabase.rpc('essay_diagnostics', { p_exam: exam.id }),
    ]).then(([a, b, d]) => {
      const e = a.error || b.error
      if (e) setErr(/answer_review/.test(e.message) ? 'Fungsi penilaian belum terpasang. Jalankan skrip SQL cbt_kampus_tinjau_jawaban.sql di Supabase.' : e.message)
      else { setEsai(a.data); setIsian(b.data) }
      setDiag(d.data); setLoaded(true)
    })
  }, [])

  const p = diag?.participants || {}
  const nAns = rows => rows.filter(r => !r.is_blank).length
  return (
    <div>
      <div className="bar"><div><button className="ghost" onClick={onBack}>← Kembali</button><h2>Tinjau & Nilai Jawaban: {exam.title}</h2></div></div>
      {diag && (
        <p className="muted" style={{ marginTop: -4 }}><small>
          Ringkasan data — peserta: {Object.keys(p).length ? Object.entries(p).map(([k, n]) => `${n} ${STATUS[k] || k}`).join(', ') : 'belum ada'} · soal esai di ujian: <b>{diag.essay_questions}</b> dari {diag.total_questions} soal
        </small></p>)}
      {err && <p className="error">{err}</p>}

      <div className="tabs">
        <button className={tab === 'ESAI' ? 'tab on' : 'tab'} onClick={() => setTab('ESAI')}>Esai ({nAns(esai)})</button>
        <button className={tab === 'ISIAN' ? 'tab on' : 'tab'} onClick={() => setTab('ISIAN')}>Isian ({nAns(isian)})</button>
        <label className="check" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} />Sembunyikan identitas</label>
      </div>

      {tab === 'ESAI'
        ? <EssayTab exam={exam} rows={esai} setRows={setEsai} anon={anon} loaded={loaded} diag={diag} onMonitor={onMonitor} />
        : <IsianTab exam={exam} rows={isian} setRows={setIsian} anon={anon} loaded={loaded} diag={diag} onMonitor={onMonitor} />}
    </div>
  )
}

// ---------------- Esai: nilai satu per satu ----------------
function EssayTab({ rows, setRows, anon, loaded, diag, onMonitor }) {
  const [draft, setDraft] = useState({})
  const [onlyPending, setOnlyPending] = useState(false)
  const [saving, setSaving] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { setDraft(Object.fromEntries(rows.filter(r => r.score !== null).map(r => [key(r), r.score]))) }, [rows.length])

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
  const answered = rows.filter(r => !r.is_blank), blanks = rows.length - answered.length
  const done = answered.filter(r => !r.needs_manual).length
  const shown = rows.filter(r => !onlyPending || (r.needs_manual && !r.is_blank))
  const why = !answered.length && loaded ? explainEmpty(diag, 'ESAI') : null

  return (
    <div>
      <p className="muted">Dinilai <b>{done}</b> dari <b>{answered.length}</b> jawaban esai{blanks ? ` (${blanks} tidak dijawab)` : ''}. Nilai akhir peserta otomatis diperbarui setiap kali skor disimpan.</p>
      <label className="check" style={{ marginBottom: 12 }}><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />Hanya yang belum dinilai</label>
      {err && <p className="error">{err}</p>}
      {why && <Why why={why} onMonitor={onMonitor} />}
      {loaded && !rows.length && !why && <p className="muted">Belum ada jawaban esai dari peserta yang sudah selesai.</p>}
      {answered.length > 0 && !shown.length && <p className="okmsg">Semua jawaban esai sudah dinilai. 🎉</p>}
      {groupBy(shown).map(g => (
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

// ---------------- Isian: kelompokkan jawaban yang sama, terima/tolak sekaligus ----------------
function IsianTab({ exam, rows, setRows, anon, loaded, diag, onMonitor }) {
  const [onlyWrong, setOnlyWrong] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState({})
  const answered = rows.filter(r => !r.is_blank)
  const why = !answered.length && loaded ? explainEmpty(diag, 'ISIAN') : null

  const statusOf = list => {
    const ok = list.filter(r => r.score !== null && Number(r.score) >= Number(r.max_score)).length
    const zero = list.filter(r => Number(r.score ?? 0) === 0).length
    return ok === list.length ? 'benar' : zero === list.length ? 'salah' : 'campur'
  }
  const apply = async (qid, v, correct) => {
    setBusy(qid + v.norm); setErr('')
    const { error } = await supabase.rpc('staff_bulk_set_score', { p_exam: exam.id, p_question: qid, p_answer: v.text, p_correct: correct })
    setBusy('')
    if (error) return setErr(error.message)
    const ids = new Set(v.rows.map(key))
    setRows(rows.map(r => (ids.has(key(r)) ? { ...r, score: correct ? r.max_score : 0 } : r)))
  }

  return (
    <div>
      <p className="muted">Soal isian dinilai otomatis dengan mencocokkan kunci. Di sini Anda bisa melihat semua jawaban peserta dan <b>menerima</b> variasi yang sebenarnya benar (misalnya “4.000” atau “4000 gram”). Jawaban yang sama otomatis dikelompokkan.</p>
      <label className="check" style={{ marginBottom: 12 }}><input type="checkbox" checked={onlyWrong} onChange={e => setOnlyWrong(e.target.checked)} />Hanya jawaban yang dinilai salah</label>
      {err && <p className="error">{err}</p>}
      {why && <Why why={why} onMonitor={onMonitor} />}
      {loaded && !rows.length && !why && <p className="muted">Ujian ini tidak memiliki soal isian, atau belum ada peserta yang selesai.</p>}

      {groupBy(rows).map(g => {
        const ans = g.filter(r => !r.is_blank)
        const map = new Map()
        for (const r of ans) { const k = norm(r.answer_text); if (!map.has(k)) map.set(k, { norm: k, text: r.answer_text, rows: [] }); map.get(k).rows.push(r) }
        let variants = [...map.values()].sort((a, b) => b.rows.length - a.rows.length)
        if (onlyWrong) variants = variants.filter(v => statusOf(v.rows) !== 'benar')
        if (onlyWrong && !variants.length) return null
        return (
          <div className="card full" key={g[0].question_id}>
            <h3>{g[0].question_body}</h3>
            <p className="muted">Kunci: <b>{keyText(g[0].answer_key) || '—'}</b> · bobot {g[0].max_score} · {ans.length} menjawab{g.length - ans.length ? `, ${g.length - ans.length} kosong` : ''}</p>
            <div className="scroll"><table>
              <thead><tr><th>Jawaban peserta</th><th>Jumlah</th><th>Penilaian</th><th /></tr></thead>
              <tbody>{variants.map(v => {
                const st = statusOf(v.rows), id = g[0].question_id + v.norm
                return (
                  <tr key={id}>
                    <td><b>{v.text}</b>{open[id] && !anon && <div><small>{v.rows.map(r => `${r.nim} ${r.full_name}`).join('; ')}</small></div>}</td>
                    <td>{v.rows.length}{!anon && <button className="ghost" onClick={() => setOpen({ ...open, [id]: !open[id] })}>{open[id] ? 'sembunyikan' : 'nama'}</button>}</td>
                    <td><span className={`badge ${st === 'benar' ? 'AKTIF' : st === 'salah' ? 'TERKUNCI' : ''}`}>{st === 'benar' ? 'Benar' : st === 'salah' ? 'Salah' : 'Campur'}</span></td>
                    <td className="actions">
                      {st !== 'benar' && <button className="ghost" disabled={busy === id} onClick={() => apply(g[0].question_id, v, true)}>Terima (benar)</button>}
                      {st !== 'salah' && <button className="ghost danger" disabled={busy === id} onClick={() => apply(g[0].question_id, v, false)}>Tolak (salah)</button>}
                    </td>
                  </tr>)
              })}</tbody>
            </table></div>
          </div>)
      })}
    </div>
  )
}

function Why({ why, onMonitor }) {
  return (
    <div className="warn" style={{ margin: '8px 0 12px' }}>
      <p style={{ margin: 0 }}>{why.text}</p>
      {why.monitor && onMonitor && <div className="row" style={{ marginTop: 8 }}><button className="ghost" onClick={onMonitor}>Buka halaman Pantau</button></div>}
    </div>
  )
}
