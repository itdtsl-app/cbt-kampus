import CrudPage from './CrudPage.jsx'
import QuestionBanks from './QuestionBanks.jsx'
import StudentImport from './StudentImport.jsx'
import ExamsStaff from './ExamsStaff.jsx'
import ClassRoster from './ClassRoster.jsx'
import Dashboard from './Dashboard.jsx'
import UserList from './UserList.jsx'

const SEMESTER = ['Ganjil', 'Genap', 'Pendek']
const ROLES = ['ADMIN', 'DOSEN', 'MAHASISWA', 'PROKTOR']

// roles: peran yang boleh melihat menu. el menerima profile.
export const MENU = [
  { id: 'dashboard', icon: 'home', label: 'Dashboard', roles: ['ADMIN', 'DOSEN', 'PROKTOR'], el: (profile, go) => <Dashboard profile={profile} go={go} /> },
  { id: 'exams', icon: 'file', label: 'Ujian', roles: ['ADMIN', 'DOSEN', 'PROKTOR'], el: profile => <ExamsStaff profile={profile} /> },
  { id: 'roster', icon: 'users', label: 'Kelas & Mahasiswa', roles: ['ADMIN'], el: profile => <ClassRoster profile={profile} /> },
  { id: 'lecturers', icon: 'usercheck', label: 'Daftar Dosen', roles: ['ADMIN'], el: () => <UserList key="dosen" role="DOSEN" /> },
  { id: 'students', icon: 'users', label: 'Daftar Mahasiswa', roles: ['ADMIN'], el: () => <UserList key="mhs" role="MAHASISWA" /> },
  { id: 'myclasses', icon: 'users', label: 'Kelas Saya', roles: ['DOSEN'], el: profile => <ClassRoster profile={profile} /> },
  { id: 'banks', icon: 'book', label: 'Bank Soal', roles: ['ADMIN', 'DOSEN'], el: profile => <QuestionBanks profile={profile} /> },
  { id: 'import', icon: 'upload', label: 'Impor Mahasiswa', roles: ['ADMIN', 'DOSEN'], el: profile => <StudentImport profile={profile} /> },
  { id: 'faculties', icon: 'building', label: 'Fakultas', roles: ['ADMIN'], el: () => <CrudPage table="faculties" title="Fakultas" columns={[
      { key: 'code', label: 'Kode' }, { key: 'name', label: 'Nama' }]} /> },
  { id: 'programs', icon: 'layers', label: 'Program Studi', roles: ['ADMIN'], el: () => <CrudPage table="study_programs" title="Program Studi" columns={[
      { key: 'code', label: 'Kode' }, { key: 'name', label: 'Nama' },
      { key: 'faculty_id', label: 'Fakultas', ref: { table: 'faculties', label: 'name' } }]} /> },
  { id: 'terms', icon: 'calendar', label: 'Tahun Akademik', roles: ['ADMIN'], el: () => <CrudPage table="academic_terms" title="Tahun Akademik" columns={[
      { key: 'year_label', label: 'Tahun (mis. 2026/2027)' },
      { key: 'semester', label: 'Semester', type: 'select', options: SEMESTER },
      { key: 'is_active', label: 'Aktif', type: 'bool' }]} /> },
  { id: 'courses', icon: 'book', label: 'Mata Kuliah', roles: ['ADMIN'], el: () => <CrudPage table="courses" title="Mata Kuliah" columns={[
      { key: 'code', label: 'Kode' }, { key: 'name', label: 'Nama' },
      { key: 'credits', label: 'SKS', type: 'number' },
      { key: 'program_id', label: 'Program Studi', ref: { table: 'study_programs', label: 'name' } }]} /> },
  { id: 'classes', icon: 'building', label: 'Kelas', roles: ['ADMIN'], el: () => <CrudPage table="classes" title="Kelas" columns={[
      { key: 'name', label: 'Nama Kelas' },
      { key: 'course_id', label: 'Mata Kuliah', ref: { table: 'courses', label: 'name' } },
      { key: 'term_id', label: 'Tahun Akademik', ref: { table: 'academic_terms', label: 'year_label' } }]} /> },
  { id: 'users', icon: 'usercheck', label: 'Pengguna & Peran', roles: ['ADMIN'], el: () => <CrudPage table="profiles" title="Pengguna" canAdd={false} canDelete={false} columns={[
      { key: 'full_name', label: 'Nama' }, { key: 'nim_nip', label: 'NIM/NIP' },
      { key: 'role', label: 'Peran', type: 'select', options: ROLES },
      { key: 'is_active', label: 'Aktif', type: 'bool' }]} /> },
]
