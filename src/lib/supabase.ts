import { createClient } from '@supabase/supabase-js'
export const URL_ = import.meta.env.VITE_SUPABASE_URL as string
export const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const sb = createClient(URL_, KEY_)
