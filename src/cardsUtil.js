// Fungsi murni untuk kartu peserta (tanpa dependensi).
export const INTERNAL = '@mhs.cbt.local'

// Akun tanpa email nyata masuk memakai NIM
export const loginLabel = (login, nim) => (!login || login.endsWith(INTERNAL) ? nim : login)

const dayFmt = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
const timeFmt = { hour: '2-digit', minute: '2-digit' }

export function fmtRange(startIso, endIso) {
  const s = new Date(startIso), e = new Date(endIso)
  const sameDay = s.toDateString() === e.toDateString()
  const t = d => d.toLocaleTimeString('id-ID', timeFmt).replace(':', '.')
  return sameDay
    ? `${s.toLocaleDateString('id-ID', dayFmt)}, ${t(s)} – ${t(e)}`
    : `${s.toLocaleDateString('id-ID', dayFmt)} ${t(s)} s/d ${e.toLocaleDateString('id-ID', dayFmt)} ${t(e)}`
}

export function groupSchedule(rows) {
  const m = {}
  for (const r of rows || []) { if (!m[r.student_id]) m[r.student_id] = []; m[r.student_id].push(r) }
  return m
}
