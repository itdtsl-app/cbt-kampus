// Edge Function: admin membuat akun DOSEN (atau PROKTOR) dengan password acak.
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

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return json({ error: 'Tidak terautentikasi' }, 401)
    const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', u.user.id).single()
    if (me?.role !== 'ADMIN' || !me.is_active) return json({ error: 'Hanya admin yang boleh menambah akun' }, 403)

    const body = await req.json()
    const full_name = String(body.full_name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const nim_nip = String(body.nim_nip ?? '').trim()
    const role = body.role === 'PROKTOR' ? 'PROKTOR' : 'DOSEN'
    if (!full_name) return json({ error: 'Nama wajib diisi' }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Format email tidak valid' }, 400)

    if (nim_nip) {
      const { data: dup } = await admin.from('profiles').select('full_name').eq('nim_nip', nim_nip).maybeSingle()
      if (dup) return json({ error: `NIP/NIDN ${nim_nip} sudah dipakai oleh ${dup.full_name}` }, 409)
    }

    const password = randomPassword()
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, nim_nip: nim_nip || null },
    })
    if (error) {
      const dupMail = /already|registered|exists/i.test(error.message)
      return json({ error: dupMail ? `Email ${email} sudah terdaftar` : error.message }, dupMail ? 409 : 400)
    }

    // Pemicu database membuat profil bersistem MAHASISWA; naikkan ke peran yang diminta.
    const { error: e2 } = await admin.from('profiles').update({ role }).eq('id', created.user.id)
    if (e2) {
      await admin.auth.admin.deleteUser(created.user.id) // batalkan agar tidak ada akun setengah jadi
      return json({ error: 'Gagal menetapkan peran: ' + e2.message }, 500)
    }
    return json({ user_id: created.user.id, name: full_name, nim: nim_nip, login: email, password, role })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
