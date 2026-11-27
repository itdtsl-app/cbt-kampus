import { supabase } from './supabase'
import { groupSchedule, fmtRange } from './cardsUtil.js'
import { downloadExcel } from './importers.js'

// entries: [{ student_id, name, nim, login, password }] -> { list: [... + exams], note }
export async function buildCards(entries) {
  const ids = entries.map(e => e.student_id).filter(Boolean)
  let sched = {}, note = ''
  if (ids.length) {
    const { data, error } = await supabase.rpc('student_exam_schedule', { p_students: ids })
    if (error) note = `Jadwal ujian tidak dapat dimuat (${error.message}). Pastikan skrip SQL kartu peserta sudah dijalankan.`
    else sched = groupSchedule(data)
  }
  return { list: entries.map(e => ({ ...e, exams: sched[e.student_id] || [] })), note }
}

// Ekspor kartu peserta ke Excel (nama, NIM, username, password, jadwal ujian)
export function exportCardsExcel(list, filename = 'kartu_peserta.xlsx') {
  return downloadExcel(list.map((c, i) => ({
    No: i + 1, NIM: c.nim, Nama: c.name, Username: c.login, Password: c.password,
    'Jadwal ujian': c.exams.length
      ? c.exams.map(x => `${x.title} (${x.course}) - ${fmtRange(x.start_at, x.end_at)}, ${x.duration_minutes} menit`).join(' | ')
      : '-',
  })), filename, 'Kartu Peserta')
}
