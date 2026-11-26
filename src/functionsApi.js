import { supabase } from './supabase'

// Memanggil Edge Function dan menampilkan pesan error ASLI dari server
// (supabase-js hanya memberi "non-2xx status code" bila tidak dibaca manual).
export async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let msg = error.message
    try {
      const b = await error.context.json()
      if (b?.error) msg = b.error
    } catch { /* badan respons tidak terbaca; pakai pesan umum */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
