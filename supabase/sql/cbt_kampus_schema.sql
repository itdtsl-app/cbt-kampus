-- =====================================================================
-- CBT KAMPUS - Skema Database (Supabase / PostgreSQL)  |  Tahap 1
-- Jalankan di: Supabase Dashboard > SQL Editor
-- Catatan keamanan utama:
--   * Kunci jawaban disimpan di tabel TERPISAH (question_keys) yang tidak
--     bisa dibaca mahasiswa sama sekali.
--   * Mahasiswa menyimpan jawaban & mencatat pelanggaran HANYA lewat fungsi
--     (RPC) yang memeriksa batas waktu di server.
--   * Penilaian dilakukan di server (Edge Function / fungsi SQL, tahap 5).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- ENUM ----------
create type user_role     as enum ('ADMIN', 'DOSEN', 'MAHASISWA', 'PROKTOR');
create type question_type as enum ('PG', 'PGK', 'BENAR_SALAH', 'MENJODOHKAN', 'ISIAN', 'ESAI');
create type exam_kind     as enum ('KUIS', 'UTS', 'UAS', 'TRYOUT');
create type exam_status   as enum ('DRAFT', 'TERJADWAL', 'AKTIF', 'SELESAI');
create type part_status   as enum ('BERLANGSUNG', 'SELESAI', 'WAKTU_HABIS', 'TERKUNCI');

-- ---------- PROFIL & AKUN ----------
-- Login ditangani Supabase Auth (auth.users). Tabel ini menyimpan data tambahan.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'MAHASISWA',
  full_name   text not null,
  nim_nip     text unique,                 -- NIM (mahasiswa) / NIP-NIDN (dosen)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create function public.current_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.current_role() in ('ADMIN','DOSEN','PROKTOR'), false) $$;

-- ---------- STRUKTUR AKADEMIK ----------
create table faculties (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null
);

create table study_programs (            -- Program Studi
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references faculties(id) on delete cascade,
  code text unique not null,
  name text not null
);

create table academic_terms (            -- Tahun akademik + semester
  id uuid primary key default gen_random_uuid(),
  year_label text not null,              -- contoh: 2026/2027
  semester text not null check (semester in ('Ganjil','Genap','Pendek')),
  is_active boolean not null default false,
  unique (year_label, semester)
);

create table courses (                   -- Mata Kuliah
  id uuid primary key default gen_random_uuid(),
  program_id uuid references study_programs(id) on delete set null,
  code text unique not null,
  name text not null,
  credits smallint not null default 2
);

create table classes (                   -- Kelas / Rombel per mata kuliah
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  term_id uuid not null references academic_terms(id),
  name text not null,                    -- contoh: A, B, Reguler Pagi
  unique (course_id, term_id, name)
);

create table class_students (
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  primary key (class_id, student_id)
);

create table course_lecturers (          -- satu mata kuliah bisa banyak dosen
  course_id uuid references courses(id) on delete cascade,
  lecturer_id uuid references profiles(id) on delete cascade,
  primary key (course_id, lecturer_id)
);

-- ---------- BANK SOAL ----------
create table question_banks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  owner_id uuid not null references profiles(id),
  title text not null,
  topic text,
  learning_outcome text,                 -- CPMK
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references question_banks(id) on delete cascade,
  qtype question_type not null,
  body text not null,
  image_url text,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  weight numeric(6,2) not null default 1,
  scoring_mode text not null default 'PARTIAL' check (scoring_mode in ('PARTIAL','FULL')),
  discussion text,                       -- pembahasan (hanya tampil jika diizinkan)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table question_options (          -- TANPA penanda benar/salah
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  label text not null,                   -- A, B, C ...
  body text,
  image_url text,
  pair_text text,                        -- sisi kanan untuk MENJODOHKAN
  sort_order smallint not null default 0
);

create table question_keys (             -- KUNCI JAWABAN: rahasia
  question_id uuid primary key references questions(id) on delete cascade,
  answer_key jsonb not null              -- PG: "B" | PGK: ["A","C"] | ISIAN: ["jawaban1","jawaban2"] | JODOH: {"1":"a"}
);

