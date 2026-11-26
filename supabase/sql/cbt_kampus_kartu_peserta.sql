-- =====================================================================
-- CBT KAMPUS - Kartu peserta: jadwal ujian yang diikuti mahasiswa
-- Jalankan SETELAH skrip-skrip sebelumnya. Aman dijalankan ulang.
-- Admin: semua mahasiswa. Dosen: hanya melalui kelas yang ia ampu.
-- Hanya ujian berstatus AKTIF yang belum berakhir; token ujian TIDAK ikut ditampilkan.
-- =====================================================================
create or replace function public.student_exam_schedule(p_students uuid[])
returns table (student_id uuid, exam_id uuid, title text, course_name text, kind exam_kind,
               start_at timestamptz, end_at timestamptz, duration_minutes int)
language plpgsql stable security definer set search_path = public as $$
declare r user_role := public.current_role();
begin
  if r is null or r not in ('ADMIN', 'DOSEN') then raise exception 'Akses ditolak'; end if;
  return query
  select distinct cs.student_id, e.id, e.title, co.name, e.kind, e.start_at, e.end_at, e.duration_minutes
  from class_students cs
  join exam_classes ec on ec.class_id = cs.class_id
  join exams e on e.id = ec.exam_id and e.status = 'AKTIF' and e.end_at >= now()
  join courses co on co.id = e.course_id
  where cs.student_id = any(p_students)
    and (r = 'ADMIN' or exists (
          select 1 from class_lecturers cl where cl.class_id = cs.class_id and cl.lecturer_id = auth.uid()))
  order by cs.student_id, e.start_at;
end $$;
