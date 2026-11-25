import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { downloadExcel } from './importers.js'

const ago = (iso, now) => (iso ? `${Math.max(0, Math.round((now - Date.parse(iso)) / 1000))} dtk lalu` : '—')

export function Monitor({ exam, onBack }) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(Date.now())

  const load = async () => {
    const { data, error } = await supabase.rpc('exam_monitor', { p_exam: exam.id })
    if (error) return setErr(error.message)
    setErr(''); setRows(data); if (data[0]) setOffset(Date.parse(data[0].server_now) - Date.now())
  }
  useEffect(() => { load(); const a = setInterval(load, 10000); const b = setInterval(() => setTick(Date.now()), 1000); return () => { clearInterval(a); clearInterval(b) } }, [])
  const act = async (fn, args) => { const { error } = await supabase.rpc(fn, args); if (error) setErr(error.message); else load() }

  const cnt = s => rows.filter(r => r.status === s).length
  return (
    <div>
      <div className="bar"><div><button className="ghost" onClick={onBack}>← Kembali</button><h2>Pantau: {exam.title}</h2></div>
        <button className="danger-solid" onClick={async () => {
          if (!confirm('Akhiri ujian untuk SEMUA peserta yang masih mengerjakan dan tutup ujian ini?')) return
          await act('staff_finish_all', { p_exam: exam.id, p_force: true })
          await supabase.from('exams').update({ status: 'SELESAI' }).eq('id', exam.id)
        }}>Akhiri semua & tutup</button></div>
      <p className="muted">Diperbarui otomatis tiap 10 detik. Berlangsung: <b>{cnt('BERLANGSUNG')}</b> · Terkunci: <b>{cnt('TERKUNCI')}</b> · Selesai: <b>{cnt('SELESAI') + cnt('WAKTU_HABIS')}</b> · Total: <b>{rows.length}</b></p>
      {err && <p className="error">{err}</p>}
      <div className="scroll"><table>
        <thead><tr><th>NIM</th><th>Nama</th><th>Status</th><th>Progres</th><th>Pelanggaran</th><th>Aktif terakhir</th><th /></tr></thead>
        <tbody>{rows.map(r => {
          const stale = r.status === 'BERLANGSUNG' && r.last_seen && (tick + offset - Date.parse(r.last_seen)) > 60000
          return (
            <tr key={r.participant_id} className={r.status === 'TERKUNCI' ? 'rowlock' : ''}>
              <td>{r.nim}</td><td>{r.full_name}{r.attempt_no > 1 ? ` (percobaan ${r.attempt_no})` : ''}</td>
              <td><span className={`badge ${r.status}`}>{r.status}</span>{stale && <small className="error"> offline?</small>}</td>
              <td>{r.answered}/{r.total}</td><td>{r.violation_count}</td><td>{ago(r.last_seen, tick + offset)}</td>
              <td className="actions">
                {r.status === 'TERKUNCI' && <button className="ghost" onClick={() => { const m = prompt('Buka kunci. Tambah waktu berapa menit?', '5'); if (m !== null) act('staff_unlock', { p_participant: r.participant_id, p_extra_minutes: Number(m) || 0 }) }}>Buka kunci</button>}
                {(r.status === 'BERLANGSUNG' || r.status === 'TERKUNCI') && <button className="ghost danger" onClick={() => confirm(`Akhiri ujian ${r.full_name}?`) && act('staff_finish', { p_participant: r.participant_id })}>Akhiri</button>}
              </td>
            </tr>)
        })}
        {!rows.length && <tr><td colSpan={7}>Belum ada peserta yang memulai.</td></tr>}</tbody>
      </table></div>
    </div>
  )
}

export function Results({ exam, onBack }) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  useEffect(() => { supabase.rpc('exam_results', { p_exam: exam.id }).then(({ data, error }) => error ? setErr(error.message) : setRows(data)) }, [])
  const done = rows.filter(r => r.final_grade !== null)
  const avg = done.length ? (done.reduce((s, r) => s + Number(r.final_grade), 0) / done.length).toFixed(2) : '—'
  const pending = rows.reduce((t, r) => t + (r.pending_essays || 0), 0)
  const exportXlsx = () => downloadExcel(rows.map(r => ({
    NIM: r.nim, Nama: r.full_name, Nilai: r.final_grade, Huruf: r.letter_grade, Skor: r.total_score, 'Skor Maks': r.total_max,
    Benar: r.correct_count, Salah: r.wrong_count, Kosong: r.blank_count, Lulus: r.is_passed === null ? '' : r.is_passed ? 'Ya' : 'Tidak',
    'Esai Belum Dinilai': r.pending_essays, Status: r.status, Pelanggaran: r.violation_count })), `hasil_${exam.title.replace(/\W+/g, '_')}.xlsx`, 'Hasil')
  return (
    <div>
      <div className="bar"><div><button className="ghost" onClick={onBack}>← Kembali</button><h2>Hasil: {exam.title}</h2></div><button onClick={exportXlsx} disabled={!rows.length}>Unduh Excel</button></div>
      <p className="muted">Peserta dinilai: <b>{done.length}</b> · Rata-rata: <b>{avg}</b> · Lulus: <b>{done.filter(r => r.is_passed).length}</b></p>
      {pending > 0 && <p className="warn">{pending} jawaban esai belum dinilai dan sementara dihitung 0. Nilai dapat berubah setelah dosen menilai esai (menu Esai).</p>}
      {err && <p className="error">{err}</p>}
      <div className="scroll"><table>
        <thead><tr><th>NIM</th><th>Nama</th><th>Nilai</th><th>Huruf</th><th>B / S / K</th><th>Esai</th><th>Status</th><th>Pelanggaran</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.participant_id}><td>{r.nim}</td><td>{r.full_name}</td><td><b>{r.final_grade ?? '—'}</b></td><td>{r.letter_grade}</td>
          <td>{r.correct_count ?? '-'} / {r.wrong_count ?? '-'} / {r.blank_count ?? '-'}</td><td>{r.pending_essays ? `${r.pending_essays} belum` : '—'}</td><td><span className={`badge ${r.status}`}>{r.status}</span></td><td>{r.violation_count}</td></tr>)}
        {!rows.length && <tr><td colSpan={8}>Belum ada data.</td></tr>}</tbody>
      </table></div>
    </div>
  )
}
