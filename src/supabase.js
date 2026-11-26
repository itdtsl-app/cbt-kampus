import { createClient } from '@supabase/supabase-js'

// "Remember Me": bila dicentang sesi disimpan permanen (localStorage);
// bila tidak, sesi hilang saat browser ditutup (sessionStorage).
const useSession = () => localStorage.getItem('cbt-remember') === '0'
const storage = {
  getItem: k => sessionStorage.getItem(k) ?? localStorage.getItem(k),
  setItem: (k, v) => {
    const [use, other] = useSession() ? [sessionStorage, localStorage] : [localStorage, sessionStorage]
    other.removeItem(k); use.setItem(k, v)
  },
  removeItem: k => { localStorage.removeItem(k); sessionStorage.removeItem(k) },
}

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
// Jika kunci tidak terisi saat build, aplikasi menampilkan pesan (bukan layar kosong)
export const configMissing = !url || !key

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key',
  { auth: { storage, persistSession: true, autoRefreshToken: true } }
)
