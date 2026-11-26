-- =====================================================================
-- CBT KAMPUS - Daftar dosen / mahasiswa untuk admin (dengan pencarian & halaman)
-- Jalankan SETELAH skrip-skrip sebelumnya. Aman dijalankan ulang.
-- =====================================================================
create or replace function public.list_users(
  p_role user_role, p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, nim text, full_name text, email text, is_active boolean, classes text, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_role() is distinct from 'ADMIN' then raise exception 'Hanya admin'; end if;
  if p_role not in ('DOSEN', 'MAHASISWA', 'PROKTOR') then raise exception 'Peran tidak didukung'; end if;
  return query
  select pr.id, pr.nim_nip, pr.full_name, u.email::text, pr.is_active,
         case when p_role = 'MAHASISWA' then
           coalesce((select string_agg(co.name || ' ' || c.name, ', ' order by co.name)
                       from class_students cs join classes c on c.id = cs.class_id
                       join courses co on co.id = c.course_id where cs.student_id = pr.id), '')
         else
           coalesce((select string_agg(co.name || ' ' || c.name, ', ' order by co.name)
                       from class_lecturers cl join classes c on c.id = cl.class_id
                       join courses co on co.id = c.course_id where cl.lecturer_id = pr.id), '')
         end,
         count(*) over () as total
  from profiles pr
  left join auth.users u on u.id = pr.id
  where pr.role = p_role
    and (coalesce(p_search, '') = ''
         or pr.full_name ilike '%' || p_search || '%'
         or coalesce(pr.nim_nip, '') ilike '%' || p_search || '%'
         or coalesce(u.email, '') ilike '%' || p_search || '%')
  order by pr.full_name
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end $$;
