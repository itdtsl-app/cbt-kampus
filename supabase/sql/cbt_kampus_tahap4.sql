-- =====================================================================
-- CBT KAMPUS - Tahap 4: pelaksanaan ujian, penilaian server, pemantauan
-- Jalankan SETELAH cbt_kampus_schema.sql, di Supabase > SQL Editor.
-- Aman dijalankan ulang (memakai create or replace).
--
-- Prinsip: mahasiswa TIDAK membaca tabel soal/kunci/ujian secara langsung.
-- Semua akses lewat fungsi di bawah yang memeriksa identitas, jadwal,
-- token, batas percobaan, sesi tunggal, dan waktu dari jam SERVER.
-- =====================================================================

alter table exam_participants add column if not exists last_seen timestamptz;

-- ---------- Utilitas ----------
create or replace function public.letter_of(g numeric) returns text
language sql immutable as $$
  select case
    when g >= 85 then 'A'  when g >= 80 then 'A-' when g >= 75 then 'B+'
    when g >= 70 then 'B'  when g >= 65 then 'B-' when g >= 60 then 'C+'
    when g >= 55 then 'C'  when g >= 40 then 'D'  else 'E' end
$$;

create or replace function public.student_in_exam(p_exam uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exam_classes ec
    join class_students cs on cs.class_id = ec.class_id
    where ec.exam_id = p_exam and cs.student_id = auth.uid())
$$;

-- ---------- Penilaian satu jawaban ----------
-- Kunci: PG "B" | PGK ["A","C"] | BENAR_SALAH "BENAR" | MENJODOHKAN {"1":"Jakarta"} | ISIAN ["56"]
create or replace function public.grade_answer(
  p_type question_type, p_mode text, p_weight numeric, p_key jsonb, p_ans jsonb)
returns table (score numeric, is_correct boolean, needs_manual boolean, is_blank boolean)
language plpgsql as $$
declare
  blank boolean; ok boolean; sc numeric;
  ka text[]; aa text[]; good int; bad int; total int;
