import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import QuestionEditor from './QuestionEditor.jsx'
import { readExcelQuestions, readWordQuestions } from './importers.js'
import { saveQuestion, importQuestions, TYPE_LABEL } from './questionApi.js'

export default function QuestionBanks({ profile }) {
  const [bank, setBank] = useState(null)
  return bank ? <BankDetail bank={bank} onBack={() => setBank(null)} /> : <BankList profile={profile} onOpen={setBank} />
}

function BankList({ profile, onOpen }) {
  const [banks, setBanks] = useState([])
  const [courses, setCourses] = useState([])
  const [form, setForm] = useState(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const { data, error } = await supabase.from('question_banks').select('*, courses(name)').order('created_at', { ascending: false })
    if (error) setErr(error.message); else setBanks(data)
  }
  useEffect(() => {
    load()
    supabase.from('courses').select('id, name, code').order('name').then(({ data }) => setCourses(data || []))
  }, [])

  const save = async e => {
    e.preventDefault()
    const { error } = await supabase.from('question_banks').insert({
      title: form.title, topic: form.topic || null, learning_outcome: form.learning_outcome || null,
      course_id: form.course_id, owner_id: profile.id,
    })
    if (error) return setErr(error.message)
    setForm(null); load()
  }
  const remove = async b => {
    if (!confirm(`Hapus bank "${b.title}" beserta semua soalnya?`)) return
    const { error } = await supabase.from('question_banks').delete().eq('id', b.id)
    if (error) setErr(error.message); else load()
  }

  return (
    <div>
      <div className="bar"><h2>Bank Soal</h2><button onClick={() => setForm({})}>+ Bank Baru</button></div>
      {err && <p className="error">{err}</p>}
      <div className="scroll"><table>
        <thead><tr><th>Judul</th><th>Mata Kuliah</th><th>Topik</th><th /></tr></thead>
        <tbody>
          {banks.map(b => (
            <tr key={b.id}>
              <td><b>{b.title}</b></td><td>{b.courses?.name}</td><td>{b.topic}</td>
              <td className="actions">
                <button className="ghost" onClick={() => onOpen(b)}>Buka</button>
                <button className="ghost danger" onClick={() => remove(b)}>Hapus</button>
              </td>
            </tr>
          ))}
          {!banks.length && <tr><td colSpan={4}>Belum ada bank soal. Klik “+ Bank Baru”.</td></tr>}
        </tbody>
      </table></div>
      {form && (
        <div className="modal" onClick={() => setForm(null)}>
          <form className="card" onClick={e => e.stopPropagation()} onSubmit={save}>
            <h3>Bank Soal Baru</h3>
            <label>Judul<input required value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
            <label>Mata Kuliah
              <select required value={form.course_id || ''} onChange={e => setForm({ ...form, course_id: e.target.value })}>
                <option value="">— pilih —</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </label>
            <label>Topik (opsional)<input value={form.topic || ''} onChange={e => setForm({ ...form, topic: e.target.value })} /></label>
            <label>CPMK / capaian pembelajaran (opsional)<input value={form.learning_outcome || ''} onChange={e => setForm({ ...form, learning_outcome: e.target.value })} /></label>
            <div className="row end"><button type="button" className="ghost" onClick={() => setForm(null)}>Batal</button><button type="submit">Simpan</button></div>
          </form>
        </div>
      )}
    </div>
  )
}

