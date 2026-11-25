// Fungsi murni (tanpa dependensi) untuk membaca & memvalidasi soal hasil impor.
const TYPE_ALIAS = {
  PG: 'PG', PGK: 'PGK', BENAR_SALAH: 'BENAR_SALAH', BS: 'BENAR_SALAH', 'BENAR/SALAH': 'BENAR_SALAH',
  MENJODOHKAN: 'MENJODOHKAN', JODOH: 'MENJODOHKAN', ISIAN: 'ISIAN', ESAI: 'ESAI', URAIAN: 'ESAI',
}
const OPT_KEYS = ['opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e', 'opsi_f']

// Baris Excel -> bentuk mentah
export function rawFromExcelRow(row) {
  const r = {}
  Object.keys(row).forEach(k => { r[String(k).trim().toLowerCase()] = row[k] })
  return {
    tipe: r.tipe, soal: r.soal, kunci: r.kunci, bobot: r.bobot, kesulitan: r.kesulitan, pembahasan: r.pembahasan,
    options: OPT_KEYS.map((k, i) => ({ label: 'ABCDEF'[i], text: String(r[k] ?? '').trim() })).filter(o => o.text),
  }
}

// Teks Word -> daftar bentuk mentah (blok dipisah baris '---')
export function parseWordText(text) {
  const blocks = String(text).replace(/\r/g, '').split(/\n\s*-{3,}\s*(?:\n|$)/)
  const out = []
  for (const block of blocks) {
    const raw = { options: [] }
    let cur = null, found = false
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*(TIPE|SOAL|KUNCI|BOBOT|KESULITAN|PEMBAHASAN|PASANGAN)\s*:\s*(.*)$/i)
      if (m) {
        const key = m[1].toUpperCase(), val = m[2].trim()
        if (key === 'PASANGAN') { raw.options.push({ label: String(raw.options.length + 1), text: val }); cur = 'OPT' }
        else { raw[key.toLowerCase()] = val; cur = key; if (key === 'TIPE') found = true }
        continue
      }
      const o = line.match(/^\s*([A-Fa-f])[.)]\s+(.*)$/)
      if (o && cur !== null) { raw.options.push({ label: o[1].toUpperCase(), text: o[2].trim() }); cur = 'OPT'; continue }
      if (line.trim() && (cur === 'SOAL' || cur === 'PEMBAHASAN')) raw[cur.toLowerCase()] += '\n' + line.trim()
      else if (line.trim() && cur === 'OPT' && raw.options.length) raw.options[raw.options.length - 1].text += ' ' + line.trim()
    }
    if (found) out.push(raw)
  }
  return out
}

const num = (v, d) => {
  const s = String(v ?? '').trim().replace(',', '.')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) ? n : d
}

// Bentuk mentah -> { q, errors }
export function normalizeQuestion(raw) {
  const errors = []
  const qtype = TYPE_ALIAS[String(raw.tipe ?? '').trim().toUpperCase().replace(/\s+/g, '_')]
  const body = String(raw.soal ?? '').trim()
  if (!qtype) errors.push('Tipe tidak dikenal')
  if (!body) errors.push('Teks soal kosong')

  let weight = num(raw.bobot, 1); if (weight <= 0) weight = 1
  let difficulty = Math.round(num(raw.kesulitan, 2)); if (![1, 2, 3].includes(difficulty)) difficulty = 2
  const q = { qtype, body, weight, difficulty, scoring_mode: 'PARTIAL', options: [], key: null,
              discussion: String(raw.pembahasan ?? '').trim() || null }
  const kunci = String(raw.kunci ?? '').trim()
  const opts = raw.options || []

  if (qtype === 'PG' || qtype === 'PGK') {
    q.options = opts.map(o => ({ label: o.label, body: o.text, pair_text: null }))
    const labels = q.options.map(o => o.label)
    if (q.options.length < 2) errors.push('Minimal 2 opsi')
    if (qtype === 'PG') {
      const k = kunci.toUpperCase()
      if (!labels.includes(k)) errors.push('Kunci harus satu huruf yang ada di opsi')
      else q.key = k
    } else {
      const ks = kunci.toUpperCase().split(/[\s,;]+/).filter(Boolean)
      if (!ks.length || ks.some(k => !labels.includes(k))) errors.push('Kunci PGK harus huruf-huruf yang ada di opsi (contoh A,C)')
      else q.key = ks
    }
  } else if (qtype === 'BENAR_SALAH') {
    const k = kunci.toUpperCase()
    if (['BENAR', 'B', 'TRUE', 'T'].includes(k)) q.key = 'BENAR'
    else if (['SALAH', 'S', 'FALSE', 'F'].includes(k)) q.key = 'SALAH'
    else errors.push('Kunci harus BENAR atau SALAH')
  } else if (qtype === 'MENJODOHKAN') {
    const pairs = opts.map(o => o.text.split('|').map(s => s.trim())).filter(p => p.length === 2 && p[0] && p[1])
    if (pairs.length < 2) errors.push('Minimal 2 pasangan "kiri | kanan"')
    q.options = pairs.map((p, i) => ({ label: String(i + 1), body: p[0], pair_text: p[1] }))
    q.key = Object.fromEntries(q.options.map(o => [o.label, o.pair_text]))
  } else if (qtype === 'ISIAN') {
    const ks = kunci.split(';').map(s => s.trim()).filter(Boolean)
    if (!ks.length) errors.push('Kunci isian kosong')
    else q.key = ks
  }
  return { q, errors }
}
