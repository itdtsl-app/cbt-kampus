-- =====================================================================
-- CBT KAMPUS - Dosen dapat membuat kelas & mengelola mahasiswa kelasnya
-- Jalankan SETELAH cbt_kampus_kelas_dosen.sql. Aman dijalankan ulang.
--
-- Aturan:
--   * ADMIN : boleh semuanya.
--   * DOSEN : boleh membuat kelas (otomatis menjadi pengampunya), menambah/
--             mengeluarkan mahasiswa di kelas yang ia ampu, dan menghapus kelas
--             yang ia ampu SELAMA belum dipakai pada ujian.
-- =====================================================================

-- Admin, atau dosen yang ditugaskan pada kelas tersebut
create or replace function public.can_manage_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'ADMIN'
      or (public.current_role() = 'DOSEN' and exists (
            select 1 from class_lecturers cl where cl.class_id = p_class and cl.lecturer_id = auth.uid()))
$$;

-- ---------- Buat kelas ----------
create or replace function public.create_class(p_course uuid, p_term uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; r user_role := public.current_role();
begin
  if r is null or r not in ('ADMIN', 'DOSEN') then raise exception 'Akses ditolak'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Nama kelas wajib diisi'; end if;
  if exists (select 1 from classes
              where course_id = p_course and term_id = p_term and lower(name) = lower(trim(p_name))) then
    raise exception 'Kelas dengan nama itu sudah ada untuk mata kuliah dan tahun akademik ini';
  end if;
  insert into classes (course_id, term_id, name) values (p_course, p_term, trim(p_name)) returning id into cid;
  if r = 'DOSEN' then
    insert into class_lecturers (class_id, lecturer_id) values (cid, auth.uid());   -- pembuat otomatis menjadi pengampu
  end if;
  return cid;
end $$;

-- ---------- Hapus kelas ----------
create or replace function public.delete_class(p_class uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r user_role := public.current_role();
begin
  if r = 'ADMIN' then
    null;
  elsif r = 'DOSEN' then
    if not public.can_manage_class(p_class) then raise exception 'Anda bukan pengampu kelas ini'; end if;
    if exists (select 1 from exam_classes where class_id = p_class) then
      raise exception 'Kelas sudah dipakai pada ujian dan tidak dapat dihapus. Hubungi admin.';
    end if;
  else
    raise exception 'Akses ditolak';
  end if;
  delete from classes where id = p_class;
end $$;

-- ---------- Tambah / keluarkan mahasiswa (menggantikan versi admin-only) ----------
create or replace function public.admin_add_student_to_class(p_class uuid, p_nim text) returns text
language plpgsql security definer set search_path = public as $$
declare sid uuid; nm text;
begin
  if not public.can_manage_class(p_class) then raise exception 'Anda tidak berhak mengelola kelas ini'; end if;
  select id, full_name into sid, nm from profiles where nim_nip = trim(p_nim) and role = 'MAHASISWA';
  if not found then
    raise exception 'Mahasiswa dengan NIM % tidak ditemukan. Impor dulu lewat menu Impor Mahasiswa.', p_nim;
  end if;
  insert into class_students (class_id, student_id) values (p_class, sid) on conflict do nothing;
  return nm;
end $$;

create or replace function public.remove_student_from_class(p_class uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_class(p_class) then raise exception 'Anda tidak berhak mengelola kelas ini'; end if;
  delete from class_students where class_id = p_class and student_id = p_student;
end $$;
