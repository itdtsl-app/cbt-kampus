-- =====================================================================
-- CBT KAMPUS - Tambahan: penugasan dosen ke kelas + daftar mahasiswa per kelas
-- Jalankan SETELAH skema awal, tahap 4, dan tahap 5. Aman dijalankan ulang.
--
-- Aturan akses:
--   ADMIN  : melihat semua kelas, menugaskan dosen, mengelola mahasiswa kelas.
--   DOSEN  : hanya melihat kelas yang ditugaskan kepadanya (daftar mahasiswa
--            read-only) dan hanya dapat memilih kelas tersebut untuk ujian.
-- =====================================================================

-- ---------- Penugasan dosen ke kelas ----------
create table if not exists class_lecturers (
  class_id    uuid references classes(id) on delete cascade,
  lecturer_id uuid references profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (class_id, lecturer_id)
);
create index if not exists class_lecturers_lecturer_idx on class_lecturers (lecturer_id);

alter table class_lecturers enable row level security;
drop policy if exists class_lecturers_read on class_lecturers;
create policy class_lecturers_read on class_lecturers for select using (public.is_staff());
drop policy if exists class_lecturers_admin on class_lecturers;
create policy class_lecturers_admin on class_lecturers for all
  using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');

-- Hanya akun berperan DOSEN yang boleh ditugaskan
create or replace function public.check_class_lecturer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = new.lecturer_id and role = 'DOSEN') then
    raise exception 'Hanya akun berperan DOSEN yang dapat ditugaskan ke kelas';
  end if;
  return new;
end $$;
drop trigger if exists trg_check_class_lecturer on class_lecturers;
create trigger trg_check_class_lecturer before insert or update on class_lecturers
  for each row execute function public.check_class_lecturer();

-- ---------- Daftar kelas (admin: semua; dosen: yang ditugaskan) ----------
create or replace function public.list_classes()
returns table (class_id uuid, class_name text, course_id uuid, course_code text, course_name text,
               term_label text, student_count int, lecturers text)
language plpgsql stable security definer set search_path = public as $$
declare r user_role := public.current_role();
begin
  if r is null or r not in ('ADMIN', 'DOSEN', 'PROKTOR') then raise exception 'Akses ditolak'; end if;
  return query
  select c.id, c.name, co.id, co.code, co.name, t.year_label || ' ' || t.semester,
         (select count(*)::int from class_students cs where cs.class_id = c.id),
         coalesce((select string_agg(pr.full_name, ', ' order by pr.full_name)
                     from class_lecturers cl join profiles pr on pr.id = cl.lecturer_id
                    where cl.class_id = c.id), '')
  from classes c
  join courses co on co.id = c.course_id
  join academic_terms t on t.id = c.term_id
  where r <> 'DOSEN'
     or exists (select 1 from class_lecturers cl where cl.class_id = c.id and cl.lecturer_id = auth.uid())
  order by t.year_label desc, co.name, c.name;
end $$;

-- ---------- Daftar mahasiswa satu kelas ----------
create or replace function public.class_roster(p_class uuid)
returns table (student_id uuid, nim text, full_name text, email text, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
declare r user_role := public.current_role();
begin
  if r is null or r not in ('ADMIN', 'DOSEN', 'PROKTOR') then raise exception 'Akses ditolak'; end if;
  if r = 'DOSEN' and not exists (
       select 1 from class_lecturers cl where cl.class_id = p_class and cl.lecturer_id = auth.uid()) then
    raise exception 'Anda bukan pengampu kelas ini';
  end if;
  return query
  select pr.id, pr.nim_nip, pr.full_name, u.email::text, pr.is_active
  from class_students cs
  join profiles pr on pr.id = cs.student_id
  left join auth.users u on u.id = pr.id
  where cs.class_id = p_class
  order by pr.full_name;
end $$;

-- ---------- Admin: tambahkan satu mahasiswa ke kelas berdasarkan NIM ----------
create or replace function public.admin_add_student_to_class(p_class uuid, p_nim text) returns text
language plpgsql security definer set search_path = public as $$
declare sid uuid; nm text;
begin
  if public.current_role() is distinct from 'ADMIN' then raise exception 'Hanya admin'; end if;
  select id, full_name into sid, nm from profiles where nim_nip = trim(p_nim) and role = 'MAHASISWA';
  if not found then
    raise exception 'Mahasiswa dengan NIM % tidak ditemukan. Impor dulu lewat menu Impor Mahasiswa.', p_nim;
  end if;
  insert into class_students (class_id, student_id) values (p_class, sid) on conflict do nothing;
  return nm;
end $$;

-- ---------- Dosen hanya boleh memakai kelas yang ditugaskan untuk ujian ----------
drop policy if exists exam_classes_staff on exam_classes;
drop policy if exists exam_classes_read on exam_classes;
drop policy if exists exam_classes_write on exam_classes;
create policy exam_classes_read on exam_classes for select using (public.is_staff());
create policy exam_classes_write on exam_classes for all
  using (
    public.current_role() = 'ADMIN'
    or (public.current_role() = 'DOSEN' and exists (
          select 1 from class_lecturers cl where cl.class_id = exam_classes.class_id and cl.lecturer_id = auth.uid()))
  )
  with check (
    public.current_role() = 'ADMIN'
    or (public.current_role() = 'DOSEN' and exists (
          select 1 from class_lecturers cl where cl.class_id = exam_classes.class_id and cl.lecturer_id = auth.uid()))
  );
