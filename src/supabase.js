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

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storage, persistSession: true, autoRefreshToken: true } }
)