-- ---------- UJIAN ----------
create table exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id),
  creator_id uuid not null references profiles(id),
  title text not null,
  kind exam_kind not null default 'KUIS',
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes int not null check (duration_minutes > 0),
  bank_id uuid references question_banks(id),
  question_count int,                    -- jika acak dari bank
  randomize_questions boolean not null default true,
  randomize_options boolean not null default true,
  max_attempts smallint not null default 1,
  access_token text,                     -- token ujian (opsional)
  show_score boolean not null default false,
  show_discussion boolean not null default false,
  passing_grade numeric(5,2) not null default 60,
  -- Pengaturan anti-curang
  require_fullscreen boolean not null default true,
  block_copy_paste boolean not null default true,
  max_violations smallint not null default 3,   -- 0 = tidak dikunci otomatis
  status exam_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table exam_classes (
  exam_id uuid references exams(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  primary key (exam_id, class_id)
);

create table exam_questions (
  exam_id uuid references exams(id) on delete cascade,
  question_id uuid references questions(id),
  order_no int not null,
  primary key (exam_id, question_id)
);

create table exam_participants (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references profiles(id),
  attempt_no smallint not null default 1,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,      -- dihitung SERVER saat mulai
  submitted_at timestamptz,
  status part_status not null default 'BERLANGSUNG',
  violation_count smallint not null default 0,
  active_session text,                   -- untuk satu sesi aktif per mahasiswa
  question_order jsonb,
  option_order jsonb,
  unique (exam_id, student_id, attempt_no)
);
create index on exam_participants (exam_id, status);

create table answers (
  participant_id uuid references exam_participants(id) on delete cascade,
  question_id uuid references questions(id),
  answer jsonb,
  is_doubtful boolean not null default false,
  score numeric(6,2),                    -- diisi saat penilaian
  max_score numeric(6,2),
  is_correct boolean,
  needs_manual boolean not null default false,  -- esai: dinilai dosen
  updated_at timestamptz not null default now(),
  primary key (participant_id, question_id)
);

create table results (
  participant_id uuid primary key references exam_participants(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references profiles(id),
  total_score numeric(8,2) not null,
  total_max numeric(8,2) not null,
  final_grade numeric(5,2) not null,
  letter_grade text,                     -- A, B+, B, ...
  correct_count int, wrong_count int, blank_count int,
  is_passed boolean,
  graded_at timestamptz not null default now()
);

create table item_analysis (
  exam_id uuid references exams(id) on delete cascade,
  question_id uuid references questions(id),
  total_participants int,
  difficulty_p numeric(5,4),
  difficulty_label text,
  discrimination_d numeric(5,4),
  discrimination_label text,
  option_distribution jsonb,
  recommendation text,
  calculated_at timestamptz not null default now(),
  primary key (exam_id, question_id)
);

-- ---------- PENGAWASAN & LOG ----------
create table violations (
  id bigint generated always as identity primary key,
  participant_id uuid not null references exam_participants(id) on delete cascade,
  kind text not null,                    -- TAB_SWITCH, EXIT_FULLSCREEN, COPY_PASTE, MULTI_LOGIN, ...
  detail text,
  occurred_at timestamptz not null default now()
);
create index on violations (participant_id);

create table activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------- FUNGSI AMAN UNTUK MAHASISWA ----------
-- Simpan jawaban: ditolak jika waktu habis / ujian bukan miliknya / sudah selesai.
create function public.save_answer(p_participant uuid, p_question uuid, p_answer jsonb, p_doubt boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v exam_participants;
begin
  select * into v from exam_participants where id = p_participant and student_id = auth.uid();
  if not found then raise exception 'Peserta tidak valid'; end if;
  if v.status <> 'BERLANGSUNG' then raise exception 'Ujian sudah berakhir'; end if;
  if now() > v.deadline_at + interval '5 seconds' then raise exception 'Waktu habis'; end if;
  insert into answers (participant_id, question_id, answer, is_doubtful, updated_at)
  values (p_participant, p_question, p_answer, p_doubt, now())
  on conflict (participant_id, question_id)
  do update set answer = excluded.answer, is_doubtful = excluded.is_doubtful, updated_at = now();
end $$;

-- Catat pelanggaran; kunci otomatis jika melewati batas.
create function public.log_violation(p_participant uuid, p_kind text, p_detail text default null)
returns table (violation_count smallint, locked boolean)
language plpgsql security definer set search_path = public as $$
declare v exam_participants; mx smallint;
begin
  select * into v from exam_participants where id = p_participant and student_id = auth.uid();
  if not found or v.status <> 'BERLANGSUNG' then return; end if;
  insert into violations (participant_id, kind, detail) values (p_participant, p_kind, p_detail);
  select max_violations into mx from exams where id = v.exam_id;
  update exam_participants set violation_count = violation_count + 1
    where id = p_participant returning * into v;
  if mx > 0 and v.violation_count >= mx then
    update exam_participants set status = 'TERKUNCI' where id = p_participant;
    return query select v.violation_count, true;
  else
    return query select v.violation_count, false;
  end if;
end $$;

-- ---------- ROW LEVEL SECURITY ----------
alter table profiles            enable row level security;
alter table faculties           enable row level security;
alter table study_programs      enable row level security;
alter table academic_terms      enable row level security;
alter table courses             enable row level security;
alter table classes             enable row level security;
alter table class_students      enable row level security;
alter table course_lecturers    enable row level security;
alter table question_banks      enable row level security;
alter table questions           enable row level security;
alter table question_options    enable row level security;
alter table question_keys       enable row level security;
alter table exams               enable row level security;
alter table exam_classes        enable row level security;
alter table exam_questions      enable row level security;
alter table exam_participants   enable row level security;
alter table answers             enable row level security;
alter table results             enable row level security;
alter table item_analysis       enable row level security;
alter table violations          enable row level security;
alter table activity_logs       enable row level security;

-- Profil: lihat diri sendiri; staf lihat semua; hanya ADMIN yang mengubah.
create policy profiles_self  on profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_admin on profiles for all    using (public.current_role() = 'ADMIN')
                                                    with check (public.current_role() = 'ADMIN');

-- Data master: semua pengguna login boleh baca; ADMIN yang mengelola.
do $$
declare t text;
begin
  foreach t in array array['faculties','study_programs','academic_terms','courses','classes','course_lecturers'] loop
    execute format('create policy %I_read on %I for select using (auth.uid() is not null)', t, t);
    execute format('create policy %I_admin on %I for all using (public.current_role() = ''ADMIN'') with check (public.current_role() = ''ADMIN'')', t, t);
  end loop;
end $$;

create policy class_students_read  on class_students for select using (student_id = auth.uid() or public.is_staff());
create policy class_students_admin on class_students for all using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');

-- Bank soal, soal, opsi, kunci: HANYA staf (mahasiswa tidak punya akses langsung).
-- Soal untuk mahasiswa dikirim lewat Edge Function (tanpa kunci) saat ujian dimulai.
create policy qb_staff  on question_banks   for all using (public.is_staff()) with check (public.is_staff());
create policy q_staff   on questions        for all using (public.is_staff()) with check (public.is_staff());
create policy qo_staff  on question_options for all using (public.is_staff()) with check (public.is_staff());
create policy qk_staff  on question_keys    for all using (public.is_staff()) with check (public.is_staff());

-- Ujian: staf kelola; mahasiswa boleh melihat ujian untuk kelasnya (bukan token).
create policy exams_staff on exams for all using (public.is_staff()) with check (public.is_staff());
create policy exam_classes_staff on exam_classes for all using (public.is_staff()) with check (public.is_staff());
create policy exam_questions_staff on exam_questions for all using (public.is_staff()) with check (public.is_staff());

-- Peserta & jawaban: mahasiswa HANYA baca milik sendiri (menulis lewat fungsi/Edge Function).
create policy part_read on exam_participants for select using (student_id = auth.uid() or public.is_staff());
create policy part_staff on exam_participants for update using (public.is_staff());
create policy ans_read on answers for select using (
  public.is_staff() or exists (select 1 from exam_participants p where p.id = participant_id and p.student_id = auth.uid()));
create policy ans_staff on answers for update using (public.is_staff());  -- dosen menilai esai

create policy res_read on results for select using (public.is_staff() or student_id = auth.uid());
create policy ia_staff on item_analysis for select using (public.is_staff());
create policy viol_staff on violations for select using (public.is_staff());
create policy logs_admin on activity_logs for select using (public.current_role() = 'ADMIN');

-- Pembuatan profil otomatis saat akun baru dibuat
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, nim_nip, role)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.email),
          new.raw_user_meta_data->>'nim_nip',
          'MAHASISWA');                  -- peran lain hanya diubah oleh ADMIN
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
