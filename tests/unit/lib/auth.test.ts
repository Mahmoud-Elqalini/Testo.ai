import {
  getCurrentUser,
  getSession,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../../../src/lib/auth'
import { createClient as createSupabaseBrowserClient } from '../../../src/lib/supabase/client'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'

const password = 'Testo-auth-test-password-123!'
const email = `auth-${crypto.randomUUID()}@testo.local`
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Local Supabase URL and service-role key are required for auth tests')
}

const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storageKey: 'testo-service-role-test-client',
  },
})

let testUserId: string | undefined

describe('auth utilities (local Supabase)', () => {
  afterEach(async () => {
    if (!testUserId) {
      return
    }

    const { error } = await adminClient.auth.admin.deleteUser(testUserId)
    expect(error).toBeNull()
    testUserId = undefined
  })

  it('reuses one browser client instance', () => {
    expect(createSupabaseBrowserClient()).toBe(createSupabaseBrowserClient())
  })

  it('signs up, reads the session and user, signs out and signs back in', async () => {
    const signUpResult = await signUp(email, password)
    testUserId = signUpResult.data.user?.id

    expect(signUpResult.error).toBeNull()
    expect(signUpResult.data.user?.email).toBe(email)

    const sessionAfterSignUp = await getSession()
    expect(sessionAfterSignUp.error).toBeNull()
    expect(sessionAfterSignUp.data.session?.user.email).toBe(email)

    const currentUser = await getCurrentUser()
    expect(currentUser.error).toBeNull()
    expect(currentUser.data.user?.email).toBe(email)

    const signOutResult = await signOut()
    expect(signOutResult.error).toBeNull()

    const sessionAfterSignOut = await getSession()
    expect(sessionAfterSignOut.error).toBeNull()
    expect(sessionAfterSignOut.data.session).toBeNull()

    const signInResult = await signIn(email, password)
    expect(signInResult.error).toBeNull()
    expect(signInResult.data.user?.email).toBe(email)

    const passwordResetResult = await resetPassword(email)
    expect(passwordResetResult.error).toBeNull()
  }, 30_000)

  // Fix 1: prove that signUp metadata is written to the profile row by the trigger.
  // A signup with preferred_language='ar' and preferred_theme='dark' MUST produce
  // a profiles row with those exact values — not the column defaults ('en'/'light').
  it('profile row reflects preferred_language and preferred_theme from signup metadata', async () => {
    const metaEmail = `auth-meta-${crypto.randomUUID()}@testo.local`

    const signUpResult = await signUp(metaEmail, password, {
      preferred_language: 'ar',
      preferred_theme: 'dark',
    })
    testUserId = signUpResult.data.user?.id

    expect(signUpResult.error).toBeNull()
    expect(testUserId).toBeDefined()

    // Query the profiles table via the service-role client (bypasses RLS)
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('preferred_language, preferred_theme')
      .eq('id', testUserId!)
      .single()

    expect(profileError).toBeNull()
    // These must be 'ar'/'dark', not the column defaults 'en'/'light'
    expect(profile?.preferred_language).toBe('ar')
    expect(profile?.preferred_theme).toBe('dark')
  }, 30_000)

  it('updates the user password successfully', async () => {
    const updateEmail = `auth-update-${crypto.randomUUID()}@testo.local`
    
    const signUpResult = await signUp(updateEmail, password)
    testUserId = signUpResult.data.user?.id
    expect(signUpResult.error).toBeNull()

    const newPassword = 'New-testo-password-123!'
    const updateResult = await updatePassword(newPassword)
    expect(updateResult.error).toBeNull()

    await signOut()

    // Sign in with the old password should fail
    const oldSignInResult = await signIn(updateEmail, password)
    expect(oldSignInResult.error).not.toBeNull()

    // Sign in with the new password should succeed
    const newSignInResult = await signIn(updateEmail, newPassword)
    expect(newSignInResult.error).toBeNull()
    expect(newSignInResult.data.user?.email).toBe(updateEmail)
  }, 30_000)
})
