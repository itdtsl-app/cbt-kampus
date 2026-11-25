import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Icon from './Icon.jsx'

const greet = () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam' }
const count = (table, f) => { let q = supabase.from(table).select('*', { count: 'exact', head: true }); if (f) q = f(q); return q.then(r => r.count ?? 0) }
const fmt = iso => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const ROLE = { ADMIN: 'Administrator', DOSEN: 'Dosen', PROKTOR: 'Proktor' }

export default function Dashboard({ profile, go }) {
  const [s, setS] = useState(null)
  const [exams, setExams] = useState([])
  const role = profile.role

  useEffect(() => {
    (async () => {
      let examQ = supabase.from('exams').select('id, title, start_at, end_at, duration_minutes, courses(name)')
        .eq('status', 'AKTIF').gte('end_at', new Date().toISOString()).order('start_at').limit(6)
      if (role === 'DOSEN') examQ = examQ.eq('creator_id', profile.id)
      examQ.then(({ data }) => setExams(data || []))

      if (role === 'ADMIN') {
        const [mhs, dsn, cls, crs, act, prog] = await Promise.all([
          count('profiles', q => q.eq('role', 'MAHASISWA')), count('profiles', q => q.eq('role', 'DOSEN')),
          count('classes'), count('courses'), count('exams', q => q.eq('status', 'AKTIF')),
          count('exam_participants', q => q.eq('status', 'BERLANGSUNG'))])
        setS({ mhs, dsn, cls, crs, act, prog })
      } else if (role === 'DOSEN') {
        const [{ data: cl }, banks, act] = await Promise.all([
          supabase.rpc('list_classes'), count('question_banks', q => q.eq('owner_id', profile.id)),
          count('exams', q => q.eq('creator_id', profile.id).eq('status', 'AKTIF'))])
        setS({ cls: cl?.length ?? 0, mhs: (cl || []).reduce((t, c) => t + c.student_count, 0), banks, act })
      } else {
        const [act, prog, viol] = await Promise.all([
          count('exams', q => q.eq('status', 'AKTIF')), count('exam_participants', q => q.eq('status', 'BERLANGSUNG')),
          count('violations', q => q.gte('occurred_at', new Date(Date.now() - 864e5).toISOString()))])
        setS({ act, prog, viol })
      }
    })()
  }, [])

  const v = k => (s ? s[k] : '…')
  const stats = role === 'ADMIN' ? [
    { icon: 'users', label: 'Mahasiswa', value: v('mhs'), tone: 'blue' }, { icon: 'usercheck', label: 'Dosen', value: v('dsn'), tone: 'green' },
    { icon: 'building', label: 'Kelas', value: v('cls'), tone: 'amber' }, { icon: 'file', label: 'Ujian aktif', value: v('act'), tone: 'violet' },
    { icon: 'activity', label: 'Sedang mengerjakan', value: v('prog'), tone: 'rose' }]
  : role === 'DOSEN' ? [
    { icon: 'building', label: 'Kelas saya', value: v('cls'), tone: 'amber' }, { icon: 'users', label: 'Mahasiswa', value: v('mhs'), tone: 'blue' },
    { icon: 'book', label: 'Bank soal', value: v('banks'), tone: 'green' }, { icon: 'file', label: 'Ujian aktif', value: v('act'), tone: 'violet' }]
  : [
    { icon: 'file', label: 'Ujian aktif', value: v('act'), tone: 'violet' }, { icon: 'activity', label: 'Sedang mengerjakan', value: v('prog'), tone: 'rose' },
    { icon: 'alert', label: 'Pelanggaran 24 jam', value: v('viol'), tone: 'amber' }]

  const actions = role === 'ADMIN' ? [['file', 'Jadwalkan ujian', 'exams'], ['upload', 'Impor mahasiswa', 'import'], ['users', 'Kelas & mahasiswa', 'roster'], ['book', 'Bank soal', 'banks']]
    : role === 'DOSEN' ? [['building', 'Kelas saya', 'myclasses'], ['book', 'Bank soal', 'banks'], ['file', 'Jadwalkan ujian', 'exams'], ['upload', 'Impor mahasiswa', 'import']]
    : [['activity', 'Pantau ujian', 'exams']]

  const setup = role === 'ADMIN' && s && (s.crs === 0 || s.cls === 0)
  const now = Date.now()

  return (
    <div className="dash">
      <section className="hero">
        <div><small>{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>
          <h2>{greet()}, {profile.full_name.split(' ')[0]}! 👋</h2>
          <p>Anda masuk sebagai <b>{ROLE[role]}</b>. Berikut ringkasan aktivitas ujian hari ini.</p></div>
      </section>

      <section className="stats">
        {stats.map(x => (
          <div className="stat" key={x.label}><span className={`stat-ic ${x.tone}`}><Icon name={x.icon} size={22} /></span>
            <div><b>{x.value}</b><small>{x.label}</small></div></div>))}
      </section>

      <div className="dash-grid">
        <section className="card panel">
          <h3>Ujian aktif & mendatang</h3>
          {!exams.length && <p className="muted">Belum ada ujian aktif atau terjadwal.</p>}
          {exams.map(e => {
            const live = now >= Date.parse(e.start_at) && now <= Date.parse(e.end_at)
            return (
              <button className="exam-row" key={e.id} onClick={() => go('exams')}>
                <span className={`dot ${live ? 'live' : ''}`} />
                <div><b>{e.title}</b><small>{e.courses?.name} · {fmt(e.start_at)} · {e.duration_minutes} mnt</small></div>
                <span className={`badge ${live ? 'AKTIF' : ''}`}>{live ? 'Berlangsung' : 'Terjadwal'}</span>
              </button>)
          })}
        </section>

        <section className="card panel">
          <h3>Aksi cepat</h3>
          <div className="quick">
            {actions.map(([ic, label, id]) => (
              <button key={id + label} className="quick-btn" onClick={() => go(id)}><Icon name={ic} size={22} />{label}</button>))}
          </div>
        </section>
      </div>

      {setup && (
        <section className="card panel">
          <h3>🚀 Langkah awal pemasangan</h3>
          <ol className="steps">
            <li>Buat <b>Fakultas, Program Studi, dan Tahun Akademik</b> di menu terkait.</li>
            <li>Tambahkan <b>Mata Kuliah</b>, lalu buat <b>Kelas</b>.</li>
            <li><b>Impor mahasiswa</b> ke kelas, dan <b>tugaskan dosen</b> di menu Kelas & Mahasiswa.</li>
            <li>Dosen membuat <b>Bank Soal</b> lalu <b>menjadwalkan ujian</b>.</li>
          </ol>
        </section>
      )}
    </div>
  )
}
