import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Local Supabase URL and service-role key are required for unit tests')
}

// Keep one service-role client per test worker. Vitest shares the jsdom context
// between files, so duplicate GoTrue clients using this storage key warn.
export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storageKey: `testo-service-role-test-client-${Math.random().toString(36).slice(2)}`,
  },
})