function BankDetail({ bank, onBack }) {
  const [qs, setQs] = useState([])
  const [editing, setEditing] = useState(undefined) // undefined=tutup, null=baru, objek=ubah
  const [preview, setPreview] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const xlsRef = useRef(), docRef = useRef()

  const load = async () => {
    const { data, error } = await supabase.from('questions').select('*').eq('bank_id', bank.id).order('created_at')
    if (error) setErr(error.message); else setQs(data)
  }
  useEffect(() => { load() }, [])

  const openEdit = async q => {
    const [o, k] = await Promise.all([
      supabase.from('question_options').select('*').eq('question_id', q.id).order('sort_order'),
      supabase.from('question_keys').select('answer_key').eq('question_id', q.id).maybeSingle(),
    ])
    setEditing({ ...q, options: o.data || [], key: k.data?.answer_key ?? null })
  }
  const onSave = async q => {
    try { await saveQuestion(bank.id, q, editing?.id); setEditing(undefined); load() }
    catch (e) { setErr(e.message) }
  }
  const remove = async q => {
    if (!confirm('Hapus soal ini?')) return
    const { error } = await supabase.from('questions').delete().eq('id', q.id)
    if (error) setErr(error.message); else load()
  }

  const pick = async (e, reader) => {
    const file = e.target.files[0]; e.target.value = ''
    if (!file) return
    setErr(''); setMsg('')
    try { setPreview(await reader(file)) } catch (x) { setErr('File tidak dapat dibaca: ' + x.message) }
  }
  const confirmImport = async () => {
    const ok = preview.filter(p => !p.errors.length).map(p => p.q)
    setBusy(true)
    try {
      await importQuestions(bank.id, ok, (a, b) => setMsg(`Menyimpan ${a}/${b}…`))
      setMsg(`${ok.length} soal berhasil diimpor.`); setPreview(null); load()
    } catch (x) { setErr(x.message); setMsg('') }
    setBusy(false)
  }

  const validCount = preview ? preview.filter(p => !p.errors.length).length : 0
  return (
    <div>
      <div className="bar">
        <div><button className="ghost" onClick={onBack}>← Kembali</button><h2>{bank.title}</h2></div>
        <div className="row">
          <button onClick={() => setEditing(null)}>+ Soal</button>
          <button className="ghost" onClick={() => xlsRef.current.click()}>Impor Excel</button>
          <button className="ghost" onClick={() => docRef.current.click()}>Impor Word</button>
        </div>
      </div>
      <input ref={xlsRef} type="file" accept=".xlsx" hidden onChange={e => pick(e, readExcelQuestions)} />
      <input ref={docRef} type="file" accept=".docx" hidden onChange={e => pick(e, readWordQuestions)} />
      <p className="muted">Template: <a href={`${import.meta.env.BASE_URL}templates/template_soal.xlsx`} download>Excel</a> · <a href={`${import.meta.env.BASE_URL}templates/template_soal.docx`} download>Word</a></p>
      {err && <p className="error">{err}</p>}
      {msg && <p className="okmsg">{msg}</p>}

      {preview && (
        <div className="card full">
          <h3>Pratinjau impor: {validCount} valid, {preview.length - validCount} bermasalah</h3>
          <div className="scroll"><table>
            <thead><tr><th>No</th><th>Tipe</th><th>Soal</th><th>Status</th></tr></thead>
            <tbody>{preview.map(p => (
              <tr key={p.no}><td>{p.no}</td><td>{TYPE_LABEL[p.q.qtype] || '?'}</td>
                <td>{p.q.body.slice(0, 80)}</td>
                <td>{p.errors.length ? <span className="error">{p.errors.join('; ')}</span> : <span className="okmsg">OK</span>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="row end">
            <button className="ghost" onClick={() => setPreview(null)}>Batal</button>
            <button disabled={!validCount || busy} onClick={confirmImport}>Simpan {validCount} soal valid</button>
          </div>
        </div>
      )}

      <div className="scroll"><table>
        <thead><tr><th>#</th><th>Tipe</th><th>Soal</th><th>Bobot</th><th /></tr></thead>
        <tbody>
          {qs.map((q, i) => (
            <tr key={q.id}><td>{i + 1}</td><td>{TYPE_LABEL[q.qtype]}</td><td>{q.body.slice(0, 100)}</td><td>{q.weight}</td>
              <td className="actions"><button className="ghost" onClick={() => openEdit(q)}>Ubah</button>
                <button className="ghost danger" onClick={() => remove(q)}>Hapus</button></td></tr>
          ))}
          {!qs.length && <tr><td colSpan={5}>Belum ada soal.</td></tr>}
        </tbody>
      </table></div>
      {editing !== undefined && <QuestionEditor initial={editing} onSave={onSave} onCancel={() => setEditing(undefined)} />}
    </div>
  )
}
