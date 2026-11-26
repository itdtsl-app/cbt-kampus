import { supabase } from './supabase'
import { groupSchedule } from './cardsUtil.js'

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
