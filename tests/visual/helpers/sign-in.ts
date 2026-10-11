import { createServerClient } from '@supabase/ssr'
import type { BrowserContext } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'

type VisualProfile = {
  role?: 'student' | 'admin'
  full_name?: string
  preferred_language?: 'en' | 'ar'
  preferred_theme?: 'light' | 'dark'
}

export function visualAppOrigin() {
  const port = process.env.TEST_WEB_PORT ?? '3000'
  return `http://127.0.0.1:${port}`
}

export async function updateVisualProfile(
  adminClient: SupabaseClient,
  userId: string,
  profile: VisualProfile,
) {
  const { data, error } = await adminClient
    .from('profiles')
    .update(profile)
    .eq('id', userId)
    .select('id, role')
    .single()

  if (error) throw error
  if (profile.role && data.role !== profile.role) {
    throw new Error(`Expected visual user ${userId} to have role ${profile.role}, received ${data.role}.`)
  }
}

export async function signInBrowserContext(
  context: BrowserContext,
  email: string,
  password: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Supabase URL and anon key are required for visual authentication.')

  const cookieJar = new Map<string, string>()
  const authClient = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => {
        if (options?.maxAge === 0) cookieJar.delete(name)
        else cookieJar.set(name, value)
      }),
    },
  })
  const { error } = await authClient.auth.signInWithPassword({ email, password })
  if (error) throw error

  await context.addCookies([...cookieJar].map(([name, value]) => ({
    name,
    value,
    url: visualAppOrigin(),
  })))
}
