// Browser-only: use from Client Components; never import into Server Components or Route Handlers.
import { createClient } from './supabase/client'

const supabase = createClient()

export type SignUpOptions = {
  preferred_language?: 'en' | 'ar'
  preferred_theme?: 'light' | 'dark'
  full_name?: string
}

export function signUp(email: string, password: string, options: SignUpOptions = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: options.full_name ?? '',
        preferred_language: options.preferred_language ?? 'en',
        preferred_theme: options.preferred_theme ?? 'light',
      },
    },
  })
}

export function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export function signOut() {
  return supabase.auth.signOut()
}

export function resetPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
}

export function getCurrentUser() {
  return supabase.auth.getUser()
}

export function getSession() {
  return supabase.auth.getSession()
}
