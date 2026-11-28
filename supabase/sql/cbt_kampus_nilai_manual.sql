-- =====================================================================
-- CBT KAMPUS - Penilaian manual (esai & isian): skor angka + jejak penilai
-- Jalankan SETELAH cbt_kampus_tinjau_jawaban.sql. Aman dijalankan ulang.
-- =====================================================================

-- Jejak: siapa dan kapan sebuah jawaban dinilai manual
alter table answers add column if not exists scored_by uuid references profiles(id) on delete set null;
alter table answers add column if not exists scored_at timestamptz;

-- Daftar jawaban (menambahkan nama penilai & waktu)
drop function if exists public.answer_review(uuid, question_type);
create or replace function public.answer_review(p_exam uuid, p_qtype question_type)
returns table (participant_id uuid, question_id uuid, nim text, full_name text, question_body text,
               max_score numeric, answer_text text, score numeric, needs_manual boolean, is_blank boolean,
               answer_key jsonb, scored_by_name text, scored_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  return query
  select p.id, qu.id, pr.nim_nip, pr.full_name, qu.body,
         coalesce(a.max_score, qu.weight),
         case when bl.blank then null else a.answer #>> '{}' end,
         a.score, coalesce(a.needs_manual, false), bl.blank, k.answer_key, gr.full_name, a.scored_at
  from exam_participants p
  join profiles pr on pr.id = p.student_id
  cross join lateral jsonb_array_elements_text(p.question_order) as t(qid)
  join questions qu on qu.id = t.qid::uuid and qu.qtype = p_qtype
  left join answers a on a.participant_id = p.id and a.question_id = qu.id
  left join profiles gr on gr.id = a.scored_by
  left join question_keys k on k.question_id = qu.id
  cross join lateral (select (a.answer is null or a.answer = 'null'::jsonb
                              or trim(coalesce(a.answer #>> '{}', '')) = '') as blank) bl
  where p.exam_id = p_exam and p.status in ('SELESAI', 'WAKTU_HABIS')
  order by qu.body, pr.full_name;
end $$;

-- Skor manual untuk satu jawaban (0 sampai bobot soal; boleh desimal)
create or replace function public.staff_set_score(p_participant uuid, p_question uuid, p_score numeric)
returns void language plpgsql security definer set search_path = public as $$
declare t question_type; v numeric;
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
                           else least(p_score, coalesce(max_score, p_score)) >= coalesce(max_score, p_score) end,
         scored_by = auth.uid(), scored_at = now()
   where participant_id = p_participant and question_id = p_question;
  if not found then raise exception 'Jawaban tidak ditemukan'; end if;
  perform public.recompute_result(p_participant);
end $$;

-- Skor manual untuk SEMUA jawaban yang sama persis pada satu soal (huruf besar-kecil & spasi berlebih diabaikan)
create or replace function public.staff_bulk_score(p_exam uuid, p_question uuid, p_answer text, p_score numeric)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; v numeric;
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  if p_score is null or p_score < 0 then raise exception 'Skor tidak valid'; end if;
  for r in
    select a.participant_id, a.max_score
      from answers a join exam_participants p on p.id = a.participant_id
     where p.exam_id = p_exam and p.status in ('SELESAI', 'WAKTU_HABIS') and a.question_id = p_question
       and a.answer is not null
       and lower(regexp_replace(trim(a.answer #>> '{}'), '\s+', ' ', 'g'))
         = lower(regexp_replace(trim(p_answer), '\s+', ' ', 'g'))
  loop
    v := least(p_score, coalesce(r.max_score, p_score));
    update answers
       set score = v, is_correct = (v >= coalesce(r.max_score, p_score)), needs_manual = false,
           scored_by = auth.uid(), scored_at = now()
     where participant_id = r.participant_id and question_id = p_question;
    perform public.recompute_result(r.participant_id);
    n := n + 1;
  end loop;
  return n;
end $$;
