import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import ResetPasswordButton from './ResetPassword.jsx'
import AddUser from './AddUser.jsx'
import BulkActions from './BulkActions.jsx'
import CardsDialog from './CardsDialog.jsx'
import { downloadExcel } from './importers.js'

const PAGE = 50
const INTERNAL = '@mhs.cbt.local'
const TITLE = { DOSEN: 'Daftar Dosen', MAHASISWA: 'Daftar Mahasiswa' }

export default function UserList({ role }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Map()) // id -> data pengguna
  const [adding, setAdding] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [cardsOpen, setCardsOpen] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(0) }, 350); return () => clearTimeout(t) }, [q])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('list_users', { p_role: role, p_search: search, p_limit: PAGE, p_offset: page * PAGE })
    setLoading(false)
    if (error) return setErr(error.message)
    setErr(''); setRows(data); setTotal(data[0] ? Number(data[0].total) : 0)
  }
  useEffect(() => { load() }, [search, page])

  const toggle = async u => {
    if (!confirm(`${u.is_active ? 'Nonaktifkan' : 'Aktifkan'} akun ${u.full_name}?`)) return
    const { error } = await supabase.from('profiles').update({ is_active: !u.is_active }).eq('id', u.id)
    if (error) setErr(error.message); else load()
  }
  const fetchAll = async () => {
    const { data, error } = await supabase.rpc('list_users', { p_role: role, p_search: search, p_limit: 20000, p_offset: 0 })
    if (error) { setErr(error.message); return null }
    return data
  }
  const exportAll = async () => {
    const data = await fetchAll(); if (!data) return
    downloadExcel(data.map((u, i) => ({ No: i + 1, [role === 'DOSEN' ? 'NIP/NIDN' : 'NIM']: u.nim, Nama: u.full_name,
      Email: u.email?.endsWith(INTERNAL) ? '' : u.email, Kelas: u.classes, Status: u.is_active ? 'Aktif' : 'Nonaktif' })),
      `${role === 'DOSEN' ? 'dosen' : 'mahasiswa'}.xlsx`, role === 'DOSEN' ? 'Dosen' : 'Mahasiswa')
  }

  const exportSelected = () => downloadExcel([...selected.values()].map((u, i) => ({
    No: i + 1, [role === 'DOSEN' ? 'NIP/NIDN' : 'NIM']: u.nim, Nama: u.full_name,
    Email: u.email?.endsWith(INTERNAL) ? '' : u.email, Kelas: u.classes, Status: u.is_active ? 'Aktif' : 'Nonaktif' })),
    `${role === 'DOSEN' ? 'dosen' : 'mahasiswa'}_terpilih.xlsx`, role === 'DOSEN' ? 'Dosen' : 'Mahasiswa')

  // ---- pilihan ----
  const pageAll = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleOne = u => { const n = new Map(selected); n.has(u.id) ? n.delete(u.id) : n.set(u.id, u); setSelected(n) }
  const togglePage = () => { const n = new Map(selected); pageAll ? rows.forEach(r => n.delete(r.id)) : rows.forEach(r => n.set(r.id, r)); setSelected(n) }
  const selectAllResults = async () => { const d = await fetchAll(); if (d) setSelected(new Map(d.map(u => [u.id, u]))) }

  const noun = role === 'DOSEN' ? 'dosen' : 'mahasiswa'
  const pages = Math.max(1, Math.ceil(total / PAGE))
  return (
    <div>
      <div className="bar"><h2>{TITLE[role]}</h2>
        <div className="row"><input placeholder="Cari nama / NIM / email…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 240 }} />
          <button className="ghost" onClick={exportAll} disabled={!total}>Unduh Excel</button>
          {role === 'DOSEN' && <button onClick={() => setAdding(true)}>+ Tambah Dosen</button>}</div></div>
      <p className="muted">{total} {noun}{search ? ` untuk “${search}”` : ''}.{role === 'MAHASISWA' && ' Tambah mahasiswa lewat menu Impor Mahasiswa.'}</p>
      {err && <p className="error">{err}</p>}

      {selected.size > 0 && (
        <div className="selbar">
          <b>{selected.size} {noun} dipilih</b>
          {pageAll && total > selected.size && <button className="ghost" onClick={selectAllResults}>Pilih semua {total} hasil</button>}
          <button className="ghost" onClick={() => setSelected(new Map())}>Kosongkan</button>
          <button className="ghost" onClick={exportSelected}>Ekspor Excel</button>
          {role === 'MAHASISWA' && <button className="ghost" onClick={() => setCardsOpen(true)}>Kartu peserta…</button>}
          <button onClick={() => setBulk(true)}>Aksi massal…</button>
        </div>
      )}

      <div className="scroll"><table>
        <thead><tr>
          <th style={{ width: 36 }}><input type="checkbox" checked={pageAll} onChange={togglePage} title="Pilih semua di halaman ini" /></th>
          <th>#</th><th>{role === 'DOSEN' ? 'NIP/NIDN' : 'NIM'}</th><th>Nama</th><th>Login</th><th>{role === 'DOSEN' ? 'Kelas diampu' : 'Kelas diikuti'}</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((u, i) => (
            <tr key={u.id} className={selected.has(u.id) ? 'rowsel' : ''}>
              <td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u)} /></td>
              <td>{page * PAGE + i + 1}</td><td>{u.nim}</td><td><b>{u.full_name}</b></td>
              <td>{u.email?.endsWith(INTERNAL) ? <span className="muted">NIM</span> : u.email}</td>
              <td style={{ maxWidth: 280 }}><small>{u.classes || '—'}</small></td>
              <td><span className={`badge ${u.is_active ? 'AKTIF' : 'TERKUNCI'}`}>{u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td className="actions">
                <ResetPasswordButton printable={role === 'MAHASISWA'} user={{ id: u.id, name: u.full_name }} />
                <button className="ghost danger" onClick={() => toggle(u)}>{u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8}>{loading ? 'Memuat…' : 'Tidak ada data.'}</td></tr>}
        </tbody>
      </table></div>
      {pages > 1 && (
        <div className="row end" style={{ marginTop: 12, alignItems: 'center' }}>
          <button className="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>← Sebelumnya</button>
          <small>Halaman {page + 1} dari {pages}</small>
          <button className="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Berikutnya →</button>
        </div>
      )}

      {adding && <AddUser onClose={() => setAdding(false)} onDone={load} />}
      {bulk && <BulkActions role={role} ids={[...selected.keys()]} onClose={() => setBulk(false)} onDone={() => { setSelected(new Map()); load() }} />}
      {cardsOpen && <CardsDialog students={[...selected.values()].map(u => ({ id: u.id, name: u.full_name, nim: u.nim, email: u.email }))}
        onClose={() => setCardsOpen(false)} onDone={() => { setSelected(new Map()); load() }} />}
    </div>
  )
}
