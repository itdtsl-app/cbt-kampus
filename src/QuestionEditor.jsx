import { useState } from 'react'
import { TYPES } from './questionApi.js'
import { supabase } from './supabase'

const LET = 'ABCDEF'
const blankOpts = n => Array.from({ length: n }, (_, i) => ({ label: LET[i], body: '', pair_text: '' }))

// initial: soal yang diubah (dengan options & key) atau null untuk soal baru
export default function QuestionEditor({ initial, onSave, onCancel }) {
  const init = initial || {}
  const [qtype, setQtype] = useState(init.qtype || 'PG')
  const [body, setBody] = useState(init.body || '')
  const [weight, setWeight] = useState(init.weight ?? 1)
  const [difficulty, setDifficulty] = useState(init.difficulty ?? 2)
  const [mode, setMode] = useState(init.scoring_mode || 'PARTIAL')
  const [discussion, setDiscussion] = useState(init.discussion || '')
  const [options, setOptions] = useState(() => {
    if (init.options?.length) return init.options.map(o => ({ label: o.label, body: o.body || '', pair_text: o.pair_text || '' }))
    return blankOpts(4)
  })
  const [single, setSingle] = useState(typeof init.key === 'string' ? init.key : 'A')
  const [multi, setMulti] = useState(Array.isArray(init.key) && init.qtype === 'PGK' ? init.key : [])
  const [bs, setBs] = useState(init.qtype === 'BENAR_SALAH' && init.key ? init.key : 'BENAR')
  const [isian, setIsian] = useState(init.qtype === 'ISIAN' && Array.isArray(init.key) ? init.key.join('\n') : '')
  const [err, setErr] = useState('')
  const [imageUrl, setImageUrl] = useState(init.image_url || '')
  const [uploading, setUploading] = useState(false)

  const setOpt = (i, f, v) => setOptions(options.map((o, j) => (j === i ? { ...o, [f]: v } : o)))
  const addOpt = () => options.length < 6 && setOptions([...options, { label: LET[options.length], body: '', pair_text: '' }])
  const delOpt = i => {
    const next = options.filter((_, j) => j !== i)
    setOptions(qtype === 'MENJODOHKAN' ? next.map((o, j) => ({ ...o, label: String(j + 1) })) : next.map((o, j) => ({ ...o, label: LET[j] })))
  }
  const changeType = t => {
    setQtype(t); setErr('')
    if (t === 'MENJODOHKAN') setOptions([1, 2, 3].map(n => ({ label: String(n), body: '', pair_text: '' })))
    else if (t === 'PG' || t === 'PGK') setOptions(blankOpts(4))
  }

  const upload = async e => {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) return setErr('Format gambar harus PNG, JPG, WEBP, atau GIF.')
    if (f.size > 2 * 1024 * 1024) return setErr('Ukuran gambar maksimal 2 MB.')
    setUploading(true); setErr('')
    const ext = f.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('question-images').upload(path, f, { contentType: f.type, cacheControl: '31536000' })
    setUploading(false)
    if (error) return setErr('Gagal mengunggah gambar: ' + error.message)
    setImageUrl(supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl)
  }

  const submit = e => {
    e.preventDefault()
    const q = { qtype, body: body.trim(), weight: Number(weight) || 1, difficulty: Number(difficulty), scoring_mode: mode,
                discussion: discussion.trim() || null, image_url: imageUrl || null, options: [], key: null }
    if (!q.body) return setErr('Teks soal wajib diisi.')
    if (qtype === 'PG' || qtype === 'PGK') {
      const filled = options.filter(o => o.body.trim())
      if (filled.length < 2) return setErr('Isi minimal 2 opsi.')
      q.options = filled.map((o, i) => ({ label: LET[i], body: o.body.trim(), pair_text: null }))
      // pemetaan kunci mengikuti huruf lama -> huruf baru
      const map = {}; filled.forEach((o, i) => { map[o.label] = LET[i] })
      if (qtype === 'PG') { if (!map[single]) return setErr('Pilih kunci jawaban yang opsinya terisi.'); q.key = map[single] }
      else { const k = multi.filter(l => map[l]).map(l => map[l]); if (!k.length) return setErr('Centang minimal 1 kunci jawaban.'); q.key = k }
    } else if (qtype === 'BENAR_SALAH') q.key = bs
    else if (qtype === 'MENJODOHKAN') {
      const f = options.filter(o => o.body.trim() && o.pair_text.trim())
      if (f.length < 2) return setErr('Isi minimal 2 pasangan lengkap (kiri dan kanan).')
      q.options = f.map((o, i) => ({ label: String(i + 1), body: o.body.trim(), pair_text: o.pair_text.trim() }))
      q.key = Object.fromEntries(q.options.map(o => [o.label, o.pair_text]))
    } else if (qtype === 'ISIAN') {
      const k = isian.split('\n').map(s => s.trim()).filter(Boolean)
      if (!k.length) return setErr('Isi minimal 1 jawaban yang diterima.')
      q.key = k
    }
    onSave(q)
  }

  return (
    <div className="modal" onClick={onCancel}>
      <form className="card wide" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h3>{initial ? 'Ubah Soal' : 'Soal Baru'}</h3>
        <label>Tipe soal
          <select value={qtype} onChange={e => changeType(e.target.value)} disabled={!!initial}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Teks soal<textarea rows={3} value={body} onChange={e => setBody(e.target.value)} /></label>

        <div className="stack">
          <b>Gambar soal (opsional)</b>
          {imageUrl && <img className="qimg" src={imageUrl} alt="Gambar soal" />}
          <div className="row">
            <label className="filebtn">{uploading ? 'Mengunggah…' : imageUrl ? 'Ganti gambar' : 'Unggah gambar'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={uploading} onChange={upload} /></label>
            {imageUrl && <button type="button" className="ghost danger" onClick={() => setImageUrl('')}>Hapus gambar</button>}
          </div>
          <small className="muted">PNG/JPG/WEBP/GIF, maksimal 2 MB.</small>
        </div>

        {(qtype === 'PG' || qtype === 'PGK') && (
          <div className="stack">
            <b>Opsi jawaban {qtype === 'PG' ? '(pilih satu kunci)' : '(centang semua kunci)'}</b>
            {options.map((o, i) => (
              <div className="row opt" key={i}>
                {qtype === 'PG'
                  ? <input type="radio" name="k" checked={single === o.label} onChange={() => setSingle(o.label)} />
                  : <input type="checkbox" checked={multi.includes(o.label)} onChange={e => setMulti(e.target.checked ? [...multi, o.label] : multi.filter(x => x !== o.label))} />}
                <span className="pill">{o.label}</span>
                <input value={o.body} placeholder={`Opsi ${o.label}`} onChange={e => setOpt(i, 'body', e.target.value)} />
                {options.length > 2 && <button type="button" className="ghost danger" onClick={() => delOpt(i)}>✕</button>}
              </div>
            ))}
            {options.length < 6 && <button type="button" className="ghost" onClick={addOpt}>+ Tambah opsi</button>}
          </div>
        )}

        {qtype === 'BENAR_SALAH' && (
          <label>Kunci jawaban
            <select value={bs} onChange={e => setBs(e.target.value)}><option value="BENAR">Benar</option><option value="SALAH">Salah</option></select>
          </label>
        )}

        {qtype === 'MENJODOHKAN' && (
          <div className="stack">
            <b>Pasangan (kiri dijodohkan dengan kanan)</b>
            {options.map((o, i) => (
              <div className="row opt" key={i}>
                <span className="pill">{o.label}</span>
                <input value={o.body} placeholder="Sisi kiri" onChange={e => setOpt(i, 'body', e.target.value)} />
                <span>↔</span>
                <input value={o.pair_text} placeholder="Sisi kanan" onChange={e => setOpt(i, 'pair_text', e.target.value)} />
                {options.length > 2 && <button type="button" className="ghost danger" onClick={() => delOpt(i)}>✕</button>}
              </div>
            ))}
            {options.length < 6 && <button type="button" className="ghost" onClick={addOpt}>+ Tambah pasangan</button>}
          </div>
        )}

        {qtype === 'ISIAN' && (
          <label>Jawaban yang diterima (satu per baris; huruf besar/kecil tidak dibedakan)
            <textarea rows={3} value={isian} onChange={e => setIsian(e.target.value)} />
          </label>
        )}
        {qtype === 'ESAI' && <p className="muted">Soal esai tidak punya kunci otomatis; dinilai manual oleh dosen.</p>}

        <div className="grid3">
          <label>Bobot<input type="number" min="0.5" step="0.5" value={weight} onChange={e => setWeight(e.target.value)} /></label>
          <label>Kesulitan
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value={1}>Mudah</option><option value={2}>Sedang</option><option value={3}>Sulit</option></select>
          </label>
          {(qtype === 'PGK' || qtype === 'MENJODOHKAN') && (
            <label>Penilaian
              <select value={mode} onChange={e => setMode(e.target.value)}><option value="PARTIAL">Sebagian (parsial)</option><option value="FULL">Harus benar semua</option></select>
            </label>
          )}
        </div>
        <label>Pembahasan (opsional)<textarea rows={2} value={discussion} onChange={e => setDiscussion(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <div className="row end">
          <button type="button" className="ghost" onClick={onCancel}>Batal</button>
          <button type="submit">Simpan Soal</button>
        </div>
      </form>
    </div>
  )
}
