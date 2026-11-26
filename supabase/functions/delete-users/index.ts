// Edge Function: admin menghapus akun DOSEN/MAHASISWA secara permanen (maks. 25 per permintaan).
// PENGAMAN: akun yang sudah punya riwayat ujian (mahasiswa) atau memiliki bank soal/ujian (dosen)
// DILEWATI agar nilai dan data tidak hilang; gunakan "Nonaktifkan" untuk akun tersebut.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return json({ error: 'Tidak terautentikasi' }, 401)
    const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', u.user.id).single()
    if (me?.role !== 'ADMIN' || !me.is_active) return json({ error: 'Hanya admin yang boleh menghapus akun' }, 403)

    const { user_ids } = await req.json()
    if (!Array.isArray(user_ids) || !user_ids.length || user_ids.length > 25 || user_ids.some((i: unknown) => typeof i !== 'string'))
      return json({ error: 'Kirim 1 sampai 25 pengguna per permintaan' }, 400)
    const ids = user_ids as string[]

    const { data: targets } = await admin.from('profiles').select('id, role, full_name, nim_nip').in('id', ids)
    const byId = new Map((targets || []).map((t: { id: string }) => [t.id, t]))

    // Data yang akan hilang bila dihapus -> diblokir
    const pick = async (table: string, col: string) => {
      const { data } = await admin.from(table).select(col).in(col, ids)
      return new Set((data || []).map((r: Record<string, string>) => r[col]))
    }
    const hasAttempts = await pick('exam_participants', 'student_id')
    const ownsExams = await pick('exams', 'creator_id')
    const ownsBanks = await pick('question_banks', 'owner_id')

    const results: Record<string, unknown>[] = []
    for (const id of ids) {
      const t = byId.get(id) as { role: string; full_name: string; nim_nip: string } | undefined
      const base = { user_id: id, name: t?.full_name ?? '', nim: t?.nim_nip ?? '' }
      let skip = ''
      if (id === u.user.id) skip = 'akun Anda sendiri'
      else if (!t) skip = 'tidak ditemukan'
      else if (!['DOSEN', 'MAHASISWA'].includes(t.role)) skip = 'hanya dosen/mahasiswa yang dapat dihapus'
      else if (hasAttempts.has(id)) skip = 'sudah punya riwayat ujian (nonaktifkan saja)'
      else if (ownsExams.has(id) || ownsBanks.has(id)) skip = 'memiliki ujian/bank soal (nonaktifkan saja)'
      if (skip) { results.push({ ...base, status: 'DILEWATI: ' + skip }); continue }
      const { error } = await admin.auth.admin.deleteUser(id)
      results.push({ ...base, status: error ? 'GAGAL: ' + error.message : 'DIHAPUS' })
    }
    return json({ results })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
