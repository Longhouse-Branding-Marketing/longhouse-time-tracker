import { createClient } from '@supabase/supabase-js'

let client = null

/**
 * @param {{ supabaseUrl: string, supabaseAnonKey: string }} config
 */
export function createToolSupabase({ supabaseUrl, supabaseAnonKey }) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Use the same values as the Tools Hub.',
    )
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey)
  }
  return client
}

/** Reset singleton (useful in tests). */
export function resetToolSupabaseClient() {
  client = null
}
