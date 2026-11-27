import { useState } from 'react'
import { callFunction } from './functionsApi.js'
import { buildCards, exportCardsExcel } from './cards.js'
import { loginLabel } from './cardsUtil.js'
import PrintCards from './PrintCards.jsx'

// Reset password lalu cetak dan/atau unduh Excel kartu peserta.
// students: [{ id, name, nim, email }]
export default function CardsDialog({ students, onClose, onDone }) {
  const [doPrint, setDoPrint] = useState(true)
  const [doExcel, setDoExcel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [summary, setSummary] = useState(null)
  const [cards, setCards] = useState(null)

  const toCard = r => ({ student_id: r.user_id, name: r.name, nim: r.nim, login: loginLabel(r.login, r.nim), password: r.password })

  const run = async () => {
    if (!confirm(`Buat password BARU untuk ${students.length} mahasiswa?\n\nPassword lama mereka tidak berlaku lagi.`)) return
    setBusy(true)
    const okRows = [], failed = []
    let error = ''
    try {
      const ids = students.map(s => s.id)
      for (let i = 0; i < ids.length; i += 25) {
        setProgress(`Membuat password ${Math.min(i + 25, ids.length)}/${ids.length}…`)
        const data = await callFunction('reset-password', { user_ids: ids.slice(i, i + 25) })
        for (const r of data.results) (r.status === 'OK' ? okRows : failed).push(r)
      }
    } catch (e) { error = e.message }
    setSummary({ okRows, failed, error })
    setBusy(false); setProgress('')
    if (okRows.length && (doPrint || doExcel)) {
      const built = await buildCards(okRows.map(toCard))
      if (doExcel) await exportCardsExcel(built.list, 'kartu_peserta.xlsx')
      if (doPrint) setCards(built)
    }
  }
  const openPrint = async () => setCards(await buildCards(summary.okRows.map(toCard)))
  const download = async () => exportCardsExcel((await buildCards(summary.okRows.map(toCard))).list, 'kartu_peserta.xlsx')
  const finish = () => { if (summary) onDone?.(); onClose() }
  const nm = r => `${r.name || r.user_id}${r.nim ? ` (${r.nim})` : ''}`

  return (
    <>
      <div className="modal" onClick={busy ? undefined : finish}>
        <div className="card wide" onClick={e => e.stopPropagation()}>
          <h3>Kartu peserta untuk {students.length} mahasiswa</h3>
          {!summary ? (<>
            <div className="stack">
              <label className="check"><input type="checkbox" checked={doPrint} onChange={e => setDoPrint(e.target.checked)} />Cetak kartu (pratinjau, lalu cetak atau simpan PDF)</label>
              <label className="check"><input type="checkbox" checked={doExcel} onChange={e => setDoExcel(e.target.checked)} />Unduh Excel (nama, NIM, username, password, jadwal ujian)</label>
            </div>
            <p className="warn">Password baru dibuat untuk <b>{students.length}</b> mahasiswa. Password lama tidak berlaku lagi, dan password baru hanya dapat dilihat sekali (di kartu atau file Excel ini). File Excel berisi password, jadi simpan dengan aman.</p>
            <div className="row end">
              <button className="ghost" onClick={onClose} disabled={busy}>Batal</button>
              <button onClick={run} disabled={busy || (!doPrint && !doExcel)}>{busy ? progress || 'Memproses…' : 'Lanjutkan'}</button>
            </div>
          </>) : (<>
            <p className="okmsg">{summary.okRows.length} password baru dibuat.</p>
            {summary.error && <p className="error" style={{ margin: 0 }}>{summary.error}</p>}
            {summary.failed.length > 0 && (
              <div className="warn"><b>{summary.failed.length} gagal:</b>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {summary.failed.slice(0, 15).map(r => <li key={r.user_id}>{nm(r)} — {r.status.replace('GAGAL: ', '')}</li>)}
                </ul></div>)}
            <p className="muted" style={{ margin: 0 }}>Password tidak dapat ditampilkan lagi setelah jendela ini ditutup. Cetak atau unduh sekarang jika belum.</p>
            <div className="row end">
              <button className="ghost" onClick={download} disabled={!summary.okRows.length}>Unduh Excel ({summary.okRows.length})</button>
              <button className="ghost" onClick={openPrint} disabled={!summary.okRows.length}>Cetak kartu ({summary.okRows.length})</button>
              <button onClick={finish}>Selesai</button>
            </div>
          </>)}
        </div>
      </div>
      {cards && <PrintCards cards={cards.list} note={cards.note} onClose={() => setCards(null)} />}
    </>
  )
}
