// Edge Function: impor mahasiswa (membuat akun login). ADMIN: bebas. DOSEN: wajib memilih kelas yang ia ampu.
// Deploy: lihat README. Kunci service_role tersedia otomatis di lingkungan fungsi ini.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomPassword(len = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}
const INTERNAL_DOMAIN = 'mhs.cbt.local'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1. Pastikan pemanggil adalah ADMIN
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return json({ error: 'Tidak terautentikasi' }, 401)
    const { data: prof } = await admin.from('profiles').select('role, is_active').eq('id', u.user.id).single()
    if (!prof || !['ADMIN', 'DOSEN'].includes(prof.role) || !prof.is_active)
      return json({ error: 'Hanya admin atau dosen yang boleh mengimpor' }, 403)

    // 2. Validasi masukan
    const { rows, class_id } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 50)
      return json({ error: 'Kirim 1–50 baris per permintaan' }, 400)

    // Dosen: kelas wajib dipilih dan harus kelas yang ia ampu
    if (prof.role === 'DOSEN') {
      if (!class_id) return json({ error: 'Pilih kelas tujuan terlebih dahulu' }, 400)
      const { data: asg } = await admin.from('class_lecturers').select('class_id')
        .eq('class_id', class_id).eq('lecturer_id', u.user.id).maybeSingle()
      if (!asg) return json({ error: 'Anda bukan pengampu kelas ini' }, 403)
    }

    const results = []
    for (const r of rows) {
      const nim = String(r.nim ?? '').trim()
      const nama = String(r.nama ?? '').trim()
      const email = (String(r.email ?? '').trim().toLowerCase()) ||
        `${nim.toLowerCase().replace(/[^a-z0-9]/g, '')}@${INTERNAL_DOMAIN}`
      const row = { nim, nama, login: String(r.email ?? '').trim() ? email : nim, password: '', status: '', student_id: '' }
      if (!nim || !nama) { row.status = 'GAGAL: NIM/Nama kosong'; results.push(row); continue }

      const password = randomPassword()
      let studentId: string | null = null
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: nama, nim_nip: nim },
      })
      if (error) {
        // Sudah terdaftar? cari berdasarkan NIM untuk tetap memasukkannya ke kelas.
        const { data: ex } = await admin.from('profiles').select('id').eq('nim_nip', nim).eq('role', 'MAHASISWA').maybeSingle()
        if (ex) { studentId = ex.id; row.status = 'SUDAH_ADA' }
        else row.status = 'GAGAL: ' + error.message
      } else {
        studentId = created.user.id
        row.password = password
        row.status = 'DIBUAT'
      }
      if (studentId && class_id) {
        const { error: e2 } = await admin.from('class_students')
          .upsert({ class_id, student_id: studentId }, { onConflict: 'class_id,student_id' })
        if (e2) row.status += ' (gagal masuk kelas: ' + e2.message + ')'
      }
      row.student_id = studentId ?? ''
      results.push(row)
    }
    return json({ results })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})
