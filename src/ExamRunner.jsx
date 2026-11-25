import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const isEmpty = a => a == null || a === '' || (Array.isArray(a) && !a.length) || (typeof a === 'object' && !Array.isArray(a) && !Object.keys(a).length)
const mmss = s => { const t = Math.max(0, s); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}` }

export default function ExamRunner({ exam, token, onExit }) {
  const [session] = useState(() => {
    const k = `cbt-session-${exam.exam_id}`
    let s = sessionStorage.getItem(k)
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(k, s) }
    return s
  })
  const [phase, setPhase] = useState('loading') // loading | running | ended | locked | dupe | error
  const [msg, setMsg] = useState('')
  const [data, setData] = useState(null)
  const [answers, setAnswers] = useState({})
  const [cur, setCur] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [saveState, setSaveState] = useState('')
  const [warn, setWarn] = useState('')
  const [isFs, setIsFs] = useState(!!document.fullscreenElement)
  const [result, setResult] = useState(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const f = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  const pid = useRef(null), deadline = useRef(0), offset = useRef(0)
  const ansRef = useRef({}), dirty = useRef(new Set()), lastViol = useRef(0), submitting = useRef(false), settings = useRef({})

  const finish = useCallback(async auto => {
    if (submitting.current) return
    submitting.current = true
    try {
      await flush(true)
      const { data: r, error } = await supabase.rpc('submit_exam', { p_participant: pid.current, p_auto: !!auto })
      if (error) throw error
      setResult(r); setPhase('ended')
      document.fullscreenElement && document.exitFullscreen?.().catch(() => {})
    } catch (e) { submitting.current = false; setMsg(e.message); if (/dikunci/i.test(e.message)) setPhase('locked') }
  }, [])

  // ---- muat / lanjutkan ujian ----
  useEffect(() => {
    (async () => {
      const { data: d, error } = await supabase.rpc('start_exam', { p_exam: exam.exam_id, p_token: token || null, p_session: session })
      if (error) { setMsg(error.message); return setPhase('error') }
      if (d.expired) { pid.current = d.participant_id; submitting.current = false; return finish(true) }
      pid.current = d.participant.id
      offset.current = Date.parse(d.participant.server_now) - Date.now()
      deadline.current = Date.parse(d.participant.deadline_at)
      settings.current = d.settings
      ansRef.current = d.answers || {}
      setAnswers(d.answers || {}); setData(d); setWarn(d.participant.violation_count ? `Pelanggaran tercatat: ${d.participant.violation_count}` : '')
      setIsFs(!!document.fullscreenElement)
      setPhase('running')
    })()
  }, [])

  // ---- simpan jawaban otomatis ----
  async function flush(all) {
    const ids = [...dirty.current]; if (!ids.length) return
    dirty.current.clear(); setSaveState('Menyimpan…')
    let failed = false
    await Promise.all(ids.map(async qid => {
      const a = ansRef.current[qid] || {}
      const { error } = await supabase.rpc('save_answer', { p_participant: pid.current, p_question: qid, p_answer: isEmpty(a.answer) ? null : a.answer, p_doubt: !!a.doubt, p_session: session })
      if (error) { failed = true; dirty.current.add(qid); if (/Waktu habis|berakhir/i.test(error.message)) dirty.current.delete(qid) }
    }))
    setSaveState(failed ? 'Gagal menyimpan, mencoba lagi…' : 'Tersimpan ✓')
  }
  useEffect(() => { if (phase !== 'running') return; const t = setInterval(() => flush(), 1500); return () => clearInterval(t) }, [phase])

  const setAns = (qid, patch) => {
    const next = { ...(ansRef.current[qid] || {}), ...patch }
    ansRef.current = { ...ansRef.current, [qid]: next }
    setAnswers(ansRef.current); dirty.current.add(qid); setSaveState('Belum tersimpan')
  }

  // ---- timer (jam server) ----
  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => {
      const left = Math.round((deadline.current - (Date.now() + offset.current)) / 1000)
      setRemaining(left); if (left <= 0) finish(true)
    }, 500)
    return () => clearInterval(t)
  }, [phase])

  // ---- detak jantung (sesi tunggal, status, sinkron waktu) ----
  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(async () => {
      const { data: h, error } = await supabase.rpc('heartbeat', { p_participant: pid.current, p_session: session })
      if (error) return
      offset.current = Date.parse(h.server_now) - Date.now(); deadline.current = Date.parse(h.deadline_at)
      if (!h.session_ok) return setPhase('dupe')
      if (h.status === 'TERKUNCI') return setPhase('locked')
      if (h.status === 'SELESAI' || h.status === 'WAKTU_HABIS') { submitting.current = false; finish(true) }
    }, 15000)
    return () => clearInterval(t)
  }, [phase])

  // ---- anti-curang ----
  const report = useCallback(async (kind, detail) => {
    const now = Date.now(); if (now - lastViol.current < 2500) return
    lastViol.current = now
    const { data: r } = await supabase.rpc('log_violation', { p_participant: pid.current, p_kind: kind, p_detail: detail || null })
    const row = r?.[0]; if (!row) return
    const max = settings.current.max_violations
    setWarn(`⚠ Pelanggaran ${row.violation_count}${max ? ` dari ${max}` : ''}: ${kind === 'TAB_SWITCH' ? 'berpindah tab/jendela' : kind === 'EXIT_FULLSCREEN' ? 'keluar dari layar penuh' : kind === 'COPY_PASTE' ? 'salin/tempel' : kind}`)
    if (row.locked) { setPhase('locked'); document.fullscreenElement && document.exitFullscreen?.().catch(() => {}) }
  }, [])

  useEffect(() => {
    if (phase !== 'running') return
    const s = settings.current
    const onVis = () => { if (document.hidden) report('TAB_SWITCH') }
    const onBlur = () => setTimeout(() => { if (!document.hasFocus() && !document.hidden) report('WINDOW_BLUR') }, 400)
    const onFs = () => { const fs = !!document.fullscreenElement; setIsFs(fs); if (!fs && s.require_fullscreen) report('EXIT_FULLSCREEN') }
    const block = e => { if (s.block_copy_paste) { e.preventDefault(); if (e.type !== 'contextmenu') report('COPY_PASTE', e.type) } }
    const unload = e => { e.preventDefault(); e.returnValue = '' }
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFs)
    ;['copy', 'cut', 'paste', 'contextmenu'].forEach(ev => document.addEventListener(ev, block))
    window.addEventListener('beforeunload', unload)
    return () => {
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFs)
      ;['copy', 'cut', 'paste', 'contextmenu'].forEach(ev => document.removeEventListener(ev, block))
      window.removeEventListener('beforeunload', unload)
    }
  }, [phase])

  const goFs = () => document.documentElement.requestFullscreen?.().catch(() => {})
  const exit = () => { sessionStorage.removeItem(`cbt-session-${exam.exam_id}`); onExit() }

  // ================= tampilan =================
  if (phase === 'loading') return <div className="center">Menyiapkan ujian…</div>
  if (phase === 'error') return <Box title="Tidak dapat memulai ujian" text={msg} btn="Kembali" onClick={exit} />
  if (phase === 'dupe') return <Box title="Ujian terbuka di tempat lain" text="Ujian ini sedang dibuka di perangkat atau tab lain, sehingga sesi ini dihentikan." btn="Kembali" onClick={exit} />
  if (phase === 'locked') return <Box title="Ujian dikunci" text="Ujian Anda dikunci karena pelanggaran. Hubungi pengawas/dosen untuk membuka kunci." btn="Kembali" onClick={exit} />
  if (phase === 'ended') return <Box title="Ujian selesai" text={result?.show_score && result.grade != null ? `Nilai Anda: ${result.grade} (${result.passed ? 'Lulus' : 'Belum lulus'})` : 'Jawaban Anda sudah terkirim. Terima kasih.'} btn="Kembali ke daftar ujian" onClick={exit} />

  const qs = data.questions, q = qs[cur], a = answers[q.id] || {}
  const answered = qs.filter(x => !isEmpty(answers[x.id]?.answer)).length
  const needFs = settings.current.require_fullscreen && !isFs

  return (
    <div className="runner" style={{ userSelect: settings.current.block_copy_paste ? 'none' : 'auto' }}>
      <header className="rhead">
        <b>{data.settings.title}</b>
        <span className={remaining < 300 ? 'timer low' : 'timer'}>⏱ {mmss(remaining)}</span>
        <small>{saveState}</small>
      </header>
      {warn && <div className="warnbar">{warn}</div>}
      <div className="rbody">
        <main className="card full">
          <div className="muted">Soal {cur + 1} dari {qs.length} · bobot {q.weight}</div>
          <p className="qtext">{q.body}</p>
          {q.image_url && <img className="qimg" src={q.image_url} alt="" />}
          <Answer q={q} a={a} set={patch => setAns(q.id, patch)} />
          <label className="check"><input type="checkbox" checked={!!a.doubt} onChange={e => setAns(q.id, { doubt: e.target.checked })} /> Ragu-ragu</label>
          <div className="row end">
            <button className="ghost" disabled={cur === 0} onClick={() => setCur(cur - 1)}>← Sebelumnya</button>
            {cur < qs.length - 1 ? <button onClick={() => setCur(cur + 1)}>Berikutnya →</button> : <button onClick={() => setConfirming(true)}>Selesai & Kumpulkan</button>}
          </div>
        </main>
        <aside className="qnav card">
          <b>Navigasi soal</b>
          <div className="grid-nav">{qs.map((x, i) => {
            const v = answers[x.id]; const cls = ['nb', i === cur && 'cur', v?.doubt ? 'doubt' : !isEmpty(v?.answer) ? 'done' : ''].filter(Boolean).join(' ')
            return <button key={x.id} className={cls} onClick={() => setCur(i)}>{i + 1}</button>
          })}</div>
          <small>Terjawab {answered}/{qs.length}</small>
          <button onClick={() => setConfirming(true)}>Kumpulkan</button>
        </aside>
      </div>

      {confirming && (
        <div className="modal"><div className="card">
          <h3>Kumpulkan jawaban?</h3>
          <p>Terjawab {answered} dari {qs.length} soal.{qs.length - answered > 0 && <> <b className="error">{qs.length - answered} soal belum dijawab.</b></>}{qs.some(x => answers[x.id]?.doubt) && ' Ada soal bertanda ragu-ragu.'}</p>
          {msg && <p className="error">{msg}</p>}
          <div className="row end"><button className="ghost" onClick={() => setConfirming(false)}>Kembali</button><button onClick={() => finish(false)}>Ya, kumpulkan</button></div>
        </div></div>
      )}
      {needFs && (
        <div className="modal fsblock"><div className="card">
          <h3>Mode layar penuh diperlukan</h3>
          <p>Ujian ini wajib dikerjakan dalam layar penuh. Waktu tetap berjalan.</p>
          <button onClick={goFs}>Masuk layar penuh</button>
        </div></div>
      )}
    </div>
  )
}

function Box({ title, text, btn, onClick }) {
  return <div className="center"><div className="card"><h2>{title}</h2><p>{text}</p><button onClick={onClick}>{btn}</button></div></div>
}

function Answer({ q, a, set }) {
  const v = a.answer
  if (q.qtype === 'PG') return (
    <div className="stack">{q.options.map(o => (
      <label key={o.label} className={`opt ${v === o.label ? 'sel' : ''}`}><input type="radio" name={q.id} checked={v === o.label} onChange={() => set({ answer: o.label })} />
        <span className="pill">{o.label}</span> {o.body}{o.image_url && <img className="qimg" src={o.image_url} alt="" />}</label>))}</div>)
  if (q.qtype === 'PGK') {
    const cur = Array.isArray(v) ? v : []
    return <div className="stack"><small className="muted">Pilih semua jawaban yang benar.</small>{q.options.map(o => (
      <label key={o.label} className={`opt ${cur.includes(o.label) ? 'sel' : ''}`}><input type="checkbox" checked={cur.includes(o.label)}
        onChange={e => set({ answer: e.target.checked ? [...cur, o.label] : cur.filter(x => x !== o.label) })} /><span className="pill">{o.label}</span> {o.body}</label>))}</div>
  }
  if (q.qtype === 'BENAR_SALAH') return (
    <div className="stack">{['BENAR', 'SALAH'].map(x => (
      <label key={x} className={`opt ${v === x ? 'sel' : ''}`}><input type="radio" name={q.id} checked={v === x} onChange={() => set({ answer: x })} /> {x === 'BENAR' ? 'Benar' : 'Salah'}</label>))}</div>)
  if (q.qtype === 'MENJODOHKAN') {
    const cur = v && typeof v === 'object' ? v : {}
    return <div className="stack"><small className="muted">Pasangkan setiap item di kiri dengan pilihan di kanan.</small>{q.options.map(o => (
      <div className="row opt" key={o.label}><span style={{ flex: 1 }}>{o.body}</span>↔
        <select style={{ flex: 1 }} value={cur[o.label] || ''} onChange={e => set({ answer: { ...cur, [o.label]: e.target.value } })}>
          <option value="">— pilih —</option>{q.rights.map((r, i) => <option key={i} value={r}>{r}</option>)}</select></div>))}</div>
  }
  if (q.qtype === 'ISIAN') return <input className="wide-input" placeholder="Ketik jawaban Anda" value={v || ''} onChange={e => set({ answer: e.target.value })} />
  return <textarea rows={8} placeholder="Tulis jawaban Anda" value={v || ''} onChange={e => set({ answer: e.target.value })} />
}
