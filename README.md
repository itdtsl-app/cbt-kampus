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
