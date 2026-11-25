import { Fragment, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { downloadExcel } from './importers.js'

const tone = l => ({ 'Sangat baik': 'good', Baik: 'good', Cukup: 'mid', Buruk: 'bad', 'Sangat buruk': 'bad', Mudah: 'mid', Sedang: 'good', Sulit: 'mid' }[l] || '')

export default function ItemAnalysis({ exam, onBack }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  const load = async () => {
    const { data, error } = await supabase.from('item_analysis').select('*, questions(body, qtype)').eq('exam_id', exam.id)
    if (error) return setErr(error.message)
    // diurutkan dari daya beda terendah (paling perlu ditinjau)
    setRows([...data].sort((a, b) => (a.discrimination_d ?? 9) - (b.discrimination_d ?? 9)))
  }
  const compute = async () => {
    setBusy(true); setErr(''); setNote('')
    const { data, error } = await supabase.rpc('compute_item_analysis', { p_exam: exam.id })
    setBusy(false)
    if (error) return setErr(error.message)
    setNote(data ? `${data} soal dianalisis.` : 'Belum ada peserta yang selesai, atau semua jawaban esai belum dinilai.')
    load()
  }
  useEffect(() => { load() }, [])

  const bad = rows.filter(r => r.discrimination_d !== null && r.discrimination_d < 0.2).length
  const good = rows.filter(r => r.recommendation.startsWith('Soal baik')).length
  const exportXlsx = () => downloadExcel(rows.map((r, i) => ({
    No: i + 1, Soal: r.questions?.body, 'Jumlah Peserta': r.total_participants, 'Tingkat Kesulitan (P)': r.difficulty_p, 'Kategori P': r.difficulty_label,
    'Daya Beda (D)': r.discrimination_d, 'Kategori D': r.discrimination_label, Rekomendasi: r.recommendation })), `analisis_butir_${exam.title.replace(/\W+/g, '_')}.xlsx`, 'Analisis')

  return (
    <div>
      <div className="bar"><div><button className="ghost" onClick={onBack}>← Kembali</button><h2>Analisis Butir Soal: {exam.title}</h2></div>
        <div className="row"><button onClick={compute} disabled={busy}>{busy ? 'Menghitung…' : 'Hitung / Perbarui'}</button><button className="ghost" onClick={exportXlsx} disabled={!rows.length}>Unduh Excel</button></div></div>
      <p className="muted">Dihitung dari peserta yang sudah selesai. P = tingkat kesulitan (makin besar makin mudah). D = daya beda antara kelompok atas dan bawah (27%); butuh minimal 6 peserta. Urutan: daya beda terendah di atas.</p>
      {err && <p className="error">{err}</p>}{note && <p className="okmsg">{note}</p>}
      {rows.length > 0 && <p><b>{rows.length}</b> soal · <span className="okmsg">{good} baik</span> · <span className="error">{bad} perlu direvisi/ditinjau</span></p>}
      <div className="scroll"><table>
        <thead><tr><th>#</th><th>Soal</th><th>P</th><th>D</th><th>Rekomendasi</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <Fragment key={r.question_id}>
            <tr onClick={() => setOpen(open === r.question_id ? null : r.question_id)} style={{ cursor: 'pointer' }}>
              <td>{i + 1}</td><td>{(r.questions?.body || '').slice(0, 90)}</td>
              <td>{r.difficulty_p}<br /><span className={`tag ${tone(r.difficulty_label)}`}>{r.difficulty_label}</span></td>
              <td>{r.discrimination_d ?? '—'}<br /><span className={`tag ${tone(r.discrimination_label)}`}>{r.discrimination_label}</span></td>
              <td>{r.recommendation}</td>
            </tr>
            {open === r.question_id && (
              <tr><td colSpan={5}><Distribution r={r} /></td></tr>
            )}
          </Fragment>
        ))}
        {!rows.length && <tr><td colSpan={5}>Belum ada analisis. Klik “Hitung / Perbarui” setelah ada peserta yang selesai.</td></tr>}</tbody>
      </table></div>
    </div>
  )
}

function Distribution({ r }) {
  const d = r.option_distribution || {}
  const labels = Object.keys(d).filter(k => k !== '_blank').sort()
  if (!labels.length) return <small className="muted">Distribusi pilihan hanya tersedia untuk soal PG dan PG Kompleks. Jawaban kosong: {d._blank ?? 0}.</small>
  return (
    <div className="stack"><b>Sebaran jawaban ({r.total_participants} peserta)</b>
      {labels.map(l => {
        const x = d[l], pct = Math.round((x.total / r.total_participants) * 100)
        return (
          <div className="distrow" key={l}>
            <span className="pill">{l}{x.is_key ? ' ✓' : ''}</span>
            <div className="bar-bg"><div className={`bar-fg ${x.is_key ? 'key' : ''}`} style={{ width: `${pct}%` }} /></div>
            <small>{x.total} ({pct}%) · atas {x.upper} · bawah {x.lower}</small>
          </div>)
      })}
      <small className="muted">Kosong: {d._blank ?? 0}. Pengecoh yang baik dipilih lebih banyak oleh kelompok bawah daripada kelompok atas.</small>
    </div>
  )
}
