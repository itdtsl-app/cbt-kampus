import { supabase } from './supabase'

export const TYPES = [
  ['PG', 'Pilihan Ganda'], ['PGK', 'Pilihan Ganda Kompleks'], ['BENAR_SALAH', 'Benar/Salah'],
  ['MENJODOHKAN', 'Menjodohkan'], ['ISIAN', 'Isian Singkat'], ['ESAI', 'Esai'],
]
export const TYPE_LABEL = Object.fromEntries(TYPES)

const toRow = (bankId, q) => ({
  bank_id: bankId, qtype: q.qtype, body: q.body, difficulty: q.difficulty, weight: q.weight,
  scoring_mode: q.scoring_mode || 'PARTIAL', discussion: q.discussion || null,
  image_url: q.image_url || null,
})
const optRows = (qid, q) => q.options.map((o, i) => ({
  question_id: qid, label: o.label, body: o.body, pair_text: o.pair_text ?? null, sort_order: i,
}))

// Simpan satu soal (baru atau ubah) lengkap dengan opsi & kunci.
export async function saveQuestion(bankId, q, id) {
  let qid = id
  if (id) {
    const { error } = await supabase.from('questions')
      .update({ ...toRow(bankId, q), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await supabase.from('question_options').delete().eq('question_id', id)
  } else {
    const { data, error } = await supabase.from('questions').insert(toRow(bankId, q)).select('id').single()
    if (error) throw error
    qid = data.id
  }
  if (q.options.length) {
    const { error } = await supabase.from('question_options').insert(optRows(qid, q))
    if (error) throw error
  }
  if (q.key !== null && q.key !== undefined) {
    const { error } = await supabase.from('question_keys').upsert({ question_id: qid, answer_key: q.key })
    if (error) throw error
  } else {
    await supabase.from('question_keys').delete().eq('question_id', qid)
  }
}

// Simpan banyak soal sekaligus (impor), per kelompok agar cepat.
export async function importQuestions(bankId, list, onProgress) {
  const CH = 50
  for (let i = 0; i < list.length; i += CH) {
    const part = list.slice(i, i + CH)
    const { data, error } = await supabase.from('questions').insert(part.map(q => toRow(bankId, q))).select('id')
    if (error) throw error
    const opts = [], keys = []
    data.forEach((row, j) => {
      opts.push(...optRows(row.id, part[j]))
      if (part[j].key !== null) keys.push({ question_id: row.id, answer_key: part[j].key })
    })
    if (opts.length) { const r = await supabase.from('question_options').insert(opts); if (r.error) throw r.error }
    if (keys.length) { const r = await supabase.from('question_keys').insert(keys); if (r.error) throw r.error }
    onProgress?.(Math.min(i + CH, list.length), list.length)
  }
}
