import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { I18nProvider } from '../../../src/lib/i18n/provider'
import { useTranslation } from '../../../src/lib/i18n/use-translation'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { signUp, signOut } from '../../../src/lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const adminClient = createSupabaseAdminClient(supabaseUrl, serviceRoleKey)

// Detect whether the local Supabase is reachable.
// Tests that sign up real users are skipped when Docker/Supabase is not running.
async function isSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

// Resolved in beforeAll so it.skipIf() can use a plain boolean (no top-level await)
let supabaseReachable = false

describe('i18n Provider and Hook', () => {
  let testUserId: string | undefined

  beforeAll(async () => {
    supabaseReachable = await isSupabaseReachable()
  })

  afterEach(async () => {
    if (testUserId) {
      await adminClient.auth.admin.deleteUser(testUserId)
      testUserId = undefined
    }
    // Sign out between tests so the browser client doesn't retain sessions
    await signOut()
  })

  // ─── T017-A: Key lookup & initial fallback ───────────────────────────────
  it('falls back to browser locale on first render (no profile, logged out)', async () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    })

    // Fix 2: jsdom sets navigator.language = 'en-US', so the fallback MUST resolve
    // to 'en'.  Accepting 'ar' here would let the test pass even if the effect never
    // ran (initial useState default is 'ar').  toBe('en') proves the effect executed.
    await waitFor(() => {
      expect(result.current.language).toBe('en')
    })

    // Key lookup works in the resolved language
    expect(result.current.t('auth.login')).toBe('Login')
    expect(result.current.t('nav.home')).toBe('Home')
    expect(result.current.t('common.save')).toBe('Save')
  })

  it('returns the key string itself for missing keys (fallback safety)', async () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <I18nProvider initialLanguage="en">{children}</I18nProvider>,
    })
    expect(result.current.t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('t() returns English strings when language is "en"', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <I18nProvider initialLanguage="en">{children}</I18nProvider>,
    })
    expect(result.current.language).toBe('en')
    expect(result.current.t('auth.login')).toBe('Login')
    expect(result.current.t('auth.register')).toBe('Register')
    expect(result.current.t('common.save')).toBe('Save')
  })

  it('t() returns Arabic strings when language is "ar"', () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <I18nProvider initialLanguage="ar">{children}</I18nProvider>,
    })
    expect(result.current.language).toBe('ar')
    expect(result.current.t('auth.login')).toBe('تسجيل الدخول')
    expect(result.current.t('common.cancel')).toBe('إلغاء')
  })

  // ─── T017-B: Language switching ──────────────────────────────────────────
  it('setLanguage switches language synchronously', async () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <I18nProvider initialLanguage="en">{children}</I18nProvider>,
    })

    expect(result.current.language).toBe('en')

    act(() => {
      result.current.setLanguage('ar')
    })

    expect(result.current.language).toBe('ar')
    expect(result.current.t('auth.login')).toBe('تسجيل الدخول')
  })

  it('setLanguage updates document dir attribute', async () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: ({ children }) => <I18nProvider initialLanguage="en">{children}</I18nProvider>,
    })

    // en → ltr
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'))

    act(() => { result.current.setLanguage('ar') })

    // ar → rtl
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'))
  })

  // ─── T017-C: Profile integration (requires local Supabase + Docker) ──────
  it.skipIf(!supabaseReachable)(
    'reads preferred_language from profile for a logged-in user',
    async () => {
      const email = `i18n-${crypto.randomUUID()}@testo.local`
      const { data: { user }, error: signUpError } = await signUp(email, 'Password123!')
      expect(signUpError).toBeNull()
      testUserId = user?.id

      // Set preferred_language to 'en' in profiles table
      await adminClient.from('profiles').update({ preferred_language: 'en' }).eq('id', testUserId!)

      const { result } = renderHook(() => useTranslation(), {
        wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
      })

      await waitFor(() => {
        expect(result.current.language).toBe('en')
      }, { timeout: 10000 })
    },
  )
})
