// Browser-only: use from Client Components; never import into Server Components or Route Handlers.
import { createClient } from './supabase/client'

const supabase = createClient()

export function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
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
