// Ubah teks/identitas di sini. Logo & latar login: taruh berkas di folder /public
//   public/logo.png       -> logo (persegi, mis. 400x400, latar transparan)
//   public/login-bg.jpg   -> foto latar halaman login (mis. 1920x1080)
// Jika berkas belum ada, aplikasi memakai logo huruf dan latar gradasi biru.
export const BRAND = {
  name: 'CBT DTSL FT UGM',
  short: 'DTSL',
  tagline: 'Computer Based Test',
  logo: `${import.meta.env.BASE_URL}logo.png`,
  loginBg: `${import.meta.env.BASE_URL}login-bg.jpg`,
}

// Teks halaman login (sesuai contoh; boleh diganti ke Bahasa Indonesia)
export const TEXT = {
  subtitle: 'Login to start your session',
  idPlaceholder: 'Email / NIM',
  password: 'Password',
  remember: 'Remember Me',
  login: 'Login',
  forgot: 'Forgot your password?',
  back: 'Back to login',
  sendReset: 'Send reset link',
  wrong: 'Email/NIM atau password salah.',
  forgotNim: 'Akun yang masuk dengan NIM tidak bisa reset lewat email. Hubungi dosen atau admin untuk mengatur ulang password Anda.',
  forgotSent: 'Jika email terdaftar, tautan untuk mengatur ulang password sudah dikirim. Periksa kotak masuk (dan folder spam).',
}

// Akun tanpa email memakai alamat internal ini (harus sama dengan Edge Function import-students)
export const INTERNAL_DOMAIN = 'mhs.cbt.local'
export const toEmail = id => {
  const v = id.trim()
  return v.includes('@') ? v : `${v.toLowerCase().replace(/[^a-z0-9]/g, '')}@${INTERNAL_DOMAIN}`
}
