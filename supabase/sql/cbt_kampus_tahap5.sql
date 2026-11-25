-- =====================================================================
-- CBT KAMPUS - Tahap 5: penilaian esai, analisis butir soal, gambar soal
-- Jalankan SETELAH cbt_kampus_schema.sql dan cbt_kampus_tahap4.sql.
-- Aman dijalankan ulang.
-- =====================================================================

-- ---------- Peran penilai (admin & dosen; proktor tidak boleh menilai) ----------
create or replace function public.is_grader() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() in ('ADMIN', 'DOSEN'), false)
$$;

-- ---------- Hitung ulang nilai akhir satu peserta (internal) ----------
create or replace function public.recompute_result(p_participant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tot numeric; mx numeric; fin numeric; kkm numeric;
begin
  select coalesce(sum(score), 0), coalesce(sum(max_score), 0)
    into tot, mx from answers where participant_id = p_participant;
  select e.passing_grade into kkm
    from results r join exams e on e.id = r.exam_id where r.participant_id = p_participant;
  if not found then return; end if;
  fin := case when mx > 0 then round(tot / mx * 100, 2) else 0 end;
  update results
     set total_score = round(tot, 2), total_max = mx, final_grade = fin,
         letter_grade = public.letter_of(fin), is_passed = fin >= kkm, graded_at = now()
   where participant_id = p_participant;
end $$;
revoke execute on function public.recompute_result(uuid) from public, anon, authenticated;

-- ---------- Penilaian esai ----------
create or replace function public.essay_queue(p_exam uuid)
returns table (participant_id uuid, question_id uuid, nim text, full_name text, question_body text,
               max_score numeric, answer_text text, score numeric, needs_manual boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  return query
  select a.participant_id, a.question_id, pr.nim_nip, pr.full_name, qu.body, a.max_score,
         a.answer #>> '{}', a.score, a.needs_manual
  from answers a
  join exam_participants p on p.id = a.participant_id
  join profiles pr on pr.id = p.student_id
  join questions qu on qu.id = a.question_id
  where p.exam_id = p_exam and p.status in ('SELESAI', 'WAKTU_HABIS') and qu.qtype = 'ESAI'
    and a.answer is not null and a.answer <> 'null'::jsonb and a.answer <> '""'::jsonb
  order by qu.body, pr.full_name;
end $$;

create or replace function public.staff_set_score(p_participant uuid, p_question uuid, p_score numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_grader() then raise exception 'Akses ditolak'; end if;
  if p_score is null or p_score < 0 then raise exception 'Skor tidak valid'; end if;
  if not exists (select 1 from questions where id = p_question and qtype = 'ESAI') then
    raise exception 'Hanya soal esai yang dinilai manual';
  end if;
  update answers
     set score = least(p_score, coalesce(max_score, p_score)), needs_manual = false
   where participant_id = p_participant and question_id = p_question;
  if not found then raise exception 'Jawaban tidak ditemukan'; end if;
  perform public.recompute_result(p_participant);
end $$;

-- ---------- Hasil ujian + jumlah esai belum dinilai (ganti versi tahap 4) ----------
drop function if exists public.exam_results(uuid);
create or replace function public.exam_results(p_exam uuid)
returns table (participant_id uuid, nim text, full_name text, final_grade numeric, letter_grade text,
               total_score numeric, total_max numeric, correct_count int, wrong_count int, blank_count int,
               is_passed boolean, status part_status, violation_count smallint, submitted_at timestamptz,
               pending_essays int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Akses ditolak'; end if;
  return query
  select p.id, pr.nim_nip, pr.full_name, r.final_grade, r.letter_grade, r.total_score, r.total_max,
         r.correct_count, r.wrong_count, r.blank_count, r.is_passed, p.status, p.violation_count, p.submitted_at,
         (select count(*)::int from answers a where a.participant_id = p.id and a.needs_manual)
  from exam_participants p join profiles pr on pr.id = p.student_id
  left join results r on r.participant_id = p.id
  where p.exam_id = p_exam order by pr.full_name, p.attempt_no;
end $$;

-- ---------- Analisis butir soal ----------
-- P  = rata-rata skor relatif soal (0..1).  D = P kelompok atas (27%) - P kelompok bawah (27%).
-- Kategori P: >0,70 Mudah; 0,30-0,70 Sedang; <0,30 Sulit.
-- Kategori D (Ebel): >=0,40 Sangat baik; 0,30-0,39 Baik; 0,20-0,29 Cukup; 0-0,19 Buruk; <0 Sangat buruk.
-- Dihitung dari peserta yang sudah selesai. D dihitung bila peserta >= 6.
create or replace function public.compute_item_analysis(p_exam uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int; k int; upper_ids uuid[]; lower_ids uuid[]; q record;
  p_all numeric; p_up numeric; p_lo numeric; d numeric; tot int; blanks int;
  dist jsonb; has_zero boolean; dl text; pl text; rec text; cnt int := 0;
begin
  if not public.is_staff() then raise exception 'Akses ditolak'; end if;

  select count(*) into n from results rs join exam_participants pp on pp.id = rs.participant_id
   where rs.exam_id = p_exam and pp.status in ('SELESAI', 'WAKTU_HABIS');
  if n = 0 then return 0; end if;
  k := greatest(1, round(n * 0.27)::int);
  upper_ids := array(select rs.participant_id from results rs join exam_participants pp on pp.id = rs.participant_id
                      where rs.exam_id = p_exam and pp.status in ('SELESAI', 'WAKTU_HABIS')
                      order by rs.total_score desc, rs.participant_id limit k);
  lower_ids := array(select rs.participant_id from results rs join exam_participants pp on pp.id = rs.participant_id
                      where rs.exam_id = p_exam and pp.status in ('SELESAI', 'WAKTU_HABIS')
                      order by rs.total_score asc, rs.participant_id limit k);

  for q in
    select eq.question_id as qid, qu.qtype
    from exam_questions eq join questions qu on qu.id = eq.question_id
    where eq.exam_id = p_exam order by eq.order_no
  loop
    select avg(a.score / nullif(a.max_score, 0)),
           avg(a.score / nullif(a.max_score, 0)) filter (where a.participant_id = any(upper_ids)),
           avg(a.score / nullif(a.max_score, 0)) filter (where a.participant_id = any(lower_ids)),
           count(*)::int,
           (count(*) filter (where a.answer is null or a.answer = 'null'::jsonb or a.answer = '""'::jsonb
                               or a.answer = '[]'::jsonb or a.answer = '{}'::jsonb))::int
      into p_all, p_up, p_lo, tot, blanks
      from answers a join exam_participants pp on pp.id = a.participant_id
     where pp.exam_id = p_exam and pp.status in ('SELESAI', 'WAKTU_HABIS')
       and a.question_id = q.qid and a.score is not null;
    if tot = 0 or p_all is null then continue; end if;

    p_all := round(p_all, 4);
    if n >= 6 and p_up is not null and p_lo is not null then d := round(p_up - p_lo, 4); else d := null; end if;

    has_zero := false; dist := null;
    if q.qtype in ('PG', 'PGK') then
      select jsonb_object_agg(o.label, jsonb_build_object('total', c.total, 'upper', c.up, 'lower', c.lo, 'is_key', ik.is_key)),
             coalesce(bool_or(not ik.is_key and c.total = 0), false)
        into dist, has_zero
        from question_options o
        cross join lateral (
          select count(*) as total,
                 count(*) filter (where a.participant_id = any(upper_ids)) as up,
                 count(*) filter (where a.participant_id = any(lower_ids)) as lo
            from answers a join exam_participants pp on pp.id = a.participant_id
           where pp.exam_id = p_exam and pp.status in ('SELESAI', 'WAKTU_HABIS') and a.question_id = q.qid
             and ((jsonb_typeof(a.answer) = 'string' and a.answer #>> '{}' = o.label)
               or (jsonb_typeof(a.answer) = 'array' and a.answer ? o.label))
        ) c
        cross join lateral (
          select coalesce((select case jsonb_typeof(kk.answer_key)
                                    when 'string' then kk.answer_key #>> '{}' = o.label
                                    else kk.answer_key ? o.label end
                             from question_keys kk where kk.question_id = q.qid), false) as is_key
        ) ik
       where o.question_id = q.qid;
    end if;
    dist := coalesce(dist, '{}'::jsonb) || jsonb_build_object('_blank', blanks);

    pl := case when p_all > 0.70 then 'Mudah' when p_all >= 0.30 then 'Sedang' else 'Sulit' end;
    dl := case when d is null then 'Data belum cukup (min. 6 peserta)'
               when d >= 0.40 then 'Sangat baik' when d >= 0.30 then 'Baik'
               when d >= 0.20 then 'Cukup' when d >= 0 then 'Buruk' else 'Sangat buruk' end;
    rec := case
      when d is not null and d < 0 then 'Periksa kunci jawaban atau kalimat soal (kemungkinan ambigu); pertimbangkan dibuang.'
      when d is not null and d < 0.20 then 'Daya beda rendah: revisi soal.'
      when p_all > 0.90 then 'Soal terlalu mudah.'
      when p_all < 0.20 then 'Soal terlalu sulit: periksa kunci atau materi.'
      when d is null then 'Data belum cukup untuk menilai daya beda.'
      else 'Soal baik, dapat dipakai ulang.' end;
    if has_zero then rec := rec || ' Ada pengecoh yang tidak dipilih siapa pun; pertimbangkan merevisinya.'; end if;

    insert into item_analysis (exam_id, question_id, total_participants, difficulty_p, difficulty_label,
                               discrimination_d, discrimination_label, option_distribution, recommendation, calculated_at)
    values (p_exam, q.qid, tot, p_all, pl, d, dl, dist, rec, now())
    on conflict (exam_id, question_id) do update
      set total_participants = excluded.total_participants, difficulty_p = excluded.difficulty_p,
          difficulty_label = excluded.difficulty_label, discrimination_d = excluded.discrimination_d,
          discrimination_label = excluded.discrimination_label, option_distribution = excluded.option_distribution,
          recommendation = excluded.recommendation, calculated_at = now();
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

-- ---------- Penyimpanan gambar soal (Supabase Storage) ----------
-- Bucket publik agar gambar tampil di layar mahasiswa; nama berkas acak (UUID).
-- Hanya SVG yang sengaja tidak diizinkan.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "grader upload question images" on storage.objects;
create policy "grader upload question images" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and public.is_grader());

drop policy if exists "grader delete question images" on storage.objects;
create policy "grader delete question images" on storage.objects for delete to authenticated
  using (bucket_id = 'question-images' and public.is_grader());