begin
  blank := p_ans is null
        or p_ans = 'null'::jsonb or p_ans = '[]'::jsonb or p_ans = '{}'::jsonb
        or (jsonb_typeof(p_ans) = 'string' and trim(p_ans #>> '{}') = '');
  if blank then
    return query select 0::numeric, false, false, true; return;
  end if;

  if p_type = 'ESAI' then
    return query select null::numeric, null::boolean, true, false; return;
  end if;

  if p_type in ('PG', 'BENAR_SALAH') then
    ok := upper(trim(p_ans #>> '{}')) = upper(trim(p_key #>> '{}'));
    return query select case when ok then p_weight else 0::numeric end, ok, false, false; return;
  end if;

  if p_type = 'PGK' then
    ka := array(select upper(trim(x)) from jsonb_array_elements_text(p_key) x);
    aa := array(select distinct upper(trim(x)) from jsonb_array_elements_text(p_ans) x);
    good := (select count(*) from unnest(aa) u where u = any(ka));
    bad := cardinality(aa) - good;
    ok := (good = cardinality(ka) and bad = 0);
    if p_mode = 'FULL' then sc := case when ok then p_weight else 0 end;
    else sc := p_weight * greatest(0, good - bad)::numeric / greatest(cardinality(ka), 1);
    end if;
    return query select sc, ok, false, false; return;
  end if;

  if p_type = 'MENJODOHKAN' then
    total := (select count(*) from jsonb_object_keys(p_key));
    good := (select count(*) from jsonb_each_text(p_key) k
             where lower(trim(coalesce(p_ans ->> k.key, ''))) = lower(trim(k.value)));
    ok := (good = total);
    if p_mode = 'FULL' then sc := case when ok then p_weight else 0 end;
    else sc := p_weight * good::numeric / greatest(total, 1);
    end if;
    return query select sc, ok, false, false; return;
  end if;

  if p_type = 'ISIAN' then
    ok := exists (
      select 1 from jsonb_array_elements_text(p_key) k
      where lower(regexp_replace(trim(k), '\s+', ' ', 'g'))
          = lower(regexp_replace(trim(p_ans #>> '{}'), '\s+', ' ', 'g')));
    return query select case when ok then p_weight else 0::numeric end, ok, false, false; return;
  end if;

  return query select 0::numeric, false, false, false;
end $$;

-- ---------- Penilaian satu peserta (internal) ----------
create or replace function public.grade_participant(p_participant uuid, p_status part_status)
returns void language plpgsql security definer set search_path = public as $$
declare
  v exam_participants; e exams; r record; g record;
  tot numeric := 0; mx numeric := 0; cc int := 0; wc int := 0; bc int := 0; fin numeric;
begin
  select * into v from exam_participants where id = p_participant for update;
  if not found then return; end if;
  if v.status in ('SELESAI', 'WAKTU_HABIS') then return; end if;
  select * into e from exams where id = v.exam_id;

  for r in
    select qu.id as qid, qu.qtype, qu.scoring_mode, qu.weight, k.answer_key, a.answer
    from jsonb_array_elements_text(v.question_order) as t(qid)
    join questions qu on qu.id = t.qid::uuid
    left join question_keys k on k.question_id = qu.id
    left join answers a on a.participant_id = v.id and a.question_id = qu.id
  loop
    select * into g from public.grade_answer(r.qtype, r.scoring_mode, r.weight, r.answer_key, r.answer);
    insert into answers (participant_id, question_id, score, max_score, is_correct, needs_manual, updated_at)
    values (v.id, r.qid, g.score, r.weight, g.is_correct, g.needs_manual, now())
    on conflict (participant_id, question_id) do update
      set score = excluded.score, max_score = excluded.max_score,
          is_correct = excluded.is_correct, needs_manual = excluded.needs_manual;
    mx := mx + r.weight;
    tot := tot + coalesce(g.score, 0);
    if g.is_blank then bc := bc + 1;
    elsif g.needs_manual then null;
    elsif g.is_correct then cc := cc + 1;
    else wc := wc + 1;
    end if;
  end loop;

  fin := case when mx > 0 then round(tot / mx * 100, 2) else 0 end;
  update exam_participants
     set status = p_status, submitted_at = now(), active_session = null
   where id = v.id;
  insert into results (participant_id, exam_id, student_id, total_score, total_max, final_grade,
                       letter_grade, correct_count, wrong_count, blank_count, is_passed)
  values (v.id, v.exam_id, v.student_id, round(tot, 2), mx, fin, public.letter_of(fin),
          cc, wc, bc, fin >= e.passing_grade)
  on conflict (participant_id) do update
    set total_score = excluded.total_score, total_max = excluded.total_max,
        final_grade = excluded.final_grade, letter_grade = excluded.letter_grade,
        correct_count = excluded.correct_count, wrong_count = excluded.wrong_count,
        blank_count = excluded.blank_count, is_passed = excluded.is_passed, graded_at = now();
end $$;

-- Fungsi internal tidak boleh dipanggil langsung dari browser
revoke execute on function public.grade_participant(uuid, part_status) from public, anon, authenticated;
revoke execute on function public.grade_answer(question_type, text, numeric, jsonb, jsonb) from public, anon, authenticated;

-- ---------- Muatan ujian untuk mahasiswa (TANPA kunci) ----------
create or replace function public.build_exam_payload(p_participant uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v exam_participants; e exams; qs jsonb; ans jsonb;
begin
  select * into v from exam_participants where id = p_participant;
  select * into e from exams where id = v.exam_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', qu.id, 'qtype', qu.qtype, 'body', qu.body, 'image_url', qu.image_url, 'weight', qu.weight,
      'options', case
        when qu.qtype in ('PG', 'PGK') then (
          select coalesce(jsonb_agg(jsonb_build_object('label', o.label, 'body', o.body, 'image_url', o.image_url)
                 order by coalesce(array_position(ord.arr, o.label), 999), o.sort_order), '[]'::jsonb)
          from question_options o where o.question_id = qu.id)
        when qu.qtype = 'MENJODOHKAN' then (
          select coalesce(jsonb_agg(jsonb_build_object('label', o.label, 'body', o.body)
                 order by o.sort_order), '[]'::jsonb)
          from question_options o where o.question_id = qu.id)
        else '[]'::jsonb end,
      'rights', case when qu.qtype = 'MENJODOHKAN' then (
          select coalesce(jsonb_agg(o.pair_text
                 order by coalesce(array_position(ord.arr, o.label), 999), o.sort_order), '[]'::jsonb)
          from question_options o where o.question_id = qu.id)
        else '[]'::jsonb end
    ) order by t.n), '[]'::jsonb)
  into qs
  from jsonb_array_elements_text(v.question_order) with ordinality as t(qid, n)
  join questions qu on qu.id = t.qid::uuid
  cross join lateral (
    select coalesce(array(select jsonb_array_elements_text(v.option_order -> t.qid)), array[]::text[]) as arr
  ) ord;

  select coalesce(jsonb_object_agg(a.question_id::text,
           jsonb_build_object('answer', a.answer, 'doubt', a.is_doubtful)), '{}'::jsonb)
  into ans from answers a where a.participant_id = v.id;

  return jsonb_build_object(
    'participant', jsonb_build_object('id', v.id, 'deadline_at', v.deadline_at, 'server_now', now(),
                                      'violation_count', v.violation_count),
    'settings', jsonb_build_object('title', e.title, 'require_fullscreen', e.require_fullscreen,
                                   'block_copy_paste', e.block_copy_paste, 'max_violations', e.max_violations,
                                   'show_score', e.show_score),
    'questions', qs, 'answers', ans);
end $$;
revoke execute on function public.build_exam_payload(uuid) from public, anon, authenticated;

-- ---------- Daftar ujian milik mahasiswa ----------
create or replace function public.list_my_exams()
returns table (exam_id uuid, title text, course_name text, kind exam_kind, start_at timestamptz,
               end_at timestamptz, duration_minutes int, question_total int, has_token boolean,
               require_fullscreen boolean, max_attempts smallint, attempts_used int,
               in_progress boolean, last_grade numeric, last_passed boolean, show_score boolean,
               server_now timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, c.name, e.kind, e.start_at, e.end_at, e.duration_minutes,
         (select count(*)::int from exam_questions eq where eq.exam_id = e.id),
         coalesce(e.access_token <> '', false), e.require_fullscreen, e.max_attempts,
         (select count(*)::int from exam_participants p where p.exam_id = e.id and p.student_id = auth.uid()),
         exists (select 1 from exam_participants p where p.exam_id = e.id and p.student_id = auth.uid()
                 and p.status = 'BERLANGSUNG'),
         case when e.show_score then (select r.final_grade from results r
              where r.exam_id = e.id and r.student_id = auth.uid() order by r.graded_at desc limit 1) end,
         case when e.show_score then (select r.is_passed from results r
              where r.exam_id = e.id and r.student_id = auth.uid() order by r.graded_at desc limit 1) end,
         e.show_score, now()
  from exams e join courses c on c.id = e.course_id
  where e.status = 'AKTIF' and public.student_in_exam(e.id)
  order by e.start_at desc
$$;

-- ---------- Mulai / lanjutkan ujian ----------
create or replace function public.start_exam(p_exam uuid, p_token text, p_session text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e exams; p exam_participants; n int; qids uuid[]; q record; opt jsonb := '{}'::jsonb; labels jsonb;
begin
  if public.current_role() is distinct from 'MAHASISWA' then raise exception 'Hanya mahasiswa yang dapat mengerjakan ujian'; end if;
  select * into e from exams where id = p_exam;
  if not found or e.status <> 'AKTIF' then raise exception 'Ujian tidak tersedia'; end if;
  if not public.student_in_exam(p_exam) then raise exception 'Anda tidak terdaftar pada ujian ini'; end if;

  select * into p from exam_participants
   where exam_id = p_exam and student_id = auth.uid() and status = 'BERLANGSUNG'
   order by attempt_no desc limit 1;

  if found then
    if now() > p.deadline_at then
      -- jangan raise di sini: raise akan membatalkan penilaian di atas
      perform public.grade_participant(p.id, 'WAKTU_HABIS');
      return jsonb_build_object('expired', true, 'participant_id', p.id);
    end if;
    if p.active_session is not null and p.active_session <> p_session
       and p.last_seen > now() - interval '45 seconds' then
      raise exception 'Ujian sedang terbuka di perangkat/tab lain. Tutup dulu, lalu coba lagi 1 menit kemudian.';
    end if;
    update exam_participants set active_session = p_session, last_seen = now() where id = p.id;
    return public.build_exam_payload(p.id);
  end if;

  if now() < e.start_at then raise exception 'Ujian belum dimulai'; end if;
  if now() > e.end_at then raise exception 'Waktu ujian sudah ditutup'; end if;
  if coalesce(e.access_token, '') <> '' and upper(trim(coalesce(p_token, ''))) <> upper(e.access_token) then
    raise exception 'Token ujian salah';
  end if;
  select count(*) into n from exam_participants where exam_id = p_exam and student_id = auth.uid();
  if n >= e.max_attempts then raise exception 'Kesempatan mengerjakan sudah habis'; end if;

  if e.randomize_questions then
    select array_agg(question_id order by random()) into qids from exam_questions where exam_id = p_exam;
  else
    select array_agg(question_id order by order_no) into qids from exam_questions where exam_id = p_exam;
  end if;
  if qids is null then raise exception 'Ujian ini belum memiliki soal'; end if;

  -- urutan opsi per soal (PG, PGK, dan sisi kanan MENJODOHKAN)
  for q in
    select qu.id, qu.qtype from questions qu where qu.id = any(qids) and qu.qtype in ('PG', 'PGK', 'MENJODOHKAN')
  loop
    select jsonb_agg(o.label order by case when e.randomize_options then random() else o.sort_order::float8 end)
      into labels from question_options o where o.question_id = q.id;
    opt := opt || jsonb_build_object(q.id::text, coalesce(labels, '[]'::jsonb));
  end loop;

  insert into exam_participants (exam_id, student_id, attempt_no, started_at, deadline_at,
                                 active_session, last_seen, question_order, option_order)
  values (p_exam, auth.uid(), n + 1, now(),
          least(now() + make_interval(mins => e.duration_minutes), e.end_at),
          p_session, now(), to_jsonb(qids), opt)
  returning * into p;

  return public.build_exam_payload(p.id);
end $$;

-- ---------- Simpan jawaban (menggantikan versi tahap 1) ----------
drop function if exists public.save_answer(uuid, uuid, jsonb, boolean);
create or replace function public.save_answer(
  p_participant uuid, p_question uuid, p_answer jsonb, p_doubt boolean, p_session text)
returns void language plpgsql security definer set search_path = public as $$
declare v exam_participants;
begin
  select * into v from exam_participants where id = p_participant and student_id = auth.uid();
  if not found then raise exception 'Peserta tidak valid'; end if;
  if v.status <> 'BERLANGSUNG' then raise exception 'Ujian sudah berakhir'; end if;
  if v.active_session is distinct from p_session then raise exception 'Sesi tidak valid (ujian dibuka di tempat lain)'; end if;
  if now() > v.deadline_at + interval '5 seconds' then raise exception 'Waktu habis'; end if;
  if not (v.question_order ? p_question::text) then raise exception 'Soal bukan bagian dari ujian ini'; end if;
  insert into answers (participant_id, question_id, answer, is_doubtful, updated_at)
  values (p_participant, p_question, p_answer, coalesce(p_doubt, false), now())
  on conflict (participant_id, question_id)
  do update set answer = excluded.answer, is_doubtful = excluded.is_doubtful, updated_at = now();
end $$;

-- ---------- Detak jantung: sesi, waktu server, status ----------
create or replace function public.heartbeat(p_participant uuid, p_session text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v exam_participants;
begin
  select * into v from exam_participants where id = p_participant and student_id = auth.uid();
  if not found then raise exception 'Peserta tidak valid'; end if;
  if v.status = 'BERLANGSUNG' and v.active_session is not distinct from p_session then
    update exam_participants set last_seen = now() where id = v.id;
    if now() > v.deadline_at + interval '10 seconds' then
      perform public.grade_participant(v.id, 'WAKTU_HABIS');
      select * into v from exam_participants where id = p_participant;
    end if;
  end if;
  return jsonb_build_object('status', v.status, 'deadline_at', v.deadline_at, 'server_now', now(),
                            'session_ok', v.active_session is not distinct from p_session or v.status <> 'BERLANGSUNG',
                            'violation_count', v.violation_count);
end $$;

-- ---------- Kumpulkan jawaban ----------
create or replace function public.submit_exam(p_participant uuid, p_auto boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v exam_participants; e exams; r results;
begin
  select * into v from exam_participants where id = p_participant and student_id = auth.uid();
  if not found then raise exception 'Peserta tidak valid'; end if;
  if v.status = 'TERKUNCI' then raise exception 'Ujian Anda dikunci. Hubungi pengawas.'; end if;
  if v.status = 'BERLANGSUNG' then
    perform public.grade_participant(v.id,
      case when p_auto or now() > v.deadline_at then 'WAKTU_HABIS' else 'SELESAI' end::part_status);
  end if;
  select * into e from exams where id = v.exam_id;
  select * into r from results where participant_id = v.id;
  return jsonb_build_object('finished', true, 'show_score', e.show_score,
           'grade', case when e.show_score then r.final_grade end,
           'passed', case when e.show_score then r.is_passed end);
end $$;

-- ---------- Pelanggaran: perbarui agar menolak sesi lain ----------
create or replace function public.log_violation(p_participant uuid, p_kind text, p_detail text default null)
returns table (violation_count smallint, locked boolean)
language plpgsql security definer set search_path = public as $$
declare v exam_participants; mx smallint;
begin
  select * into v from exam_participants where id = p_participant and student_id = auth.uid();
  if not found or v.status <> 'BERLANGSUNG' then return; end if;
  insert into violations (participant_id, kind, detail) values (p_participant, left(p_kind, 40), left(p_detail, 200));
  select max_violations into mx from exams where id = v.exam_id;
  update exam_participants set violation_count = exam_participants.violation_count + 1
   where id = p_participant returning * into v;
  if mx > 0 and v.violation_count >= mx then
    update exam_participants set status = 'TERKUNCI' where id = p_participant;
    return query select v.violation_count, true;
  else
    return query select v.violation_count, false;
  end if;
end $$;

-- ---------- Fungsi untuk staf (dosen / admin / proktor) ----------
create or replace function public.exam_monitor(p_exam uuid)
returns table (participant_id uuid, nim text, full_name text, attempt_no smallint, status part_status,
               violation_count smallint, answered int, total int, started_at timestamptz,
               last_seen timestamptz, deadline_at timestamptz, server_now timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Akses ditolak'; end if;
  return query
  select p.id, pr.nim_nip, pr.full_name, p.attempt_no, p.status, p.violation_count,
         (select count(*)::int from answers a where a.participant_id = p.id
            and a.answer is not null and a.answer <> 'null'::jsonb and a.answer <> '""'::jsonb),
         coalesce(jsonb_array_length(p.question_order), 0),
         p.started_at, p.last_seen, p.deadline_at, now()
  from exam_participants p join profiles pr on pr.id = p.student_id
  where p.exam_id = p_exam order by pr.full_name, p.attempt_no;
end $$;

create or replace function public.exam_results(p_exam uuid)
returns table (participant_id uuid, nim text, full_name text, final_grade numeric, letter_grade text,
               total_score numeric, total_max numeric, correct_count int, wrong_count int, blank_count int,
               is_passed boolean, status part_status, violation_count smallint, submitted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Akses ditolak'; end if;
  return query
  select p.id, pr.nim_nip, pr.full_name, r.final_grade, r.letter_grade, r.total_score, r.total_max,
         r.correct_count, r.wrong_count, r.blank_count, r.is_passed, p.status, p.violation_count, p.submitted_at
  from exam_participants p join profiles pr on pr.id = p.student_id
  left join results r on r.participant_id = p.id
  where p.exam_id = p_exam order by pr.full_name, p.attempt_no;
end $$;

create or replace function public.staff_unlock(p_participant uuid, p_extra_minutes int default 5)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Akses ditolak'; end if;
  update exam_participants
     set status = 'BERLANGSUNG', violation_count = 0, active_session = null,
         deadline_at = greatest(deadline_at, now()) + make_interval(mins => greatest(p_extra_minutes, 0))
   where id = p_participant and status = 'TERKUNCI';
end $$;

create or replace function public.staff_finish(p_participant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Akses ditolak'; end if;
  perform public.grade_participant(p_participant, 'SELESAI');
end $$;

-- p_force=false: hanya yang waktunya habis/terkunci. p_force=true: semua yang belum selesai.
create or replace function public.staff_finish_all(p_exam uuid, p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.is_staff() then raise exception 'Akses ditolak'; end if;
  for r in select id from exam_participants
           where exam_id = p_exam and status in ('BERLANGSUNG', 'TERKUNCI')
             and (p_force or status = 'TERKUNCI' or now() > deadline_at)
  loop
    perform public.grade_participant(r.id, 'SELESAI'); n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Perketat akses baca langsung ----------
-- Mahasiswa tidak boleh membaca nilai/kunci lewat tabel; semua lewat fungsi di atas.
drop policy if exists res_read on results;
create policy res_read on results for select using (public.is_staff());
drop policy if exists ans_read on answers;
create policy ans_read on answers for select using (public.is_staff());
