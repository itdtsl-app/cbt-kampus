-- =====================================================================
-- CBT KAMPUS - Aksi massal: tambah/pindah/keluarkan mahasiswa di kelas,
-- tugaskan/cabut dosen dari kelas. Jalankan SETELAH cbt_kampus_dosen_kelas_impor.sql.
-- Aman dijalankan ulang.
-- =====================================================================

-- Tambah (dan opsional pindah dari kelas asal) banyak mahasiswa ke satu kelas.
-- Admin: semua kelas. Dosen: hanya kelas yang ia ampu (kelas tujuan DAN asal).
create or replace function public.bulk_set_class(p_students uuid[], p_to uuid, p_from uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a int := 0; r int := 0;
begin
  if not coalesce(public.can_manage_class(p_to), false)
     or (p_from is not null and not coalesce(public.can_manage_class(p_from), false)) then
    raise exception 'Anda tidak berhak mengelola kelas tersebut';
  end if;
  insert into class_students (class_id, student_id)
  select p_to, pr.id from profiles pr where pr.id = any(p_students) and pr.role = 'MAHASISWA'
  on conflict do nothing;
  get diagnostics a = row_count;
  if p_from is not null and p_from <> p_to then
    delete from class_students where class_id = p_from and student_id = any(p_students);
    get diagnostics r = row_count;
  end if;
  return jsonb_build_object('added', a, 'removed', r);
end $$;

-- Keluarkan banyak mahasiswa dari satu kelas (akun tidak dihapus).
create or replace function public.bulk_remove_students(p_students uuid[], p_class uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not coalesce(public.can_manage_class(p_class), false) then
    raise exception 'Anda tidak berhak mengelola kelas tersebut';
  end if;
  delete from class_students where class_id = p_class and student_id = any(p_students);
  get diagnostics n = row_count;
  return n;
end $$;

-- Admin: tugaskan atau cabut banyak dosen dari satu kelas.
create or replace function public.bulk_lecturer_class(p_lecturers uuid[], p_class uuid, p_remove boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if public.current_role() is distinct from 'ADMIN' then raise exception 'Hanya admin'; end if;
  if p_remove then
    delete from class_lecturers where class_id = p_class and lecturer_id = any(p_lecturers);
  else
    insert into class_lecturers (class_id, lecturer_id)
    select p_class, pr.id from profiles pr where pr.id = any(p_lecturers) and pr.role = 'DOSEN'
    on conflict do nothing;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
