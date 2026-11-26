// Edge Function: reset password dengan password acak baru.
// Masukan: { user_id } (satu pengguna)  ATAU  { user_ids: [...] } (maks. 25 pengguna).
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

    // 2. Daftar target
    const body = await req.json()
    const single = typeof body.user_id === 'string'
    const ids: string[] = single ? [body.user_id] : (Array.isArray(body.user_ids) ? body.user_ids : [])
    if (!ids.length || ids.length > 25 || ids.some((i) => typeof i !== 'string'))
      return json({ error: 'Kirim 1 sampai 25 pengguna per permintaan' }, 400)

    const { data: targets } = await admin.from('profiles').select('id, role, full_name, nim_nip').in('id', ids)
    const byId = new Map((targets || []).map((t: { id: string }) => [t.id, t]))

    // Dosen: mahasiswa mana saja yang berada di kelas yang ia ampu
    let allowedStudents = new Set<string>()
    if (me.role === 'DOSEN') {
      const { data: mine } = await admin.from('class_lecturers').select('class_id').eq('lecturer_id', u.user.id)
      const cids = (mine || []).map((m: { class_id: string }) => m.class_id)
      if (cids.length) {
        const { data: links } = await admin.from('class_students').select('student_id')
          .in('class_id', cids).in('student_id', ids)
        allowedStudents = new Set((links || []).map((l: { student_id: string }) => l.student_id))
      }
    }

    const denied = (id: string): { msg: string; code: number } | null => {
      if (id === u.user.id) return { msg: 'Untuk akun Anda sendiri, gunakan tautan "Forgot your password?" di halaman login', code: 400 }
      const t = byId.get(id) as { role: string } | undefined
      if (!t) return { msg: 'Pengguna tidak ditemukan', code: 404 }
      if (me.role === 'ADMIN') {
        return ['DOSEN', 'MAHASISWA', 'PROKTOR'].includes(t.role) ? null : { msg: 'Password sesama admin tidak dapat direset dari sini', code: 403 }
      }
      if (t.role !== 'MAHASISWA') return { msg: 'Dosen hanya dapat mereset password mahasiswa', code: 403 }
      return allowedStudents.has(id) ? null : { msg: 'Mahasiswa ini tidak berada di kelas yang Anda ampu', code: 403 }
    }

    // 3. Proses
    const results: Record<string, unknown>[] = []
    let firstError: { msg: string; code: number } | null = null
    for (const id of ids) {
      const t = byId.get(id) as { full_name: string; nim_nip: string } | undefined
      const base = { user_id: id, name: t?.full_name ?? '', nim: t?.nim_nip ?? '' }
      const no = denied(id)
      if (no) { firstError ??= no; results.push({ ...base, login: '', password: '', status: 'GAGAL: ' + no.msg }); continue }
      const password = randomPassword()
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) {
        const msg = 'Gagal mengatur password: ' + error.message
        firstError ??= { msg, code: 400 }
        results.push({ ...base, login: '', password: '', status: 'GAGAL: ' + msg }); continue
      }
      const { data: au } = await admin.auth.admin.getUserById(id)
      results.push({ ...base, login: au?.user?.email ?? '', password, status: 'OK' })
    }

    if (single) {
      if (firstError) return json({ error: firstError.msg }, firstError.code)
      const { status: _s, ...ok } = results[0] as Record<string, unknown>
      return json(ok)
    }
    return json({ results })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
