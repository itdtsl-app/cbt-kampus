import { createPortal } from 'react-dom'
import Logo from './Logo.jsx'
import { BRAND } from './branding.js'
import { fmtRange } from './cardsUtil.js'

// Pratinjau + cetak kartu peserta. Dirender ke <body> agar saat dicetak hanya kartu yang tampil.
export default function PrintCards({ cards, note, onClose }) {
  const site = window.location.origin + import.meta.env.BASE_URL
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  return createPortal(
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <div><b>{cards.length} kartu peserta</b>{note && <div className="error" style={{ fontSize: 12 }}>{note}</div>}</div>
        <div className="row"><button onClick={() => window.print()}>Cetak / Simpan PDF</button><button className="ghost" onClick={onClose}>Tutup</button></div>
      </div>
      <div className="print-sheet">
        {cards.map((c, i) => (
          <article className="pcard" key={i}>
            <header>
              <Logo size={34} />
              <div><b>KARTU PESERTA UJIAN</b><small>{BRAND.name}</small></div>
            </header>
            <dl className="pcred">
              <div><dt>Nama</dt><dd>{c.name}</dd></div>
              <div><dt>NIM</dt><dd>{c.nim}</dd></div>
              <div><dt>Username</dt><dd>{c.login}</dd></div>
              <div className="pw"><dt>Password</dt><dd>{c.password}</dd></div>
            </dl>
            <div className="psched">
              <b>Jadwal ujian</b>
              {c.exams.length === 0 && <p className="pnone">Belum ada jadwal ujian aktif.</p>}
              {c.exams.map(x => (
                <div className="pexam" key={x.exam_id}>
                  <span><b>{x.title}</b> · {x.course_name} ({x.kind})</span>
                  <span>{fmtRange(x.start_at, x.end_at)} · durasi {x.duration_minutes} menit</span>
                </div>))}
            </div>
            <footer>
              <span>Alamat ujian: {site}</span>
              <span>Rahasiakan password. Token ujian (jika ada) diberikan pengawas saat ujian. Dicetak {today}.</span>
            </footer>
          </article>
        ))}
      </div>
    </div>,
    document.body
  )
}
