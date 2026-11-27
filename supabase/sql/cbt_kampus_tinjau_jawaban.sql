-- =====================================================================
-- CBT KAMPUS - Tinjau & nilai jawaban Esai dan Isian
-- Jalankan SETELAH cbt_kampus_perbaikan_esai.sql. Aman dijalankan ulang.
-- Hanya ADMIN dan DOSEN (penilai). Hanya peserta yang sudah selesai.
-- =====================================================================

-- Daftar jawaban satu tipe soal (ESAI atau ISIAN) beserta kunci (untuk isian).
create or replace function public.answer_review(p_exam uuid, p_qtype question_type)
returns table (participant_id uuid, question_id uuid, nim text, full_name text, question_body text,
               max_score numeric, answer_text text, score numeric, needs_manual boolean, is_blank boolean,
               answer_key jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  return query
  select p.id, qu.id, pr.nim_nip, pr.full_name, qu.body,
         coalesce(a.max_score, qu.weight),
         case when bl.blank then null else a.answer #>> '{}' end,
         a.score, coalesce(a.needs_manual, false), bl.blank, k.answer_key
  from exam_participants p
  join profiles pr on pr.id = p.student_id
  cross join lateral jsonb_array_elements_text(p.question_order) as t(qid)
  join questions qu on qu.id = t.qid::uuid and qu.qtype = p_qtype
  left join answers a on a.participant_id = p.id and a.question_id = qu.id
  left join question_keys k on k.question_id = qu.id
  cross join lateral (select (a.answer is null or a.answer = 'null'::jsonb
                              or trim(coalesce(a.answer #>> '{}', '')) = '') as blank) bl
  where p.exam_id = p_exam and p.status in ('SELESAI', 'WAKTU_HABIS')
  order by qu.body, pr.full_name;
end $$;

-- Hitung ulang nilai akhir + jumlah benar/salah/kosong dari tabel jawaban.
create or replace function public.recompute_result(p_participant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tot numeric; mx numeric; fin numeric; kkm numeric; cc int; wc int; bc int;
begin
  select coalesce(sum(score), 0), coalesce(sum(max_score), 0),
         count(*) filter (where is_correct is true),
         count(*) filter (where is_correct is false and not (answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb or answer = '{}'::jsonb)),
         count(*) filter (where answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb or answer = '{}'::jsonb)
    into tot, mx, cc, wc, bc from answers where participant_id = p_participant;
  select e.passing_grade into kkm
    from results r join exams e on e.id = r.exam_id where r.participant_id = p_participant;
  if not found then return; end if;
  fin := case when mx > 0 then round(tot / mx * 100, 2) else 0 end;
  update results
     set total_score = round(tot, 2), total_max = mx, final_grade = fin, letter_grade = public.letter_of(fin),
         is_passed = fin >= kkm, correct_count = cc, wrong_count = wc, blank_count = bc, graded_at = now()
   where participant_id = p_participant;
end $$;
revoke execute on function public.recompute_result(uuid) from public, anon, authenticated;

-- Beri skor manual pada satu jawaban (esai maupun isian/tipe lain) milik peserta yang sudah selesai.
create or replace function public.staff_set_score(p_participant uuid, p_question uuid, p_score numeric)
returns void language plpgsql security definer set search_path = public as $$
declare t question_type;
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  if p_score is null or p_score < 0 then raise exception 'Skor tidak valid'; end if;
  if not exists (select 1 from exam_participants where id = p_participant and status in ('SELESAI', 'WAKTU_HABIS')) then
    raise exception 'Peserta belum selesai mengerjakan';
  end if;
  select qtype into t from questions where id = p_question;
  update answers
     set score = least(p_score, coalesce(max_score, p_score)),
         needs_manual = false,
         is_correct = case when t = 'ESAI' then null
                           else least(p_score, coalesce(max_score, p_score)) >= coalesce(max_score, p_score) end
   where participant_id = p_participant and question_id = p_question;
  if not found then raise exception 'Jawaban tidak ditemukan'; end if;
  perform public.recompute_result(p_participant);
end $$;

-- Terima/tolak SEMUA jawaban yang sama persis (huruf besar-kecil & spasi berlebih diabaikan) pada satu soal.
-- p_correct = true -> skor penuh; false -> skor 0.
create or replace function public.staff_bulk_set_score(p_exam uuid, p_question uuid, p_answer text, p_correct boolean)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  for r in
    select a.participant_id, a.max_score
      from answers a join exam_participants p on p.id = a.participant_id
     where p.exam_id = p_exam and p.status in ('SELESAI', 'WAKTU_HABIS') and a.question_id = p_question
       and a.answer is not null
       and lower(regexp_replace(trim(a.answer #>> '{}'), '\s+', ' ', 'g'))
         = lower(regexp_replace(trim(p_answer), '\s+', ' ', 'g'))
  loop
    update answers
       set score = case when p_correct then coalesce(r.max_score, 0) else 0 end,
           is_correct = p_correct, needs_manual = false
     where participant_id = r.participant_id and question_id = p_question;
    perform public.recompute_result(r.participant_id);
    n := n + 1;
  end loop;
  return n;
end $$;
