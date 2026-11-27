-- =====================================================================
-- CBT KAMPUS - Perbaikan penilaian esai: daftar lebih lengkap + diagnosis
-- Jalankan SETELAH cbt_kampus_tahap5.sql. Aman dijalankan ulang.
-- =====================================================================

-- Daftar esai: dibangun dari soal esai di tiap peserta yang sudah selesai (bukan hanya baris jawaban),
-- sehingga soal esai yang tidak dijawab pun tetap terlihat. Hanya peserta SELESAI / WAKTU_HABIS yang masuk.
drop function if exists public.essay_queue(uuid);
create or replace function public.essay_queue(p_exam uuid)
returns table (participant_id uuid, question_id uuid, nim text, full_name text, question_body text,
               max_score numeric, answer_text text, score numeric, needs_manual boolean, is_blank boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  return query
  select p.id, qu.id, pr.nim_nip, pr.full_name, qu.body,
         coalesce(a.max_score, qu.weight),
         case when a.answer is null or a.answer = 'null'::jsonb or trim(coalesce(a.answer #>> '{}', '')) = ''
              then null else a.answer #>> '{}' end,
         a.score,
         coalesce(a.needs_manual, false),
         (a.answer is null or a.answer = 'null'::jsonb or trim(coalesce(a.answer #>> '{}', '')) = '')
  from exam_participants p
  join profiles pr on pr.id = p.student_id
  cross join lateral jsonb_array_elements_text(p.question_order) as t(qid)
  join questions qu on qu.id = t.qid::uuid and qu.qtype = 'ESAI'
  left join answers a on a.participant_id = p.id and a.question_id = qu.id
  where p.exam_id = p_exam and p.status in ('SELESAI', 'WAKTU_HABIS')
  order by qu.body, pr.full_name;
end $$;

-- Diagnosis: menjelaskan mengapa daftar esai kosong.
create or replace function public.essay_diagnostics(p_exam uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  select jsonb_build_object(
    'total_questions', (select count(*) from exam_questions eq where eq.exam_id = p_exam),
    'essay_questions', (select count(*) from exam_questions eq join questions qu on qu.id = eq.question_id
                         where eq.exam_id = p_exam and qu.qtype = 'ESAI'),
    'participants', coalesce((select jsonb_object_agg(s.st, s.n)
                               from (select p.status::text as st, count(*) as n
                                       from exam_participants p where p.exam_id = p_exam group by p.status) s), '{}'::jsonb),
    'essay_filled', (select count(*) from answers a
                       join exam_participants p on p.id = a.participant_id
                       join questions qu on qu.id = a.question_id
                      where p.exam_id = p_exam and qu.qtype = 'ESAI'
                        and a.answer is not null and a.answer <> 'null'::jsonb and trim(coalesce(a.answer #>> '{}', '')) <> ''),
    'essay_filled_unfinished', (select count(*) from answers a
                       join exam_participants p on p.id = a.participant_id
                       join questions qu on qu.id = a.question_id
                      where p.exam_id = p_exam and qu.qtype = 'ESAI' and p.status not in ('SELESAI', 'WAKTU_HABIS')
                        and a.answer is not null and a.answer <> 'null'::jsonb and trim(coalesce(a.answer #>> '{}', '')) <> '')
  ) into r;
  return r;
end $$;
