# CBT Kampus – Tahap 5 (penilaian esai, analisis butir soal, gambar soal)

## Urutan pemasangan
1. SQL Editor Supabase: jalankan berurutan (yang sudah pernah dijalankan boleh dilewati)
   `supabase/sql/cbt_kampus_schema.sql` -> `cbt_kampus_tahap4.sql` -> **`cbt_kampus_tahap5.sql`**.
2. `npm install`, isi `.env`, `npm run dev`.

## Fitur baru (menu Ujian)
- **Esai**: dosen/admin menilai jawaban esai (identitas bisa disembunyikan); nilai akhir otomatis diperbarui.
- **Analisis**: tingkat kesulitan (P), daya beda (D), sebaran pilihan jawaban, rekomendasi; unduh Excel.
- **Gambar soal**: unggah di editor soal (Supabase Storage, bucket `question-images`).

## Tambahan: kelas & dosen
Jalankan `supabase/sql/cbt_kampus_kelas_dosen.sql` (setelah tahap 4 dan 5).
- Admin: menu **Kelas & Mahasiswa** (tugaskan dosen, tambah/keluarkan mahasiswa, unduh Excel).
- Dosen: menu **Kelas Saya** (daftar mahasiswa kelas yang ditugaskan, hanya baca). Dosen hanya bisa memilih kelas yang ditugaskan saat menjadwalkan ujian.

## Tambahan: dosen membuat kelas & mengimpor mahasiswa
1. Jalankan `supabase/sql/cbt_kampus_dosen_kelas_impor.sql` (setelah `cbt_kampus_kelas_dosen.sql`).
2. **Deploy ulang** Edge Function `import-students` (tempel isi `supabase/functions/import-students/index.ts` yang baru, lalu Deploy).
Dosen: menu Kelas Saya (+ Buat Kelas, Hapus selama belum dipakai ujian), Impor Mahasiswa (wajib pilih kelas yang ia ampu).

## Tampilan baru: login & dashboard
- Halaman login bergaya kartu putih di atas foto latar. Logo dan latar: lihat `public/LIHAT-INI-branding.txt`.
- Teks/nama aplikasi: `src/branding.js`.
- "Remember Me": dicentang = sesi tersimpan; tidak dicentang = sesi hilang saat browser ditutup.
- "Forgot your password?": reset lewat email (perlu pengaturan URL di Supabase, lihat penjelasan di chat).
- Dashboard berbeda untuk Admin, Dosen, Proktor, dan Mahasiswa.

## Hosting di GitHub Pages
Lihat panduan di chat. Ringkas: push ke repo GitHub (branch `main`), isi Secrets
`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, aktifkan Settings > Pages > Source: GitHub Actions.
Workflow ada di `.github/workflows/deploy.yml`. Jangan pernah meng-commit berkas `.env`.

## Tambahan: daftar pengguna & reset password
1. Jalankan `supabase/sql/cbt_kampus_daftar_pengguna.sql`.
2. Pasang Edge Function baru `reset-password` (tempel `supabase/functions/reset-password/index.ts`, nama persis, lalu Deploy).
3. **Deploy ulang** `import-students` bila belum memakai versi terbaru (dosen dapat mengimpor ke kelas yang diampu).
Admin: menu Daftar Dosen dan Daftar Mahasiswa (cari, nonaktifkan, reset password). Dosen: tombol Reset password di daftar mahasiswa kelas yang diampu.

## Tambahan: kartu peserta
1. Jalankan `supabase/sql/cbt_kampus_kartu_peserta.sql`.
2. **Deploy ulang** Edge Function `reset-password` (kini mendukung banyak pengguna) dan `import-students` (kini mengembalikan student_id).
Kartu peserta berisi nama, NIM, username, password, dan jadwal ujian aktif; dicetak dari hasil impor, jendela reset password, atau pilihan mahasiswa di daftar kelas.

## Tambahan: tambah dosen & aksi massal
1. Jalankan `supabase/sql/cbt_kampus_aksi_massal.sql`.
2. Buat dua Edge Function baru: `create-user` dan `delete-users` (tempel isi file masing-masing, nama persis, lalu Deploy).
Menu Daftar Dosen: + Tambah Dosen. Daftar Dosen/Mahasiswa: pilih banyak lalu Aksi massal (tambah/pindah/keluarkan kelas, tugaskan dosen, aktif/nonaktif, hapus).

## Tambahan: ubah password sendiri
Tombol kunci di kartu pengguna (staf) dan tombol "Ubah password" di header mahasiswa. Tidak perlu SQL atau Edge Function baru.

## Tambahan: ekspor Excel massal & perbaikan penilaian esai
1. Jalankan `supabase/sql/cbt_kampus_perbaikan_esai.sql` (setelah `cbt_kampus_tahap5.sql`).
2. Kartu peserta massal: pilih mahasiswa > **Kartu peserta…** (cetak dan/atau unduh Excel).
3. Ekspor Excel terpilih: tombol **Ekspor Excel** pada daftar dosen/mahasiswa, dan **Unduh Excel (n terpilih)** pada daftar kelas.
4. Fungsi kirim email (`send-cards`) sudah dihapus; jika sudah terlanjur dipasang di Supabase, hapus lewat menu Edge Functions.
