// Edge Function: reset password pengguna dengan password acak baru.
// ADMIN : boleh mereset DOSEN, MAHASISWA, PROKTOR (bukan sesama ADMIN, bukan akun sendiri).
// DOSEN : hanya MAHASISWA yang berada di kelas yang ia ampu.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1. Identitas dan peran pemanggil
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return json({ error: 'Tidak terautentikasi' }, 401)
    const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', u.user.id).single()
    if (!me || !me.is_active || !['ADMIN', 'DOSEN'].includes(me.role))
      return json({ error: 'Hanya admin atau dosen yang boleh mereset password' }, 403)

    // 2. Target
    const { user_id } = await req.json()
    if (!user_id || typeof user_id !== 'string') return json({ error: 'user_id wajib diisi' }, 400)
    if (user_id === u.user.id) return json({ error: 'Untuk akun Anda sendiri, gunakan tautan "Forgot your password?" di halaman login' }, 400)
    const { data: target } = await admin.from('profiles').select('id, role, full_name, nim_nip').eq('id', user_id).maybeSingle()
    if (!target) return json({ error: 'Pengguna tidak ditemukan' }, 404)

    // 3. Aturan hak akses
    if (me.role === 'ADMIN') {
      if (!['DOSEN', 'MAHASISWA', 'PROKTOR'].includes(target.role))
        return json({ error: 'Password sesama admin tidak dapat direset dari sini' }, 403)
    } else {
      if (target.role !== 'MAHASISWA') return json({ error: 'Dosen hanya dapat mereset password mahasiswa' }, 403)
      const { data: mine } = await admin.from('class_lecturers').select('class_id').eq('lecturer_id', u.user.id)
      const ids = (mine || []).map((m: { class_id: string }) => m.class_id)
      let ok = false
      if (ids.length) {
        const { data: link } = await admin.from('class_students').select('class_id')
          .eq('student_id', user_id).in('class_id', ids).limit(1)
        ok = !!link?.length
      }
      if (!ok) return json({ error: 'Mahasiswa ini tidak berada di kelas yang Anda ampu' }, 403)
    }

    // 4. Atur password baru
    const password = randomPassword()
    const { error } = await admin.auth.admin.updateUserById(user_id, { password })
    if (error) return json({ error: 'Gagal mengatur password: ' + error.message }, 400)
    const { data: au } = await admin.auth.admin.getUserById(user_id)
    return json({ password, name: target.full_name, nim: target.nim_nip, login: au?.user?.email ?? '' })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
