import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Halaman CRUD generik: cukup beri nama tabel + daftar kolom.
// column: { key, label, type: 'text'|'number'|'bool'|'select', ref:{table,label}, options:[] }
export default function CrudPage({ table, title, columns, canAdd = true, canDelete = true }) {
  const [rows, setRows] = useState([])
  const [refs, setRefs] = useState({})
  const [form, setForm] = useState(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const { data, error } = await supabase.from(table).select('*').order(columns[0].key).limit(1000)
    if (error) setErr(error.message); else { setRows(data); setErr('') }
  }

  useEffect(() => {
    load()
    columns.filter(c => c.ref).forEach(async c => {
      const { data } = await supabase.from(c.ref.table).select(`id, ${c.ref.label}`)
      setRefs(r => ({ ...r, [c.key]: data || [] }))
    })
  }, [table])

  const show = (c, row) => {
    const v = row[c.key]
    if (c.type === 'bool') return v ? '✓' : '—'
    if (c.ref) return refs[c.key]?.find(x => x.id === v)?.[c.ref.label] ?? ''
    return v ?? ''
  }

  const save = async e => {
    e.preventDefault()
    const payload = {}
    columns.forEach(c => {
      let v = form[c.key]
      if (c.type === 'number') v = v === '' || v == null ? null : Number(v)
      else if (c.type === 'bool') v = !!v
      else if (v === '') v = null
      payload[c.key] = v
    })
    const q = form.id
      ? supabase.from(table).update(payload).eq('id', form.id)
      : supabase.from(table).insert(payload)
    const { error } = await q
    if (error) return setErr(error.message)
    setForm(null); load()
  }

  const remove = async row => {
    if (!confirm('Hapus data ini?')) return
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    if (error) setErr(error.message); else load()
  }

  const field = c => {
    const val = form[c.key] ?? (c.type === 'bool' ? false : '')
    const set = v => setForm({ ...form, [c.key]: v })
    if (c.type === 'bool')
      return <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} />
    if (c.ref || c.type === 'select') {
      const opts = c.ref
        ? (refs[c.key] || []).map(o => [o.id, o[c.ref.label]])
        : c.options.map(o => [o, o])
      return (
        <select value={val} onChange={e => set(e.target.value)} required>
          <option value="">— pilih —</option>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
    }
    return <input type={c.type === 'number' ? 'number' : 'text'} value={val}
                  onChange={e => set(e.target.value)} />
  }

  return (
    <div>
      <div className="bar">
        <h2>{title}</h2>
        {canAdd && <button onClick={() => setForm({})}>+ Tambah</button>}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="scroll">
        <table>
          <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                {columns.map(c => <td key={c.key}>{show(c, r)}</td>)}
                <td className="actions">
                  <button className="ghost" onClick={() => setForm(r)}>Ubah</button>
                  {canDelete && <button className="ghost danger" onClick={() => remove(r)}>Hapus</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={columns.length + 1}>Belum ada data.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="card" onClick={e => e.stopPropagation()} onSubmit={save}>
            <h3>{form.id ? 'Ubah' : 'Tambah'} {title}</h3>
            {columns.map(c => <label key={c.key}>{c.label}{field(c)}</label>)}
            <div className="row">
              <button type="button" className="ghost" onClick={() => setForm(null)}>Batal</button>
              <button type="submit">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
