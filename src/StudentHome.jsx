import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import ExamRunner from './ExamRunner.jsx'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'
import ChangePassword from './ChangePassword.jsx'
import { BRAND } from './branding.js'

const fmt = iso => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const greet = () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam' }
const dur = ms => {
  const m = Math.max(1, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d} hari ${h} jam` : h ? `${h} jam ${m % 60} menit` : `${m} menit`
}

export default function StudentApp({ profile }) {
  const [active, setActive] = useState(null) // { exam, token }
  if (active) return <ExamRunner exam={active.exam} token={active.token} onExit={() => setActive(null)} />
  return <StudentHome profile={profile} onStart={(exam, token) => setActive({ exam, token })} />
}

function StudentHome({ profile, onStart }) {
  const [exams, setExams] = useState([])
  const [tokens, setTokens] = useState({})
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(Date.now())
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [pw, setPw] = useState(false)

  const load = async () => {
    const { data, error } = await supabase.rpc('list_my_exams')
    if (error) return setErr(error.message)
    setErr(''); setExams(data); setLoaded(true)
    if (data[0]) setOffset(Date.parse(data[0].server_now) - Date.now())
  }
  useEffect(() => { load(); const a = setInterval(load, 30000); const b = setInterval(() => setTick(Date.now()), 1000); return () => { clearInterval(a); clearInterval(b) } }, [])

  const begin = e => {
    if (e.require_fullscreen) document.documentElement.requestFullscreen?.().catch(() => {}) // harus dari klik pengguna
    onStart(e, tokens[e.exam_id] || '')
  }
  const now = tick + offset

  // Kelompokkan status tiap ujian
  const stateOf = e => {
    if (e.in_progress) return 'resume'
    if (e.attempts_used >= e.max_attempts) return 'done'
    if (now < Date.parse(e.start_at)) return 'soon'
    if (now > Date.parse(e.end_at)) return 'closed'
    return 'start'
  }
  const order = { resume: 0, start: 1, soon: 2, done: 3, closed: 4 }
  const list = exams.map(e => ({ e, st: stateOf(e) })).sort((a, b) => order[a.st] - order[b.st])
  const n = k => list.filter(x => x.st === k).length

  return (
    <div className="stu">
      <header className="stu-top">
        <div className="brand"><Logo size={36} /><div><b>{BRAND.short}</b><small>{BRAND.tagline}</small></div></div>
        <div className="row"><button className="ghost light" onClick={() => setPw(true)}><Icon name="key" size={16} /> Ubah password</button>
          <button className="ghost light" onClick={() => supabase.auth.signOut()}><Icon name="logout" size={16} /> Keluar</button></div>
      </header>

      <section className="hero stu-hero">
        <div><small>{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>
          <h2>{greet()}, {profile.full_name.split(' ')[0]}! 👋</h2>
          <p>{profile.nim_nip ? `NIM ${profile.nim_nip} · ` : ''}Selamat mengerjakan, tetap jujur dan tenang.</p></div>
      </section>

      <div className="stu-body">
        <section className="stats">
          <div className="stat"><span className="stat-ic green"><Icon name="play" size={22} /></span><div><b>{n('start') + n('resume')}</b><small>Siap dikerjakan</small></div></div>
          <div className="stat"><span className="stat-ic amber"><Icon name="clock" size={22} /></span><div><b>{n('soon')}</b><small>Akan datang</small></div></div>
          <div className="stat"><span className="stat-ic blue"><Icon name="check" size={22} /></span><div><b>{n('done')}</b><small>Sudah dikerjakan</small></div></div>
        </section>

        {err && <p className="error">{err}</p>}
        {loaded && !list.length && !err && (
          <div className="card panel empty"><Icon name="calendar" size={36} /><h3>Belum ada ujian</h3><p className="muted">Ujian untuk kelas Anda akan muncul di sini sesuai jadwal.</p></div>)}

        <div className="exam-cards">
          {list.map(({ e, st }) => (
            <article className={`exam-card ${st}`} key={e.exam_id}>
              <div className="exam-card-head">
                <span className="pill">{e.kind}</span>
                <span className={`state ${st}`}>{{ resume: 'Sedang berlangsung', start: 'Dibuka', soon: 'Belum dimulai', done: 'Selesai', closed: 'Ditutup' }[st]}</span>
              </div>
              <h3>{e.title}</h3>
              <p className="muted">{e.course_name}</p>
              <ul className="meta">
                <li><Icon name="calendar" size={16} />{fmt(e.start_at)} — {fmt(e.end_at)}</li>
                <li><Icon name="clock" size={16} />{e.duration_minutes} menit · {e.question_total} soal</li>
              </ul>
              {st === 'soon' && <p className="countdown">Dimulai dalam {dur(Date.parse(e.start_at) - now)}</p>}
              {e.show_score && e.last_grade !== null && (
                <p className={e.last_passed ? 'okmsg' : 'error'}>Nilai: <b>{e.last_grade}</b> · {e.last_passed ? 'Lulus' : 'Belum lulus'}</p>)}
              {st === 'start' && e.has_token && (
                <label>Token ujian<input value={tokens[e.exam_id] || ''} placeholder="Masukkan token dari pengawas" onChange={x => setTokens({ ...tokens, [e.exam_id]: x.target.value.toUpperCase() })} /></label>)}
              {(st === 'start' || st === 'resume')
                ? <button onClick={() => begin(e)} disabled={st === 'start' && e.has_token && !tokens[e.exam_id]}>{st === 'resume' ? 'Lanjutkan ujian' : 'Mulai ujian'}</button>
                : <button disabled>{{ soon: 'Belum dimulai', done: 'Sudah dikerjakan', closed: 'Ditutup' }[st]}</button>}
            </article>
          ))}
        </div>
      </div>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  )
}
