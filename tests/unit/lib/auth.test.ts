import {
  getCurrentUser,
  getSession,
  resetPassword,
  signIn,
  signOut,
  signUp,
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
})
